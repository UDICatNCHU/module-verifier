import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadModules, findModule } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import type { StudentCourse, Module, CourseGroup } from '../src/models.ts'

const DATA_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(DATA_PATH)

describe('module loading', () => {
  it('loads 71 modules', () => {
    expect(modules.length).toBe(73)
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

// ─────────────────────────────────────────────────────────
// course_code matching tests (生科系 專題研究 scenario)
// ─────────────────────────────────────────────────────────

/** Helper: build a minimal Module with course_code support */
function makeModule(groups: CourseGroup[]): Module {
  return {
    key: 'test_module',
    name_zh: '測試模組',
    name_en: 'Test Module',
    unit: '測試單位',
    college: '測試學院',
    groups,
    all_courses: groups.flatMap(g => g.courses),
    certification: { min_courses: 4, min_credits: 12 },
  }
}

describe('verifier - course_code matching', () => {
  // Simulates 生科系 scenario:
  // Module defines "專題研究" with course_code "BL301"
  // Student records have "專題研究(一)" code "BL301" + "專題研究(二)" code "BL301"
  const mod = makeModule([
    {
      label: '生物化學',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '生物化學', name_en: 'Biochemistry', credits: 6, offering_unit: '生科系', remark: '基礎課程' }],
    },
    {
      label: '動物生理學',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '動物生理學', name_en: 'Animal Physiology', credits: 3, offering_unit: '生科系', remark: '核心課程' }],
    },
    {
      label: '[應用課程] 7選2',
      rule: { type: 'choose_m_from_n', category: '應用課程', choose_m: 2, choose_n: 7, notes: [] },
      courses: [
        { name_zh: '神經生理學', name_en: 'Neurophysiology', credits: 3, offering_unit: '生科系', remark: '應用課程(七選二)' },
        { name_zh: '免疫學', name_en: 'Immunology', credits: 3, offering_unit: '生科系', remark: '應用課程(七選二)' },
        { name_zh: '專題研究', name_en: 'Undergraduate Research', credits: 2, offering_unit: '生科系', remark: '應用課程(七選二) 選修兩學期', course_codes: ['BL301'] },
      ],
    },
  ])

  it('PASS: course_code matches 專題研究(一)+(二) across 2 semesters', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6 },
      { name: '動物生理學', credits: 3 },
      { name: '神經生理學', credits: 3 },
      // Different names but same course_code — should match as 2 semesters
      { name: '專題研究(一)', credits: 2, semester: '114-1', course_code: 'BL301' },
      { name: '專題研究(二)', credits: 2, semester: '114-2', course_code: 'BL301' },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBeGreaterThanOrEqual(4)
    // 6 + 3 + 3 + 2 (專題研究 matched via code) = 14
    expect(result.total_credits_matched).toBe(14)
  })

  it('FAIL: course_code matches but only 1 semester for 選修兩學期', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6 },
      { name: '動物生理學', credits: 3 },
      { name: '神經生理學', credits: 3 },
      // Only 1 semester — 選修兩學期 not met
      { name: '專題研究(一)', credits: 2, semester: '114-1', course_code: 'BL301' },
    ]
    const result = verifyModule(mod, student)
    // 專題研究 should NOT count since only 1 semester
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup).toBeDefined()
    expect(appGroup!.courses_matched).not.toContain('專題研究')
    // Only 神經生理學 matched → 1 of 2 needed → group not satisfied
    expect(appGroup!.courses_matched).toEqual(['神經生理學'])
  })

  it('falls back to name matching when no course_code', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6 },
      { name: '動物生理學', credits: 3 },
      { name: '神經生理學', credits: 3 },
      // No course_code — falls back to exact name match
      { name: '專題研究', credits: 2, semester: '114-1' },
      { name: '專題研究', credits: 2, semester: '114-2' },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
  })

  it('name fallback: 專題研究 with only 1 semester still fails', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6 },
      { name: '動物生理學', credits: 3 },
      { name: '神經生理學', credits: 3 },
      { name: '專題研究', credits: 2, semester: '114-1' },
    ]
    const result = verifyModule(mod, student)
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup!.courses_matched).not.toContain('專題研究')
  })
})

describe('verifier - multi-code matching (上下學期不同碼)', () => {
  // Simulates 生科系 scenario where 專題研究 has different codes per semester:
  // 上學期 code "02603", 下學期 code "99501"
  const mod = makeModule([
    {
      label: '生物化學',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '生物化學', name_en: 'Biochemistry', credits: 6, offering_unit: '生科系', remark: '基礎課程' }],
    },
    {
      label: '植物生理學',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '植物生理學', name_en: 'Plant Physiology', credits: 3, offering_unit: '生科系', remark: '核心課程' }],
    },
    {
      label: '[應用課程] 7選2',
      rule: { type: 'choose_m_from_n', category: '應用課程', choose_m: 2, choose_n: 7, notes: [] },
      courses: [
        { name_zh: '植物組織培養及實驗', name_en: 'Plant Tissue Culture', credits: 3, offering_unit: '生科系', remark: '應用課程(七選二)' },
        { name_zh: '專題研究', name_en: 'Undergraduate Research', credits: 2, offering_unit: '生科系', remark: '應用課程(七選二) 選修兩學期', course_codes: ['02603', '99501'] },
      ],
    },
  ])

  it('PASS: 上下學期不同碼都匹配到', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6, semester: '112-1' },
      { name: '植物生理學', credits: 3, semester: '114-1' },
      { name: '植物組織培養及實驗', credits: 3, semester: '112-1' },
      // ��下學期不同碼 — 兩碼都在模組的 course_codes 裡
      { name: '專題研究', credits: 1, semester: '112-1', course_code: '02603' },
      { name: '專題研究', credits: 1, semester: '112-2', course_code: '99501' },
    ]
    const result = verifyModule(mod, student)
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    // 專題研究兩學期都被匹配到（透過多碼），滿足選修兩學期
    expect(appGroup!.courses_matched).toContain('專題研究')
    expect(result.is_certified).toBe(true)
  })

  it('FAIL: ��有上學期碼，選修兩學期未滿足', () => {
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6, semester: '112-1' },
      { name: '植物生理學', credits: 3, semester: '114-1' },
      { name: '植物組織培養及實驗', credits: 3, semester: '112-1' },
      // 只有一學期
      { name: '專題研究', credits: 1, semester: '112-1', course_code: '02603' },
    ]
    const result = verifyModule(mod, student)
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup!.courses_matched).not.toContain('專題研究')
  })
})
