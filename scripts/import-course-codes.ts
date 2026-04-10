/**
 * Import course codes (科目內碼) into modules_data.json
 *
 * Usage:
 *   npx tsx scripts/import-course-codes.ts           # Generate match report
 *   npx tsx scripts/import-course-codes.ts --apply    # Apply codes to modules_data.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCourseCodeExcel, read4DeptExcel } from './lib/excel-reader.ts'
import {
  normalizeForMatching,
  extractChineseName,
  stripTrailingNumeral,
  normalizeEnglish,
} from './lib/normalize.ts'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const MODULES_JSON = resolve(PROJECT_ROOT, 'modules_data.json')
const COURSE_CODE_EXCEL = resolve(PROJECT_ROOT, '科目內碼-20260410.xlsx')
const FOUR_DEPT_EXCEL = resolve(PROJECT_ROOT, '20260410-4dept.xlsx')
const OUTPUT_DIR = resolve(__dirname, 'output')
const REPORT_JSON = resolve(OUTPUT_DIR, 'match-report.json')
const REPORT_MD = resolve(OUTPUT_DIR, 'match-report.md')
const RESOLUTIONS_JSON = resolve(OUTPUT_DIR, 'manual-resolutions.json')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MatchStrategy =
  | 'exact'
  | 'normalized'
  | 'extracted_zh'
  | 'suffix_stripped'
  | 'unresolved'

type MatchStatus = 'auto' | 'ambiguous' | 'unresolved'

interface MatchResult {
  readonly course_name: string
  readonly course_name_en: string
  readonly offering_unit: string
  readonly modules: readonly string[]
  readonly strategy: MatchStrategy
  readonly matched_codes: readonly string[]
  readonly assigned_code: string | null
  readonly status: MatchStatus
  readonly normalized_to?: string
  readonly disambiguation_detail?: string
}

interface MatchReport {
  readonly generated_at: string
  readonly summary: {
    readonly total_unique_names: number
    readonly auto_matched: number
    readonly ambiguous: number
    readonly unresolved: number
  }
  readonly results: readonly MatchResult[]
}

// ---------------------------------------------------------------------------
// Disambiguation indexes
// ---------------------------------------------------------------------------
interface ExcelEntry {
  readonly code: string
  readonly name_zh: string
  readonly name_en: string
}

/** Build code → English name map from Excel */
function buildCodeToEnglish(entries: readonly ExcelEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of entries) {
    map.set(e.code, e.name_en)
  }
  return map
}

/** Build course_name → Set<code> from 4dept student records */
function build4DeptCodeUsage(
  filePath: string,
): Map<string, Set<string>> {
  const records = read4DeptExcel(filePath)
  const usage = new Map<string, Set<string>>()
  for (const r of records) {
    const key = r.course_name.trim()
    const existing = usage.get(key) ?? new Set<string>()
    existing.add(r.course_code)
    usage.set(key, existing)
  }
  return usage
}

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------

interface ModuleCourseInfo {
  readonly name_zh: string
  readonly name_en: string
  readonly offering_unit: string
  readonly modules: string[]
}

function collectModuleCourses(modulesData: Record<string, any>): Map<string, ModuleCourseInfo> {
  const courseMap = new Map<string, ModuleCourseInfo>()

  for (const [moduleKey, moduleData] of Object.entries(modulesData)) {
    const courses = moduleData?.模組總表?.課程規劃內容 ?? []
    for (const c of courses) {
      const name = (c.課程名稱_中文 ?? '').trim()
      if (!name) continue
      const existing = courseMap.get(name)
      if (existing) {
        existing.modules.push(moduleKey)
      } else {
        courseMap.set(name, {
          name_zh: name,
          name_en: (c.課程名稱_英文 ?? '').trim(),
          offering_unit: (c.開課單位 ?? '').trim(),
          modules: [moduleKey],
        })
      }
    }
  }
  return courseMap
}

function buildExcelIndexes(entries: readonly ExcelEntry[]): {
  readonly byExactName: Map<string, string[]>
  readonly byNormalizedName: Map<string, string[]>
  readonly codeToEntry: Map<string, ExcelEntry>
} {
  const byExactName = new Map<string, string[]>()
  const byNormalizedName = new Map<string, string[]>()
  const codeToEntry = new Map<string, ExcelEntry>()

  for (const e of entries) {
    codeToEntry.set(e.code, e)

    // Exact name index
    const exact = e.name_zh
    const exactList = byExactName.get(exact) ?? []
    exactList.push(e.code)
    byExactName.set(exact, exactList)

    // Normalized name index
    const norm = normalizeForMatching(e.name_zh)
    const normList = byNormalizedName.get(norm) ?? []
    normList.push(e.code)
    byNormalizedName.set(norm, normList)
  }

  return { byExactName, byNormalizedName, codeToEntry }
}

/**
 * Try to disambiguate multiple candidate codes using English name and 4dept data.
 * Returns the single best code, or null if still ambiguous.
 */
function tryDisambiguate(
  candidateCodes: readonly string[],
  courseInfo: ModuleCourseInfo,
  codeToEntry: Map<string, ExcelEntry>,
  deptUsage: Map<string, Set<string>>,
): { code: string | null; detail: string } {
  const steps: string[] = []

  // Strategy 0: Prefer digit codes over N-prefix codes
  // Student records use digit codes 99.97% of the time
  const digitCodes = candidateCodes.filter(c => /^\d/.test(c))
  const nCodes = candidateCodes.filter(c => c.startsWith('N'))
  if (digitCodes.length >= 1 && nCodes.length >= 1) {
    if (digitCodes.length === 1) {
      steps.push(`digit+N 自動選數字碼: ${digitCodes[0]} (排除 N碼: ${nCodes.join(', ')})`)
      return { code: digitCodes[0], detail: steps.join('; ') }
    }
    // Multiple digit codes — continue with only digit codes
    steps.push(`排除 N碼 ${nCodes.join(', ')}，剩餘數字碼: ${digitCodes.join(', ')}`)
    return tryDisambiguateInner(digitCodes, courseInfo, codeToEntry, deptUsage, steps)
  }

  return tryDisambiguateInner(candidateCodes, courseInfo, codeToEntry, deptUsage, steps)
}

function tryDisambiguateInner(
  candidateCodes: readonly string[],
  courseInfo: ModuleCourseInfo,
  codeToEntry: Map<string, ExcelEntry>,
  deptUsage: Map<string, Set<string>>,
  steps: string[],
): { code: string | null; detail: string } {
  // Strategy A: English name comparison
  if (courseInfo.name_en) {
    const targetEn = normalizeEnglish(courseInfo.name_en)
    if (targetEn.length > 0) {
      const enMatches = candidateCodes.filter(code => {
        const entry = codeToEntry.get(code)
        if (!entry) return false
        return normalizeEnglish(entry.name_en) === targetEn
      })
      if (enMatches.length === 1) {
        steps.push(`英文名稱精確匹配: ${enMatches[0]}`)
        return { code: enMatches[0], detail: steps.join('; ') }
      }
      if (enMatches.length > 1) {
        steps.push(`英文名稱匹配到 ${enMatches.length} 個: ${enMatches.join(', ')}`)
        // Narrow down for next strategy
        return tryDisambiguateWithDept(enMatches, courseInfo, deptUsage, steps)
      }
      steps.push('英文名稱無精確匹配')
    }
  }

  // Strategy B: 4dept cross-reference
  return tryDisambiguateWithDept(candidateCodes, courseInfo, deptUsage, steps)
}

function tryDisambiguateWithDept(
  candidateCodes: readonly string[],
  courseInfo: ModuleCourseInfo,
  deptUsage: Map<string, Set<string>>,
  steps: string[],
): { code: string | null; detail: string } {
  const usedCodes = deptUsage.get(courseInfo.name_zh)
  if (usedCodes && usedCodes.size > 0) {
    const overlap = candidateCodes.filter(c => usedCodes.has(c))
    if (overlap.length === 1) {
      steps.push(`4dept 學生資料驗證: ${overlap[0]}`)
      return { code: overlap[0], detail: steps.join('; ') }
    }
    if (overlap.length > 1) {
      steps.push(`4dept 匹配到 ${overlap.length} 個: ${overlap.join(', ')}`)
    } else {
      steps.push('4dept 無匹配')
    }
  } else {
    steps.push('4dept 無此課程紀錄')
  }

  return { code: null, detail: steps.join('; ') }
}

function matchCourses(
  moduleCourses: Map<string, ModuleCourseInfo>,
  excelEntries: readonly ExcelEntry[],
  deptUsage: Map<string, Set<string>>,
): readonly MatchResult[] {
  const { byExactName, byNormalizedName, codeToEntry } = buildExcelIndexes(excelEntries)
  const results: MatchResult[] = []

  for (const [name, info] of moduleCourses) {
    // --- Layer 1: Exact match ---
    const exactCodes = byExactName.get(name)
    if (exactCodes && exactCodes.length > 0) {
      if (exactCodes.length === 1) {
        results.push({
          course_name: name,
          course_name_en: info.name_en,
          offering_unit: info.offering_unit,
          modules: info.modules,
          strategy: 'exact',
          matched_codes: exactCodes,
          assigned_code: exactCodes[0],
          status: 'auto',
        })
        continue
      }
      // Multiple codes → try disambiguation
      const { code, detail } = tryDisambiguate(exactCodes, info, codeToEntry, deptUsage)
      results.push({
        course_name: name,
        course_name_en: info.name_en,
        offering_unit: info.offering_unit,
        modules: info.modules,
        strategy: 'exact',
        matched_codes: exactCodes,
        assigned_code: code,
        status: code ? 'auto' : 'ambiguous',
        disambiguation_detail: detail,
      })
      continue
    }

    // --- Layer 2: Normalized match ---
    const normName = normalizeForMatching(name)
    const normCodes = byNormalizedName.get(normName)
    if (normCodes && normCodes.length > 0) {
      if (normCodes.length === 1) {
        results.push({
          course_name: name,
          course_name_en: info.name_en,
          offering_unit: info.offering_unit,
          modules: info.modules,
          strategy: 'normalized',
          matched_codes: normCodes,
          assigned_code: normCodes[0],
          status: 'auto',
          normalized_to: normName,
        })
        continue
      }
      const { code, detail } = tryDisambiguate(normCodes, info, codeToEntry, deptUsage)
      results.push({
        course_name: name,
        course_name_en: info.name_en,
        offering_unit: info.offering_unit,
        modules: info.modules,
        strategy: 'normalized',
        matched_codes: normCodes,
        assigned_code: code,
        status: code ? 'auto' : 'ambiguous',
        normalized_to: normName,
        disambiguation_detail: detail,
      })
      continue
    }

    // --- Layer 2b: Extract Chinese name from dual-language format ---
    const extracted = extractChineseName(name)
    if (extracted) {
      const extNorm = normalizeForMatching(extracted)
      const extCodes = byNormalizedName.get(extNorm) ?? byExactName.get(extracted)
      if (extCodes && extCodes.length > 0) {
        if (extCodes.length === 1) {
          results.push({
            course_name: name,
            course_name_en: info.name_en,
            offering_unit: info.offering_unit,
            modules: info.modules,
            strategy: 'extracted_zh',
            matched_codes: extCodes,
            assigned_code: extCodes[0],
            status: 'auto',
            normalized_to: extracted,
          })
          continue
        }
        const { code, detail } = tryDisambiguate(extCodes, info, codeToEntry, deptUsage)
        results.push({
          course_name: name,
          course_name_en: info.name_en,
          offering_unit: info.offering_unit,
          modules: info.modules,
          strategy: 'extracted_zh',
          matched_codes: extCodes,
          assigned_code: code,
          status: code ? 'auto' : 'ambiguous',
          normalized_to: extracted,
          disambiguation_detail: detail,
        })
        continue
      }
    }

    // --- Layer 3: Strip trailing numeral ---
    const stripped = stripTrailingNumeral(normalizeForMatching(name))
    if (stripped) {
      const stripCodes = byNormalizedName.get(stripped)
      if (stripCodes && stripCodes.length > 0) {
        if (stripCodes.length === 1) {
          results.push({
            course_name: name,
            course_name_en: info.name_en,
            offering_unit: info.offering_unit,
            modules: info.modules,
            strategy: 'suffix_stripped',
            matched_codes: stripCodes,
            assigned_code: stripCodes[0],
            status: 'auto',
            normalized_to: stripped,
          })
          continue
        }
        const { code, detail } = tryDisambiguate(stripCodes, info, codeToEntry, deptUsage)
        results.push({
          course_name: name,
          course_name_en: info.name_en,
          offering_unit: info.offering_unit,
          modules: info.modules,
          strategy: 'suffix_stripped',
          matched_codes: stripCodes,
          assigned_code: code,
          status: code ? 'auto' : 'ambiguous',
          normalized_to: stripped,
          disambiguation_detail: detail,
        })
        continue
      }
    }

    // --- Unresolved ---
    results.push({
      course_name: name,
      course_name_en: info.name_en,
      offering_unit: info.offering_unit,
      modules: info.modules,
      strategy: 'unresolved',
      matched_codes: [],
      assigned_code: null,
      status: 'unresolved',
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(results: readonly MatchResult[]): MatchReport {
  const auto = results.filter(r => r.status === 'auto')
  const ambiguous = results.filter(r => r.status === 'ambiguous')
  const unresolved = results.filter(r => r.status === 'unresolved')

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_unique_names: results.length,
      auto_matched: auto.length,
      ambiguous: ambiguous.length,
      unresolved: unresolved.length,
    },
    results,
  }
}

function generateMarkdown(report: MatchReport): string {
  const lines: string[] = []
  lines.push('# 科目內碼匹配報告')
  lines.push('')
  lines.push(`生成時間: ${report.generated_at}`)
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push(`| 類別 | 數量 |`)
  lines.push(`|------|------|`)
  lines.push(`| 唯一課程名稱 | ${report.summary.total_unique_names} |`)
  lines.push(`| ✅ 自動匹配 | ${report.summary.auto_matched} |`)
  lines.push(`| ⚠️ 需人工選擇 | ${report.summary.ambiguous} |`)
  lines.push(`| ❌ 未解決 | ${report.summary.unresolved} |`)
  lines.push('')

  // Auto-matched (collapsed for readability)
  const auto = report.results.filter(r => r.status === 'auto')
  lines.push('## ✅ 自動匹配')
  lines.push('')
  lines.push('| 課程名稱 | 內碼 | 策略 | 備註 |')
  lines.push('|----------|------|------|------|')
  for (const r of auto) {
    const note = r.disambiguation_detail ?? r.normalized_to ?? ''
    lines.push(`| ${r.course_name} | ${r.assigned_code} | ${r.strategy} | ${note} |`)
  }
  lines.push('')

  // Ambiguous
  const ambiguous = report.results.filter(r => r.status === 'ambiguous')
  if (ambiguous.length > 0) {
    lines.push('## ⚠️ 需人工選擇（同名多碼）')
    lines.push('')
    for (const r of ambiguous) {
      lines.push(`### ${r.course_name}`)
      lines.push(`- 英文: ${r.course_name_en}`)
      lines.push(`- 開課單位: ${r.offering_unit}`)
      lines.push(`- 所屬模組: ${r.modules.join(', ')}`)
      lines.push(`- 候選內碼: ${r.matched_codes.join(', ')}`)
      lines.push(`- 消歧結果: ${r.disambiguation_detail ?? '無'}`)
      lines.push(`- 策略: ${r.strategy}${r.normalized_to ? ` (→ ${r.normalized_to})` : ''}`)
      lines.push('')
    }
  }

  // Unresolved
  const unresolved = report.results.filter(r => r.status === 'unresolved')
  if (unresolved.length > 0) {
    lines.push('## ❌ 未解決')
    lines.push('')
    lines.push('| 課程名稱 | 英文名稱 | 開課單位 | 所屬模組 |')
    lines.push('|----------|----------|----------|----------|')
    for (const r of unresolved) {
      lines.push(`| ${r.course_name} | ${r.course_name_en} | ${r.offering_unit} | ${r.modules.join(', ')} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function generateResolutionTemplate(report: MatchReport): Record<string, string | null> {
  const template: Record<string, string | null> = {}
  for (const r of report.results) {
    if (r.status === 'ambiguous' || r.status === 'unresolved') {
      template[r.course_name] = null
    }
  }
  return template
}

// ---------------------------------------------------------------------------
// Apply mode
// ---------------------------------------------------------------------------

function applyToModulesData(
  report: MatchReport,
  resolutions: Record<string, string | null>,
): void {
  // Build name → code map from auto results + manual resolutions
  const codeMap = new Map<string, string>()
  for (const r of report.results) {
    if (r.status === 'auto' && r.assigned_code) {
      codeMap.set(r.course_name, r.assigned_code)
    }
  }
  for (const [name, code] of Object.entries(resolutions)) {
    if (code) {
      codeMap.set(name, code)
    }
  }

  // Read and modify modules_data.json
  const raw = readFileSync(MODULES_JSON, 'utf-8')
  const data = JSON.parse(raw) as Record<string, any>

  let applied = 0
  let skipped = 0
  let notFound = 0

  for (const moduleData of Object.values(data)) {
    const courses = moduleData?.模組總表?.課程規劃內容
    if (!Array.isArray(courses)) continue

    for (const course of courses) {
      const name = (course.課程名稱_中文 ?? '').trim()
      if (!name) continue

      // Idempotent: don't overwrite existing
      if (course.課程代碼) {
        skipped++
        continue
      }

      const code = codeMap.get(name)
      if (code) {
        course.課程代碼 = code
        applied++
      } else {
        notFound++
      }
    }
  }

  // Write back
  writeFileSync(MODULES_JSON, JSON.stringify(data, null, 2) + '\n', 'utf-8')

  console.log('\n=== 套用結果 ===')
  console.log(`✅ 已套用: ${applied} 門課程`)
  console.log(`⏭️  已有碼跳過: ${skipped} 門`)
  console.log(`❌ 無匹配碼: ${notFound} 門`)
  console.log(`\nmodules_data.json 已更新`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const isApply = process.argv.includes('--apply')

  mkdirSync(OUTPUT_DIR, { recursive: true })

  if (isApply) {
    console.log('=== Apply mode ===')
    console.log('讀取匹配報告...')
    const reportRaw = readFileSync(REPORT_JSON, 'utf-8')
    const report = JSON.parse(reportRaw) as MatchReport

    let resolutions: Record<string, string | null> = {}
    try {
      const resRaw = readFileSync(RESOLUTIONS_JSON, 'utf-8')
      resolutions = JSON.parse(resRaw) as Record<string, string | null>
      console.log(`已載入 ${Object.keys(resolutions).length} 筆人工決定`)
    } catch {
      console.log('未找到 manual-resolutions.json，僅套用自動匹配結果')
    }

    applyToModulesData(report, resolutions)
    return
  }

  // Report mode
  console.log('=== 匹配報告模式 ===')
  console.log('讀取科目內碼 Excel...')
  const excelEntries = readCourseCodeExcel(COURSE_CODE_EXCEL)
  console.log(`  載入 ${excelEntries.length} 筆課程代碼`)

  console.log('讀取 4dept 學生資料...')
  const deptUsage = build4DeptCodeUsage(FOUR_DEPT_EXCEL)
  console.log(`  載入 ${deptUsage.size} 個不同課程名稱的修課紀錄`)

  console.log('讀取 modules_data.json...')
  const raw = readFileSync(MODULES_JSON, 'utf-8')
  const modulesData = JSON.parse(raw) as Record<string, any>
  const moduleCourses = collectModuleCourses(modulesData)
  console.log(`  載入 ${moduleCourses.size} 個唯一課程名稱（來自 ${Object.keys(modulesData).length} 個模組）`)

  console.log('\n開始匹配...')
  const results = matchCourses(moduleCourses, excelEntries, deptUsage)
  const report = generateReport(results)

  // Write outputs
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf-8')
  console.log(`  ✅ 報告已寫入: ${REPORT_JSON}`)

  const md = generateMarkdown(report)
  writeFileSync(REPORT_MD, md, 'utf-8')
  console.log(`  ✅ 可讀報告: ${REPORT_MD}`)

  const template = generateResolutionTemplate(report)
  const needsManual = Object.keys(template).length
  if (needsManual > 0) {
    writeFileSync(RESOLUTIONS_JSON, JSON.stringify(template, null, 2) + '\n', 'utf-8')
    console.log(`  ✅ 人工決定模板: ${RESOLUTIONS_JSON} (${needsManual} 筆待填)`)
  }

  // Summary
  console.log('\n=== 匹配摘要 ===')
  console.log(`  唯一課程: ${report.summary.total_unique_names}`)
  console.log(`  ✅ 自動匹配: ${report.summary.auto_matched}`)
  console.log(`  ⚠️  需人工: ${report.summary.ambiguous}`)
  console.log(`  ❌ 未解決: ${report.summary.unresolved}`)

  if (needsManual > 0) {
    console.log(`\n下一步:`)
    console.log(`  1. 查看 scripts/output/match-report.md`)
    console.log(`  2. 編輯 scripts/output/manual-resolutions.json 填入選定的碼`)
    console.log(`  3. 執行 npx tsx scripts/import-course-codes.ts --apply`)
  } else {
    console.log(`\n所有課程已自動匹配！可直接執行:`)
    console.log(`  npx tsx scripts/import-course-codes.ts --apply`)
  }
}

main()
