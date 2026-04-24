/**
 * Audit potential false positive certifications.
 * Scans already-passing (student, module) pairs for 4 categories of
 * suspicious signals:
 *   1. Free-text advisory in remarks that verifier doesn't enforce
 *      (「不得以」、「只承認」、「先修」)
 *   2. Substitute group double-counting (primary + substitute all counted)
 *   3. Course codes that map to multiple distinct names across modules
 *   4. Remarks hinting at "認列某學期" without the `認列學期` structured field
 *
 * Pure analysis — does not modify modules_data.json or anything else.
 * Writes:
 *   - scripts/output/false-positive-report.md
 *   - scripts/output/false-positive-report.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadModules } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import { read4DeptExcel } from './lib/excel-reader.ts'
import type { Module, StudentCourse, VerificationResult } from '../src/models.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const MODULES_JSON = resolve(PROJECT_ROOT, 'modules_data.json')
const EXCEL_PATH = resolve(PROJECT_ROOT, '20260420.xlsx')
const OUTPUT_DIR = resolve(__dirname, 'output')
const REPORT_MD = resolve(OUTPUT_DIR, 'false-positive-report.md')
const REPORT_JSON = resolve(OUTPUT_DIR, 'false-positive-report.json')

function isPassingGrade(grade: string): boolean {
  if (grade === 'Y' || grade === 'P') return true
  if (grade === '' || grade === 'N' || grade === 'I') return false
  const n = Number(grade)
  return !isNaN(n) && n >= 60
}

interface StudentRecord {
  readonly student_id: string
  readonly name: string
  readonly department: string
  readonly courses: StudentCourse[]
}

function loadStudents(): Map<string, StudentRecord> {
  const records = read4DeptExcel(EXCEL_PATH)
  const sm = new Map<string, StudentRecord>()
  for (const r of records) {
    if (!isPassingGrade(r.grade)) continue
    let s = sm.get(r.student_id)
    if (!s) {
      s = { student_id: r.student_id, name: r.name, department: r.department, courses: [] }
      sm.set(r.student_id, s)
    }
    s.courses.push({
      name: r.course_name, credits: r.credits,
      semester: `${r.year}-${r.semester}`, course_code: r.course_code, grade: r.grade,
    })
  }
  return sm
}

// ─────────────────────────────────────────────────────────
// Category 4: remarks hinting at 認列 X 學期 without only_semester
// ─────────────────────────────────────────────────────────
interface UnenforcedSemesterHint {
  modKey: string
  courseName: string
  remark: string
  hasOnlySemester: boolean
}
function scanSemesterHints(modules: readonly Module[]): UnenforcedSemesterHint[] {
  const hits: UnenforcedSemesterHint[] = []
  for (const mod of modules) {
    for (const c of mod.all_courses) {
      const r = c.remark ?? ''
      if (!/認列.*(上|下)學期/.test(r)) continue
      hits.push({
        modKey: mod.key, courseName: c.name_zh, remark: r,
        hasOnlySemester: !!c.only_semester,
      })
    }
  }
  return hits
}

// ─────────────────────────────────────────────────────────
// Category 3: course codes with multiple distinct names
// ─────────────────────────────────────────────────────────
interface CodeCollision {
  code: string
  names: string[]
  modules: Record<string, string[]>   // moduleKey → names used
}
function scanCodeCollisions(modules: readonly Module[]): CodeCollision[] {
  const codeToModuleCourses = new Map<string, Map<string, Set<string>>>()
  for (const mod of modules) {
    for (const c of mod.all_courses) {
      for (const code of c.course_codes ?? []) {
        let byMod = codeToModuleCourses.get(code)
        if (!byMod) { byMod = new Map(); codeToModuleCourses.set(code, byMod) }
        let nameSet = byMod.get(mod.key)
        if (!nameSet) { nameSet = new Set(); byMod.set(mod.key, nameSet) }
        nameSet.add(c.name_zh)
      }
    }
  }
  const hits: CodeCollision[] = []
  for (const [code, byMod] of codeToModuleCourses) {
    const allNames = new Set<string>()
    for (const names of byMod.values()) for (const n of names) allNames.add(n)
    if (allNames.size > 1) {
      const modules: Record<string, string[]> = {}
      for (const [k, names] of byMod) modules[k] = [...names]
      hits.push({ code, names: [...allNames], modules })
    }
  }
  return hits
}

// ─────────────────────────────────────────────────────────
// Category 1 + 2: scan each passing (student, module) for suspicious matches
// ─────────────────────────────────────────────────────────
interface SuspiciousPass {
  student_id: string
  student_name: string
  student_dept: string
  mod_key: string
  mod_name: string
  category: 'advisory_不得以' | 'advisory_只承認' | 'advisory_先修' | 'substitute_overcount'
  detail: string
  matched_course: string
  remark: string
}
function scanPassingCerts(
  modules: readonly Module[],
  students: Map<string, StudentRecord>,
): SuspiciousPass[] {
  const hits: SuspiciousPass[] = []

  for (const [sid, s] of students) {
    for (const mod of modules) {
      const r = verifyModule(mod, s.courses)
      if (!r.is_certified) continue

      // Collect matched module course names
      const matchedNames = new Set<string>()
      for (const gr of r.group_results) {
        for (const n of gr.courses_matched) matchedNames.add(n)
      }

      // Category 1: advisory phrases in each matched course's remark
      for (const mc of mod.all_courses) {
        if (!matchedNames.has(mc.name_zh)) continue
        const remark = mc.remark ?? ''
        const base = {
          student_id: sid, student_name: s.name, student_dept: s.department,
          mod_key: mod.key, mod_name: mod.name_zh,
          matched_course: mc.name_zh, remark,
        }
        if (remark.includes('不得以')) hits.push({ ...base, category: 'advisory_不得以',
          detail: '系統未檢查「不得以」排除條款,學生的課程可能違反此規則' })
        if (remark.includes('只承認') || remark.includes('僅承認')) hits.push({ ...base, category: 'advisory_只承認',
          detail: '系統未檢查課程「開課單位」是否符合 remark 指定' })
        if (/先修[『「]/.test(remark)) hits.push({ ...base, category: 'advisory_先修',
          detail: '系統未檢查學生是否已修 remark 指定的先修課' })
      }

      // Category 2: substitute double-count
      const substituteCourses = mod.all_courses.filter(c => /替\s*代\s*課\s*程/.test(c.remark ?? ''))
      const substituteMatched = substituteCourses.filter(c => matchedNames.has(c.name_zh))
      if (substituteMatched.length >= 2) {
        const names = substituteMatched.map(c => c.name_zh)
        hits.push({
          student_id: sid, student_name: s.name, student_dept: s.department,
          mod_key: mod.key, mod_name: mod.name_zh,
          matched_course: names.join(' + '),
          remark: substituteMatched[0].remark ?? '',
          category: 'substitute_overcount',
          detail: `學生同時修了 ${names.length} 門 substitute/primary 關係的課,可能被重複計入 total`,
        })
      }
    }
  }

  return hits
}

// ─────────────────────────────────────────────────────────
// Report generation
// ─────────────────────────────────────────────────────────
function generate(
  hints: readonly UnenforcedSemesterHint[],
  collisions: readonly CodeCollision[],
  suspicious: readonly SuspiciousPass[],
): string {
  const lines: string[] = []
  lines.push('# 過度認證 (False Positive) 稽核報告')
  lines.push('')
  lines.push(`生成時間: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push(`| 類別 | 命中數 |`)
  lines.push(`|------|--------|`)
  const byCat = new Map<string, number>()
  for (const h of suspicious) byCat.set(h.category, (byCat.get(h.category) ?? 0) + 1)
  lines.push(`| 1a. advisory「不得以」未執行 | ${byCat.get('advisory_不得以') ?? 0} 筆(學生×模組) |`)
  lines.push(`| 1b. advisory「只承認 學院」未執行 | ${byCat.get('advisory_只承認') ?? 0} 筆 |`)
  lines.push(`| 1c. advisory「先修」未執行 | ${byCat.get('advisory_先修') ?? 0} 筆 |`)
  lines.push(`| 2. substitute 重複計入 | ${byCat.get('substitute_overcount') ?? 0} 筆 |`)
  lines.push(`| 3. 一碼多課(資料品質) | ${collisions.length} 個 code 多命名 |`)
  lines.push(`| 4. 認列某學期 未結構化 | ${hints.filter(h => !h.hasOnlySemester).length} 筆 |`)
  lines.push('')

  // Category 1 & 2
  const byCategory = new Map<string, SuspiciousPass[]>()
  for (const h of suspicious) {
    const list = byCategory.get(h.category) ?? []
    list.push(h)
    byCategory.set(h.category, list)
  }

  for (const cat of ['advisory_不得以', 'advisory_只承認', 'advisory_先修', 'substitute_overcount']) {
    const list = byCategory.get(cat) ?? []
    if (list.length === 0) continue
    lines.push(`## ${cat}`)
    lines.push('')
    // Group by (mod, course, remark) to condense
    const grouped = new Map<string, SuspiciousPass[]>()
    for (const h of list) {
      const k = `${h.mod_key}::${h.matched_course}::${h.remark.slice(0, 40)}`
      const arr = grouped.get(k) ?? []
      arr.push(h)
      grouped.set(k, arr)
    }
    lines.push(`| 模組 | 課程 | Remark | 受影響學生數 | 代表學生 |`)
    lines.push(`|------|------|--------|-------------|---------|`)
    for (const [, arr] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const first = arr[0]
      const sample = arr.slice(0, 3).map(h => `${h.student_name}(${h.student_id})`).join(', ')
      lines.push(`| ${first.mod_name} | ${first.matched_course} | \`${first.remark.replace(/\|/g, '\\|').slice(0, 60)}\` | **${arr.length}** | ${sample}${arr.length > 3 ? '…' : ''} |`)
    }
    lines.push('')
  }

  // Category 3 — code collisions
  lines.push(`## 3. 一碼多課`)
  lines.push('')
  if (collisions.length === 0) lines.push('無。')
  else {
    lines.push(`| Code | 所有命名 | 跨模組分佈 |`)
    lines.push(`|------|---------|-----------|`)
    for (const c of collisions) {
      const modList = Object.entries(c.modules)
        .map(([k, names]) => `${k.slice(k.indexOf('_')+1)}:${names.join('/')}`)
        .join(' • ')
      lines.push(`| \`${c.code}\` | ${c.names.join(' / ')} | ${modList} |`)
    }
    lines.push('')
  }

  // Category 4 — semester hints
  lines.push(`## 4. 認列單學期 未結構化`)
  lines.push('')
  if (hints.length === 0) lines.push('無。')
  else {
    lines.push(`| 模組 | 課程 | Remark 片段 | 已加 \`認列學期\` 欄位? |`)
    lines.push(`|------|------|------------|------------------------|`)
    for (const h of hints) {
      const snip = h.remark.match(/認列.{0,10}學期/)?.[0] ?? ''
      lines.push(`| ${h.modKey.slice(h.modKey.indexOf('_')+1)} | ${h.courseName} | ${snip} | ${h.hasOnlySemester ? '✓' : '✗'} |`)
    }
    lines.push('')
  }

  // Action recommendations
  lines.push(`## 建議後續處理`)
  lines.push('')
  lines.push(`- **類別 1(advisory)**:校方口頭確認即可,每條規則 3 選 1(加結構化欄位 / 加專用 parse / 接受系統寬鬆)`)
  lines.push(`- **類別 2(substitute)**:目前 0 實害但 logic 有洞,建議在 verifier 層 dedupe primary+substitute 到同一 credit bucket`)
  lines.push(`- **類別 3(一碼多課)**:雙語名稱寫法不一致的可忽略;真正衝突(如 40614 電子學/一/二)要修 \`modules_data.json\``)
  lines.push(`- **類別 4(認列學期)**:將發現的 row 補上 \`"認列學期": "上" | "下"\` 結構化欄位`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('[audit] loading modules…')
  const modules = loadModules(MODULES_JSON)
  console.log(`[audit] ${modules.length} modules loaded`)

  console.log('[audit] loading students…')
  const students = loadStudents()
  console.log(`[audit] ${students.size} students loaded`)

  console.log('[audit] scanning semester hints…')
  const hints = scanSemesterHints(modules)
  console.log(`[audit] ${hints.length} 認列 X 學期 hints (${hints.filter(h => h.hasOnlySemester).length} already structured)`)

  console.log('[audit] scanning code collisions…')
  const collisions = scanCodeCollisions(modules)
  console.log(`[audit] ${collisions.length} codes with >1 distinct name`)

  console.log('[audit] scanning passing (student × module) pairs — this takes a minute…')
  const suspicious = scanPassingCerts(modules, students)
  console.log(`[audit] ${suspicious.length} suspicious pass rows`)

  const md = generate(hints, collisions, suspicious)
  writeFileSync(REPORT_MD, md, 'utf-8')
  writeFileSync(REPORT_JSON, JSON.stringify({ hints, collisions, suspicious }, null, 2), 'utf-8')
  console.log(`[audit] wrote ${REPORT_MD}`)
  console.log(`[audit] wrote ${REPORT_JSON}`)
}

main()
