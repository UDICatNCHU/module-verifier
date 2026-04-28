import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadModules, findModule } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import { buildCertContext, generateCertDocx, renderCertDocx } from '../src/cert-generator.ts'
import type { Module, StudentInfo, StudentCourse } from '../src/models.ts'

const MODULES_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(MODULES_PATH)

function fixtureStudent(): StudentInfo {
  // 動物生產模組: 5 required courses. Pass with concrete grades.
  const courses: StudentCourse[] = [
    { name: '動物科學概論', credits: 2, semester: '110-1', course_code: '37819', grade: '85' },
    { name: '動物科學統計方法', credits: 3, semester: '110-1', course_code: '37805', grade: '88' },
    { name: '動物解剖生理學', credits: 2, semester: '110-1', course_code: '37807', grade: '78' },
    { name: '動物解剖生理學', credits: 2, semester: '110-2', course_code: '37807', grade: '82' },
    { name: '動物育種學', credits: 2, semester: '111-1', course_code: '37845', grade: '90' },
    { name: '動物營養學', credits: 3, semester: '111-2', course_code: '37873', grade: '76' },
  ]
  return { student_id: 'TEST001', name: '王測試', department: '動科系', courses }
}

describe('cert-generator', () => {
  const mod = findModule(modules, '動物科學系_動物生產模組') as Module
  const student = fixtureStudent()
  const result = verifyModule(mod, student.courses)

  it('the fixture student passes 動物生產模組', () => {
    expect(result.is_certified).toBe(true)
  })

  it('buildCertContext fills all placeholders with real values', () => {
    const ctx = buildCertContext(student, mod, result, new Date('2026-04-27T00:00:00+08:00'))
    expect(ctx.name_zh).toBe('王測試')
    expect(ctx.student_id).toBe('TEST001')
    expect(ctx.module_zh).toBe('動物生產模組')
    expect(ctx.date_roc).toBe('115年04月27日')
    expect(ctx.date_iso).toBe('04/27/2026')
    expect(ctx.courses.length).toBe(5)  // all 5 required courses matched
    // Course rows carry the raw grade string
    const stat = ctx.courses.find(c => c.name_zh === '動物科學統計方法')
    expect(stat?.score).toBe('88')
  })

  it('renderCertDocx produces a valid DOCX with placeholders substituted', () => {
    const ctx = buildCertContext(student, mod, result, new Date('2026-04-27T08:00:00+08:00'))
    const buffer = renderCertDocx(ctx)
    // DOCX is a ZIP; opening it should reveal document.xml
    const zip = new PizZip(buffer)
    const docXml = zip.file('word/document.xml')!.asText()
    // Placeholders must all be substituted
    expect(docXml).not.toMatch(/\{[a-z_]+\}/)
    expect(docXml).toContain('王測試')
    expect(docXml).toContain('TEST001')
    expect(docXml).toContain('動物生產模組')
    expect(docXml).toContain('動物科學概論')
    expect(docXml).toContain('動物育種學')
    // Date appears formatted
    expect(docXml).toContain('115年04月27日')
    expect(docXml).toContain('04/27/2026')
  })

  it('generateCertDocx throws when student has not certified', () => {
    const noCourses: StudentInfo = { ...student, courses: [] }
    const r = verifyModule(mod, [])
    expect(r.is_certified).toBe(false)
    expect(() => generateCertDocx(noCourses, mod, r)).toThrow(/not certified/)
  })
})

// ─────────────────────────────────────────────────────────
// SNAPSHOT TESTS — these pin down current cert score behavior so any
// future change surfaces in the diff. They are NOT claims that the
// printed score is the "right" one for every case — see
// docs/CERT_AUDIT.md.
// ─────────────────────────────────────────────────────────

describe('cert score snapshots: 選修兩學期 course', () => {
  const mod = findModule(modules, '生命科學系_動物生理') as Module
  const passingStudent: StudentInfo = {
    student_id: 'TEST_2SEM', name: '兩學期測試', department: '生科系',
    courses: [
      // 4 of the 5 base course requirements + 2-sem 專題研究
      { name: '生物化學', credits: 3, semester: '112-1', course_code: '43527', grade: '78' },
      { name: '生物化學', credits: 3, semester: '112-2', course_code: '43527', grade: '92' },
      { name: '動物生理學', credits: 3, semester: '113-1', course_code: '36624', grade: '85' },
      { name: '動物生理學實驗', credits: 1, semester: '113-1', course_code: '57646', grade: '88' },
      { name: '神經生理學', credits: 3, semester: '113-2', course_code: '57669', grade: '90' },
      { name: '免疫學', credits: 3, semester: '113-2', course_code: '57649', grade: '87' },
    ],
  }

  it('SNAPSHOT: prints the HIGHEST score for 選修兩學期 course (92, not 78)', () => {
    const result = verifyModule(mod, passingStudent.courses)
    expect(result.is_certified).toBe(true)
    const ctx = buildCertContext(passingStudent, mod, result, new Date('2026-04-28T08:00:00+08:00'))
    const bio = ctx.courses.find(c => c.name_zh === '生物化學')!
    // Best-for-student policy: among 78 / 92, cert shows 92.
    expect(bio.score).toBe('92')
    // Credits are still summed across both semesters
    expect(bio.credits).toBe(6)
  })
})

describe('cert score snapshots: retake (different-semester repeat)', () => {
  const mod = findModule(modules, '動物科學系_動物生產模組') as Module

  it('SNAPSHOT: when a student has 2 passing records for same code, prints the FIRST', () => {
    const student: StudentInfo = {
      student_id: 'TEST_RT', name: '重修測試', department: '動科系',
      courses: [
        { name: '動物科學概論', credits: 2, semester: '110-1', course_code: '37819', grade: '60' },
        // Hypothetical retake the next year with better grade
        { name: '動物科學概論', credits: 2, semester: '111-1', course_code: '37819', grade: '95' },
        { name: '動物科學統計方法', credits: 3, semester: '110-1', course_code: '37805', grade: '80' },
        { name: '動物解剖生理學', credits: 2, semester: '110-1', course_code: '37807', grade: '78' },
        { name: '動物解剖生理學', credits: 2, semester: '110-2', course_code: '37807', grade: '82' },
        { name: '動物育種學', credits: 2, semester: '111-1', course_code: '37845', grade: '85' },
        { name: '動物營養學', credits: 3, semester: '111-2', course_code: '37873', grade: '88' },
      ],
    }
    const result = verifyModule(mod, student.courses)
    expect(result.is_certified).toBe(true)
    const ctx = buildCertContext(student, mod, result, new Date('2026-04-28T08:00:00+08:00'))
    const intro = ctx.courses.find(c => c.name_zh === '動物科學概論')!
    // Best-for-student: shows the retake's 95, not the first attempt's 60.
    expect(intro.score).toBe('95')
  })
})

describe('cert score snapshots: cross-group module 影像與視覺文化', () => {
  const mod = findModule(modules, '台灣人文創新學士學位學程_影像與視覺文化') as Module

  it('SNAPSHOT: cross-group module includes all matched L1+L2+L3 rows with scores', () => {
    const student: StudentInfo = {
      student_id: 'TEST_XG', name: '跨組測試', department: '台文學士',
      courses: [
        // L1 — covers 2 categories (電影 + 大眾文化)
        { name: '紀錄片與台灣社會', credits: 2, semester: '111-1', course_code: '04681', grade: '89' },
        { name: '台灣類型電影', credits: 2, semester: '112-1', course_code: '04688', grade: '90' },
        // L2 — must correspond to L1
        { name: '世界電影', credits: 2, semester: '112-2', course_code: '04252', grade: '88' },
        // L3 — required
        { name: '當代影像創作', credits: 2, semester: '111-2', course_code: '04954', grade: '86' },
      ],
    }
    const result = verifyModule(mod, student.courses)
    expect(result.is_certified).toBe(true)
    const ctx = buildCertContext(student, mod, result, new Date('2026-04-28T08:00:00+08:00'))
    // All 4 matched courses should appear with their respective grades
    const findRow = (name: string) => ctx.courses.find(c => c.name_zh === name)
    // Cross-group module's verifyCrossGroupModule populates match_details
    // for L1 and L2 with score, plus required group L3 via verifyGroup.
    expect(findRow('紀錄片與台灣社會')?.score).toBe('89')
    expect(findRow('台灣類型電影')?.score).toBe('90')
    expect(findRow('世界電影')?.score).toBe('88')
    expect(findRow('當代影像創作')?.score).toBe('86')
  })
})

describe('cert score snapshots: pass-fail grade (Y / P)', () => {
  // Student got 'Y' (抵免) for a module-required course
  const mod = findModule(modules, '動物科學系_動物生產模組') as Module
  const student: StudentInfo = {
    student_id: 'TEST_Y', name: '抵免測試', department: '動科系',
    courses: [
      { name: '動物科學概論', credits: 2, semester: '110-1', course_code: '37819', grade: 'Y' },
      { name: '動物科學統計方法', credits: 3, semester: '110-1', course_code: '37805', grade: '85' },
      { name: '動物解剖生理學', credits: 2, semester: '110-1', course_code: '37807', grade: '88' },
      { name: '動物解剖生理學', credits: 2, semester: '110-2', course_code: '37807', grade: '90' },
      { name: '動物育種學', credits: 2, semester: '111-1', course_code: '37845', grade: '78' },
      { name: '動物營養學', credits: 3, semester: '111-2', course_code: '37873', grade: '82' },
    ],
  }

  it('SNAPSHOT: a Y grade is printed verbatim as "Y" (not "抵免")', () => {
    const result = verifyModule(mod, student.courses)
    expect(result.is_certified).toBe(true)
    const ctx = buildCertContext(student, mod, result, new Date('2026-04-28T08:00:00+08:00'))
    const intro = ctx.courses.find(c => c.name_zh === '動物科學概論')!
    expect(intro.score).toBe('Y')
  })
})
