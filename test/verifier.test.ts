import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadModules, findModule } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import type { StudentCourse } from '../src/models.ts'

const DATA_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(DATA_PATH)

describe('module loading', () => {
  it('loads 71 modules', () => {
    expect(modules.length).toBe(71)
  })

  it('every module has at least one group', () => {
    for (const m of modules) {
      expect(m.groups.length).toBeGreaterThan(0)
    }
  })

  it('every module has valid certification requirements', () => {
    for (const m of modules) {
      expect(m.certification.min_courses).toBeGreaterThan(0)
      expect(m.certification.min_credits).toBeGreaterThan(0)
    }
  })
})

describe('verifier - 歷史學系_文史旅遊應用領域模組 (all required, 5 courses)', () => {
  const mod = findModule(modules, '歷史學系_文史旅遊應用領域模組')!

  it('module exists', () => {
    expect(mod).toBeDefined()
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 12 })
  })

  it('passes when all 5 courses taken', () => {
    const student: StudentCourse[] = [
      { name: '臺灣史', credits: 4 },
      { name: '中臺灣區域史', credits: 2 },
      { name: '戰後中臺灣旅遊觀光史(1945-2010)', credits: 2 },
      { name: '臺中學', credits: 2 },
      { name: '日治時期臺灣山區探險史', credits: 2 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(12)
  })

  it('fails when missing 1 course', () => {
    const student: StudentCourse[] = [
      { name: '臺灣史', credits: 4 },
      { name: '中臺灣區域史', credits: 2 },
      { name: '臺中學', credits: 2 },
      { name: '日治時期臺灣山區探險史', credits: 2 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(false)
    expect(result.total_courses_matched).toBe(4)
  })
})

describe('verifier - 會計學系_會計審計核心課程 (N choose M groups)', () => {
  const mod = findModule(modules, '會計學系_會計審計核心課程')!

  it('module exists with correct certification', () => {
    expect(mod).toBeDefined()
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 15 })
  })

  it('passes with 2 基礎 + 2 核心 + 1 應用 = 5 courses, 15 credits', () => {
    const student: StudentCourse[] = [
      { name: '中級會計學(一)', credits: 3 },
      { name: '中級會計學(二)', credits: 3 },
      { name: '成本與管理會計學', credits: 6 },
      { name: '審計學', credits: 6 },
      { name: '會計資訊系統', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
  })

  it('passes with only 2 of 3 核心 courses (三門選兩門)', () => {
    const student: StudentCourse[] = [
      { name: '中級會計學(一)', credits: 3 },
      { name: '中級會計學(二)', credits: 3 },
      { name: '成本與管理會計學', credits: 3 },
      { name: '高等會計學', credits: 3 },
      { name: '財務報表分析', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
  })

  it('fails when only 1 of 3 核心 taken (need 2)', () => {
    const student: StudentCourse[] = [
      { name: '中級會計學(一)', credits: 3 },
      { name: '中級會計學(二)', credits: 3 },
      { name: '成本與管理會計學', credits: 3 },
      // missing 2nd 核心
      { name: '稅務法規', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(false)
    // At least one group should be unsatisfied
    expect(result.unmet_reasons.length).toBeGreaterThan(0)
  })
})

describe('verifier - 資管系_資訊管理領域模組 (category + choose patterns)', () => {
  const mod = findModule(modules, '資管系_資訊管理領域模組')!

  it('module exists', () => {
    expect(mod).toBeDefined()
    expect(mod.certification).toEqual({ min_courses: 4, min_credits: 12 })
  })

  it('passes with 2 基礎 + 1 核心 + 1 應用', () => {
    const student: StudentCourse[] = [
      { name: '計算機概論', credits: 3 },
      { name: '管理數學', credits: 3 },
      { name: '資訊管理導論', credits: 3 },
      { name: '機器學習', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(4)
    expect(result.total_credits_matched).toBe(12)
  })
})

describe('verifier - empty student courses', () => {
  const mod = findModule(modules, '歷史學系_文史旅遊應用領域模組')!

  it('fails with no courses', () => {
    const result = verifyModule(mod, [])
    expect(result.is_certified).toBe(false)
    expect(result.total_courses_matched).toBe(0)
    expect(result.total_credits_matched).toBe(0)
  })
})
