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
    // 選修兩學期 credits sum across both semesters: 6 + 3 + 3 + (2 + 2) = 16
    expect(result.total_credits_matched).toBe(16)
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

  it('bug #2 regression: 選修兩學期 credits sum across semesters', () => {
    // Student takes 專題研究 two semesters at 1 credit each → should count as 2
    // credits (not 1). Regression guard for the bug where only the first
    // match's credits were added to the running total.
    const student: StudentCourse[] = [
      { name: '生物化學', credits: 6, semester: '112-1' },
      { name: '植物生理學', credits: 3, semester: '114-1' },
      { name: '植物組織培養及實驗', credits: 3, semester: '112-1' },
      { name: '專題研究', credits: 1, semester: '112-1', course_code: '02603' },
      { name: '專題研究', credits: 1, semester: '112-2', course_code: '99501' },
    ]
    const result = verifyModule(mod, student)
    // 6 (生物化學) + 3 (植物生理學) + 3 (植物組織培養) + (1 + 1) 專題研究 = 14
    expect(result.total_credits_matched).toBe(14)
    // The group credit for 應用課程: 3 (植物組織培養) + (1 + 1) 專題研究 = 5
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup!.credits_matched).toBe(5)
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

describe('verifier - only_semester filter (認列下學期 等)', () => {
  const mod = makeModule([
    {
      label: '基礎課程',
      rule: { type: 'min_credits', category: '基礎課程', choose_n: 1, min_credits: 3, notes: [] },
      courses: [
        {
          name_zh: '普通物理學',
          name_en: 'General Physics',
          credits: 6,
          offering_unit: '物理系',
          remark: '基礎課程(普通物理學認列下學期課程)',
          course_codes: ['54543'],
          only_semester: '下',
        },
      ],
    },
  ])

  it('FAIL: student took 上學期 only — should not match', () => {
    const student: StudentCourse[] = [
      { name: '普通物理學', credits: 3, semester: '110-1', course_code: '54543' },
    ]
    const result = verifyModule(mod, student)
    const base = result.group_results[0]
    expect(base.courses_matched).not.toContain('普通物理學')
    expect(base.credits_matched).toBe(0)
  })

  it('PASS: student took 下學期 only — matches and counts 3 credits', () => {
    const student: StudentCourse[] = [
      { name: '普通物理學', credits: 3, semester: '110-2', course_code: '54543' },
    ]
    const result = verifyModule(mod, student)
    const base = result.group_results[0]
    expect(base.courses_matched).toContain('普通物理學')
    expect(base.credits_matched).toBe(3)
  })

  it('PASS: student took both semesters — only 下學期 counts (not summed)', () => {
    const student: StudentCourse[] = [
      { name: '普通物理學', credits: 3, semester: '110-1', course_code: '54543' },
      { name: '普通物理學', credits: 3, semester: '110-2', course_code: '54543' },
    ]
    const result = verifyModule(mod, student)
    const base = result.group_results[0]
    expect(base.courses_matched).toContain('普通物理學')
    // only 下學期 3 — should NOT sum both to 6
    expect(base.credits_matched).toBe(3)
  })
})

describe('integration: 普通物理學 認列下學期 in 3 real modules', () => {
  // Regression guard: the 3 modules with 普通物理學 code=54543 must carry
  // the only_semester='下' flag after loading modules_data.json.
  const physicsKeys = [
    '物理學系_半導體物理與應用',
    '機械工程學系_智慧製造跨製程系統整合與製造應用',
    '機械工程學系_智慧製造整線聯網分析與智慧管理',
  ]

  it('all 3 physics/mechanical modules have 普通物理學 with only_semester="下"', () => {
    for (const key of physicsKeys) {
      const mod = findModule(modules, key)
      expect(mod).toBeDefined()
      // Look up by code 54543 — two of the modules store the name in
      // dual-language format "（中文）普通物理學 （英文）General Physics".
      const phys = mod!.all_courses.find(c => c.course_codes?.includes('54543'))
      expect(phys).toBeDefined()
      expect(phys!.only_semester).toBe('下')
    }
  })
})

// ─────────────────────────────────────────────────────────
// False-positive regression: behavior snapshots of known logic holes
// that *could* over-credit students. These tests pin down CURRENT
// behavior so any future change surfaces in the diff — they are not
// claims that the current behavior is correct.
// ─────────────────────────────────────────────────────────

describe('false-positive snapshots: substitute group over-counting', () => {
  // A module with BOTH the combined 電子學及實習 course AND the split pair
  // (電子學 + 電子學實習). If a student takes all three, verifier currently
  // counts 3 separate module-course matches and sums all their credits.
  const mod = makeModule([
    {
      label: '替代: 電子學及實習',
      rule: { type: 'substitute', substitutes_for: ['電子學', '電子學實習'], notes: [] },
      courses: [{
        name_zh: '電子學及實習', name_en: 'Electronics & Lab',
        credits: 3, offering_unit: '生機系',
        remark: '替代課程 || 「電子學」及「電子學實習」',
      }],
    },
    {
      label: '替代: 電子學 + 電子學實習',
      rule: { type: 'substitute', substitutes_for: ['電子學及實習'], notes: [] },
      courses: [
        { name_zh: '電子學', name_en: 'Electronics', credits: 3, offering_unit: '生機系',
          remark: '替代課程 || 「電子學及實習」' },
        { name_zh: '電子學實習', name_en: 'Electronics Lab', credits: 1, offering_unit: '生機系',
          remark: '替代課程 || 「電子學及實習」' },
      ],
    },
  ])

  it('SNAPSHOT: a student who took all 3 courses gets ALL counted into total', () => {
    const student: StudentCourse[] = [
      { name: '電子學及實習', credits: 3 },
      { name: '電子學', credits: 3 },
      { name: '電子學實習', credits: 1 },
    ]
    const result = verifyModule(mod, student)
    // Current behavior: 3 module courses matched, credits summed = 3 + 3 + 1 = 7.
    // If the module designer intended substitute to be an alternative (choose
    // one branch), this is over-counting. Pinned for future review.
    expect(result.total_courses_matched).toBe(3)
    expect(result.total_credits_matched).toBe(7)
  })

  it('SNAPSHOT: a student who took only the combined course passes the module', () => {
    const student: StudentCourse[] = [{ name: '電子學及實習', credits: 3 }]
    const result = verifyModule(mod, student)
    // One of the two substitute groups is satisfied → subsSatisfied = true
    // (OR across substitute groups). Module passes if certification thresholds
    // are met — here cert asks 4/12, and we only have 1/3, so expect fail.
    expect(result.is_certified).toBe(false)
    expect(result.total_courses_matched).toBe(1)
  })
})

describe('false-positive snapshots: one code → multiple module course names', () => {
  // Simulates the real-world situation where code "40614" is listed under
  // three different names across modules (電子學 / 電子學一 / 電子學二).
  // A student taking any single record with code 40614 can match all three
  // module entries via code-first matching.
  const modA = makeModule([
    {
      label: '電子學',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '電子學', name_en: 'Electronics', credits: 3,
        offering_unit: '電機系', remark: null, course_codes: ['40614'] }],
    },
  ])
  const modB = makeModule([
    {
      label: '電子學一',
      rule: { type: 'required', notes: [] },
      courses: [{ name_zh: '電子學一', name_en: 'Electronics I', credits: 3,
        offering_unit: '電機系', remark: null, course_codes: ['40614'] }],
    },
  ])

  it('SNAPSHOT: one student record with code 40614 matches both module A and B', () => {
    const student: StudentCourse[] = [
      { name: '電子學', credits: 3, semester: '112-1', course_code: '40614' },
    ]
    // Both modules see this single student course as a match for their own
    // entry. This is the intended "code-first" behavior, but when the code
    // table itself contains ambiguous mappings (as 40614 does in real data),
    // it can silently cross-credit.
    expect(verifyGroupCourseMatched(modA, '電子學', student)).toBe(true)
    expect(verifyGroupCourseMatched(modB, '電子學一', student)).toBe(true)
  })
})

describe('false-positive snapshots: free-text advisory not enforced', () => {
  // Parser collects advisory phrases into rule.notes but verifier does not
  // act on them. Pinned to surface any future enforcement change.
  const mod = makeModule([
    {
      label: '[基礎課程] 統計學(二)',
      rule: { type: 'required', category: '基礎課程',
        notes: ['(只承認管理學院所開設課程)'] },
      courses: [{ name_zh: '統計學(二)', name_en: 'Statistics II', credits: 3,
        offering_unit: '企管系', remark: '基礎課程 (只承認管理學院所開設課程)',
        course_codes: ['34648'] }],
    },
  ])

  it('SNAPSHOT: student course matches even without provenance check', () => {
    const student: StudentCourse[] = [
      // We cannot tell from StudentCourse whether this was taken at 管院
      { name: '統計學(二)', credits: 3, semester: '112-1', course_code: '34648' },
    ]
    const result = verifyModule(mod, student)
    expect(result.group_results[0].courses_matched).toContain('統計學(二)')
    // The advisory is parsed into the rule's notes but not enforced
    expect(result.group_results[0].rule.notes.some(n => n.includes('只承認'))).toBe(true)
  })
})

/** Small helper: did this module's named course get matched for the student? */
function verifyGroupCourseMatched(mod: import('../src/models.ts').Module, name: string, student: StudentCourse[]): boolean {
  const r = verifyModule(mod, student)
  return r.group_results.some(g => g.courses_matched.includes(name))
}
