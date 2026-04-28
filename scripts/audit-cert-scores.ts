/**
 * Audit certificate score correctness.
 *
 * For every passing (student, module) pair, walks each row of the cert's
 * course detail table and lists the student's full raw Excel records for
 * that course. Flags 4 risk categories where the printed score may not
 * be the "right" one.
 *
 * Output:
 *   scripts/output/cert-audit.md
 *   scripts/output/cert-audit.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadModules } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import { buildCertContext } from '../src/cert-generator.ts'
import { read4DeptExcel } from './lib/excel-reader.ts'
import type { Module, StudentCourse, StudentInfo } from '../src/models.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const MODULES_JSON = resolve(PROJECT_ROOT, 'modules_data.json')
const EXCEL_PATH = resolve(PROJECT_ROOT, '20260420.xlsx')
const OUTPUT_DIR = resolve(__dirname, 'output')

function isPassingGrade(grade: string): boolean {
  if (grade === 'Y' || grade === 'P') return true
  if (grade === '' || grade === 'N' || grade === 'I') return false
  const n = Number(grade)
  return !isNaN(n) && n >= 60
}

interface RawRecord {
  semester: string
  course_code: string
  credits: number
  grade: string
}

interface CertRowAudit {
  module_course_name: string
  printed_credits: number | string
  printed_score: string
  module_codes: readonly string[] | undefined
  module_remark: string | null
  raw_records: RawRecord[]   // ALL raw passing records that could match
  flags: {
    is_two_semester: boolean
    has_retake: boolean
    has_multi_code: boolean
    is_pass_fail: boolean
    /** A ≥2 record set with **different** grades — high risk of mis-print */
    grade_mismatch: boolean
  }
}

interface CertAudit {
  student_id: string
  student_name: string
  student_dept: string
  module_key: string
  module_name: string
  rows: CertRowAudit[]
  /** Did at least one row trigger any flag? */
  has_any_flag: boolean
}

function loadStudents(): Map<string, StudentInfo & { rawCourses: StudentCourse[] }> {
  const records = read4DeptExcel(EXCEL_PATH)
  const sm = new Map<string, StudentInfo & { rawCourses: StudentCourse[] }>()
  for (const r of records) {
    if (!isPassingGrade(r.grade)) continue
    let s = sm.get(r.student_id)
    if (!s) {
      s = {
        student_id: r.student_id, name: r.name, department: r.department,
        courses: [], rawCourses: [],
      } as StudentInfo & { rawCourses: StudentCourse[] }
      sm.set(r.student_id, s)
    }
    const sc: StudentCourse = {
      name: r.course_name, credits: r.credits,
      semester: `${r.year}-${r.semester}`, course_code: r.course_code, grade: r.grade,
    }
    ;(s.courses as StudentCourse[]).push(sc)
    s.rawCourses.push(sc)
  }
  return sm
}

function auditOne(
  student: StudentInfo & { rawCourses: StudentCourse[] },
  mod: Module,
): CertAudit | null {
  const result = verifyModule(mod, student.courses)
  if (!result.is_certified) return null
  const ctx = buildCertContext(student, mod, result, new Date())
  const rows: CertRowAudit[] = []
  for (const r of ctx.courses) {
    const mc = mod.all_courses.find(c => c.name_zh === r.name_zh)
    const codes = mc?.course_codes
    // Find every raw student record that could match this module course
    const raw = student.rawCourses.filter(rc => {
      if (codes && codes.length > 0) return rc.course_code && codes.includes(rc.course_code)
      return rc.name === r.name_zh
    })
    const grades = new Set(raw.map(rc => rc.grade ?? ''))
    rows.push({
      module_course_name: r.name_zh,
      printed_credits: r.credits,
      printed_score: r.score,
      module_codes: codes,
      module_remark: mc?.remark ?? null,
      raw_records: raw.map(rc => ({
        semester: rc.semester ?? '',
        course_code: rc.course_code ?? '',
        credits: rc.credits, grade: rc.grade ?? '',
      })),
      flags: {
        is_two_semester: !!(mc?.remark?.includes('選修兩學期')),
        has_retake: raw.length >= 2 && new Set(raw.map(rc => rc.semester)).size === raw.length === false ? false : new Set(raw.map(rc => rc.course_code + '|' + rc.semester)).size < raw.length,
        has_multi_code: (codes?.length ?? 0) >= 2,
        is_pass_fail: r.score === 'Y' || r.score === 'P',
        grade_mismatch: grades.size >= 2,
      },
    })
  }
  return {
    student_id: student.student_id,
    student_name: student.name,
    student_dept: student.department,
    module_key: mod.key,
    module_name: mod.name_zh,
    rows,
    has_any_flag: rows.some(row => Object.values(row.flags).some(Boolean)),
  }
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  console.log('[cert-audit] loading modules…')
  const modules = loadModules(MODULES_JSON)
  console.log('[cert-audit] loading students…')
  const students = loadStudents()
  console.log(`[cert-audit] ${modules.length} modules, ${students.size} students`)

  const audits: CertAudit[] = []
  for (const s of students.values()) {
    for (const mod of modules) {
      const a = auditOne(s, mod)
      if (a) audits.push(a)
    }
  }
  console.log(`[cert-audit] ${audits.length} passing certs total`)

  // Aggregate flag counts
  const flagged = audits.filter(a => a.has_any_flag)
  const counts = {
    is_two_semester: 0, has_retake: 0, has_multi_code: 0,
    is_pass_fail: 0, grade_mismatch: 0,
  }
  for (const a of flagged) {
    for (const row of a.rows) {
      for (const [k, v] of Object.entries(row.flags)) {
        if (v) counts[k as keyof typeof counts]++
      }
    }
  }

  const lines: string[] = []
  lines.push('# 證書印製分數稽核報告')
  lines.push('')
  lines.push(`生成時間: ${new Date().toISOString()}`)
  lines.push(`掃描範圍: ${audits.length} 張可發證書 × 各自課程明細`)
  lines.push('')
  lines.push('## 風險旗標命中量')
  lines.push('')
  lines.push(`| Flag | 說明 | 命中(row × cert)|`)
  lines.push(`|------|------|------|`)
  lines.push(`| **grade_mismatch** | 同一模組課程有 ≥2 個不同分數,印了哪個? | **${counts.grade_mismatch}** |`)
  lines.push(`| is_two_semester | 模組備註含「選修兩學期」 | ${counts.is_two_semester} |`)
  lines.push(`| has_retake | 學生有重修紀錄(≥2 筆同 code 同學期或不同學期通過)| ${counts.has_retake} |`)
  lines.push(`| has_multi_code | 模組課定義 ≥2 個 course_codes | ${counts.has_multi_code} |`)
  lines.push(`| is_pass_fail | 印「Y」或「P」字母而非數字分數 | ${counts.is_pass_fail} |`)
  lines.push('')
  lines.push(`**有任一旗標的 cert 數**: ${flagged.length} / ${audits.length} (${(flagged.length/audits.length*100).toFixed(1)}%)`)
  lines.push('')

  // 高風險:grade_mismatch — 印的分數可能不是學生最好/最新/期望的那筆
  const highRisk = audits.flatMap(a =>
    a.rows.filter(r => r.flags.grade_mismatch).map(r => ({ a, r }))
  ).sort((x, y) =>
    Math.max(...y.r.raw_records.map(r => Number(r.grade) || 0)) -
    Math.max(...x.r.raw_records.map(r => Number(r.grade) || 0))
  )

  lines.push('## 🔴 grade_mismatch 高風險清單')
  lines.push('')
  if (highRisk.length === 0) {
    lines.push('無。所有 cert 中印的分數都是該學生對該課程**唯一**的通過分數。')
  } else {
    lines.push(`共 ${highRisk.length} 筆。每筆 cert 印出的分數,跟學生對該課的所有原始通過紀錄並列:`)
    lines.push('')
    lines.push(`| 學生 | 模組 | 課程 | cert 印分 | 學生原始紀錄(學期 / code / grade)| Flags |`)
    lines.push(`|------|------|------|---------|------|------|`)
    for (const { a, r } of highRisk.slice(0, 100)) {
      const raw = r.raw_records.map(rc => `${rc.semester}/${rc.course_code}=${rc.grade}`).join(' • ')
      const flagList = Object.entries(r.flags).filter(([_, v]) => v).map(([k]) => k).join(',')
      lines.push(`| ${a.student_name}(${a.student_id})| ${a.module_name} | ${r.module_course_name} | **${r.printed_score}** (${r.printed_credits} 學分) | ${raw} | ${flagList} |`)
    }
    if (highRisk.length > 100) {
      lines.push(`| _… 共 ${highRisk.length} 筆,僅列前 100 筆;完整見 cert-audit.json_ |`)
    }
  }
  lines.push('')

  // Two-semester courses (high concern even without grade mismatch)
  const twoSem = audits.flatMap(a =>
    a.rows.filter(r => r.flags.is_two_semester).map(r => ({ a, r }))
  )
  lines.push('## 🟡 選修兩學期課程清單(學分為兩學期合計,但 cert 只印一個分數)')
  lines.push('')
  if (twoSem.length === 0) {
    lines.push('無。')
  } else {
    lines.push(`共 ${twoSem.length} 筆。建議顯示兩學期分數(如 "78 / 82"):`)
    lines.push('')
    lines.push(`| 學生 | 模組 | 課程 | 印分 | 兩學期實際分數 |`)
    lines.push(`|------|------|------|------|---------------|`)
    for (const { a, r } of twoSem.slice(0, 50)) {
      const raw = r.raw_records.map(rc => `${rc.semester}=${rc.grade}`).join(' / ')
      lines.push(`| ${a.student_name}(${a.student_id})| ${a.module_name} | ${r.module_course_name} | **${r.printed_score}** | ${raw} |`)
    }
    if (twoSem.length > 50) lines.push(`| _… 共 ${twoSem.length} 筆,僅列前 50_ |`)
  }
  lines.push('')

  // Pass/Fail
  const passFail = audits.flatMap(a =>
    a.rows.filter(r => r.flags.is_pass_fail).map(r => ({ a, r }))
  )
  lines.push('## 🟢 印「Y/P」字母的成績(抵免/通過)')
  lines.push('')
  lines.push(`共 ${passFail.length} 筆。建議顯示成「抵免」/「通過」:`)
  lines.push('')
  if (passFail.length > 0) {
    lines.push(`| 學生 | 模組 | 課程 | 印分 |`)
    lines.push(`|------|------|------|------|`)
    for (const { a, r } of passFail.slice(0, 30)) {
      lines.push(`| ${a.student_name}(${a.student_id})| ${a.module_name} | ${r.module_course_name} | **${r.printed_score}** |`)
    }
    if (passFail.length > 30) lines.push(`| _… 共 ${passFail.length} 筆_ |`)
  }
  lines.push('')

  writeFileSync(resolve(OUTPUT_DIR, 'cert-audit.md'), lines.join('\n'), 'utf-8')
  writeFileSync(resolve(OUTPUT_DIR, 'cert-audit.json'),
    JSON.stringify({ counts, flagged_count: flagged.length, total: audits.length, audits }, null, 2),
    'utf-8')
  console.log('[cert-audit] wrote scripts/output/cert-audit.md + .json')
  console.log(`[cert-audit] highRisk grade_mismatch: ${highRisk.length}`)
  console.log(`[cert-audit] two_semester rows:        ${twoSem.length}`)
  console.log(`[cert-audit] pass_fail rows:           ${passFail.length}`)
}

main()
