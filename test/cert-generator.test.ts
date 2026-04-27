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
