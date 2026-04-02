import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadModules, findModule } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import type { StudentCourse, Module } from '../src/models.ts'

const DATA_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(DATA_PATH)

// ─────────────────────────────────────────────────────────
// 1. 園藝學系_果樹專業 — || patterns, application courses merged
// ─────────────────────────────────────────────────────────
describe('園藝學系_果樹專業', () => {
  const mod = findModule(modules, '園藝學系_果樹專業')!

  it('loads with correct certification', () => {
    expect(mod).toBeDefined()
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 12 })
  })

  it('merges application courses with different || prefixes into one pool', () => {
    // 8 application courses share the same base rule "至少選3門"
    // even though their || left-side notes differ
    const appGroup = mod.groups.find(
      g => g.rule.type === 'min_courses' && g.rule.category === '應用課程'
    )
    expect(appGroup).toBeDefined()
    expect(appGroup!.courses.length).toBe(8)
    expect(appGroup!.rule.min_courses).toBe(3)
  })

  it('PASS: 1 基礎 + 1 核心 + 3 應用 from different prerequisites', () => {
    const student: StudentCourse[] = [
      { name: '園藝學原理', credits: 3 },
      { name: '果樹學', credits: 3 },
      { name: '常綠果樹學', credits: 3 },       // prereq: 園藝學原理
      { name: '小果類作物栽培與生理學', credits: 3 }, // prereq: 英文授課
      { name: '葡萄學', credits: 3 },            // prereq: 園藝學原理
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(15)
  })

  it('FAIL: only 2 application courses', () => {
    const student: StudentCourse[] = [
      { name: '園藝學原理', credits: 3 },
      { name: '果樹學', credits: 3 },
      { name: '常綠果樹學', credits: 3 },
      { name: '葡萄學', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────
// 2. 電機系_電子電路 — 僅認定一門課, consecutive adjacency
// ─────────────────────────────────────────────────────────
describe('電機系_電子電路', () => {
  const mod = findModule(modules, '電機系_電子電路')!

  it('loads with correct certification', () => {
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 13 })
  })

  it('groups 4 consecutive 僅認定一門課 into one pick-1 group', () => {
    const pickOne = mod.groups.find(g => g.label.includes('擇一'))
    expect(pickOne).toBeDefined()
    expect(pickOne!.courses.length).toBe(4)
    expect(pickOne!.rule.choose_m).toBe(1)
  })

  it('PASS: 電路學一 + 電子學一 + 電子學二 + 超大型積體電路設計導論 + 電工實驗一', () => {
    const student: StudentCourse[] = [
      { name: '電路學一', credits: 3 },
      { name: '電子學一', credits: 3 },
      { name: '電子學二', credits: 3 },
      { name: '超大型積體電路設計導論', credits: 3 },
      { name: '電工實驗一', credits: 1 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(13)
  })
})

// ─────────────────────────────────────────────────────────
// 3. 電機系_半導體 — 僅認定一門課 with gaps
// ─────────────────────────────────────────────────────────
describe('電機系_半導體', () => {
  const mod = findModule(modules, '電機系_半導體')!

  it('has two separate 僅認定一門課 groups (gap at 光電元件)', () => {
    const pickOneGroups = mod.groups.filter(g => g.label.includes('擇一'))
    expect(pickOneGroups.length).toBe(2)
    expect(pickOneGroups[0].courses.length).toBe(2) // 固態工程 / 半導體工程
    expect(pickOneGroups[1].courses.length).toBe(2) // 半導體元件 / 固態電子元件
  })

  it('PASS: one from each group + others', () => {
    const student: StudentCourse[] = [
      { name: '近代物理(一)', credits: 3 },
      { name: '固態工程', credits: 3 },
      { name: '光電元件', credits: 3 },
      { name: '半導體元件', credits: 3 },
      { name: '微電子實驗', credits: 1 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(13)
  })
})

// ─────────────────────────────────────────────────────────
// 4. 生機系_農業機電工程 — 替代課程 (reciprocal alternatives)
// ─────────────────────────────────────────────────────────
describe('生機系_農業機電工程 (替代課程)', () => {
  const mod = findModule(modules, '生機系_領域模組架構計畫書_農業機電工程模組')!

  it('loads with correct certification', () => {
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 15 })
  })

  it('has substitute groups', () => {
    const subGroups = mod.groups.filter(g => g.rule.type === 'substitute')
    expect(subGroups.length).toBe(2)
  })

  it('PASS: student took 電子學及實習 path (one substitute satisfied = OK)', () => {
    const student: StudentCourse[] = [
      { name: '生物產業機械', credits: 3 },
      { name: '氣壓工程', credits: 3 },
      { name: '電子學及實習', credits: 3 },
      { name: '影像處理概論', credits: 3 },
      { name: '嵌入式系統在生機之應用', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    // Substitute groups are alternatives — only one path needs to be satisfied
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(15)
  })

  it('PASS: student took 電子學 + 電子學實習 path', () => {
    const student: StudentCourse[] = [
      { name: '生物產業機械', credits: 3 },
      { name: '氣壓工程', credits: 3 },
      { name: '電子學', credits: 3 },
      { name: '電子學實習', credits: 1 },
      { name: '影像處理概論', credits: 3 },
      { name: '嵌入式系統在生機之應用', credits: 3 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(6)
    expect(result.total_credits_matched).toBe(16)
  })
})

// ─────────────────────────────────────────────────────────
// 5. 生命科學系_微生物科技 — 選修兩學期 merged into same pool
// ─────────────────────────────────────────────────────────
describe('生命科學系_微生物科技 (選修兩學期)', () => {
  const mod = findModule(modules, '生命科學系_微生物科技')!

  it('loads with correct certification', () => {
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 13 })
  })

  it('merges 應用課程(三選一) and 應用課程(三選一) 選修兩學期 into one pool', () => {
    // All 3 application courses should be in ONE group, not split by 選修兩學期
    const appGroup = mod.groups.find(
      g => g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup).toBeDefined()
    expect(appGroup!.courses.length).toBe(3) // 應用微生物學, 微生物學操作技術, 專題研究
    expect(appGroup!.rule.choose_m).toBe(1)
  })

  it('PASS: took 應用微生物學 (no 選修兩學期 needed)', () => {
    const student: StudentCourse[] = [
      { name: '微生物學', credits: 3 },
      { name: '微生物遺傳學', credits: 3 },
      { name: '微生物誘病機制學', credits: 2 },
      { name: '病毒學', credits: 3 },
      { name: '應用微生物學', credits: 2 },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(13)
  })

  it('FAIL: took 專題研究 for only 1 semester (needs 2)', () => {
    const student: StudentCourse[] = [
      { name: '微生物學', credits: 3 },
      { name: '微生物遺傳學', credits: 3 },
      { name: '微生物誘病機制學', credits: 2 },
      { name: '病毒學', credits: 3 },
      { name: '專題研究', credits: 2, semester: '114-1' },
    ]
    const result = verifyModule(mod, student)
    // 專題研究 requires 選修兩學期 — only 1 semester means it doesn't count
    const appGroup = result.group_results.find(g =>
      g.rule.type === 'choose_m_from_n' && g.rule.category === '應用課程'
    )
    expect(appGroup).toBeDefined()
    expect(appGroup!.courses_matched).not.toContain('專題研究')
    expect(result.is_certified).toBe(false)
  })

  it('PASS: took 專題研究 for 2 semesters', () => {
    const student: StudentCourse[] = [
      { name: '微生物學', credits: 3 },
      { name: '微生物遺傳學', credits: 3 },
      { name: '微生物誘病機制學', credits: 2 },
      { name: '病毒學', credits: 3 },
      { name: '專題研究', credits: 2, semester: '114-1' },
      { name: '專題研究', credits: 2, semester: '114-2' },
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────
// 6. 物理學系_半導體物理與應用 — 3-tier credit pools
// ─────────────────────────────────────────────────────────
describe('物理學系_半導體物理與應用', () => {
  const mod = findModule(modules, '物理學系_半導體物理與應用')!

  it('loads with correct certification', () => {
    expect(mod.certification).toEqual({ min_courses: 5, min_credits: 15 })
  })

  it('has 3 min_credits groups (5基礎→3cr, 6核心→3cr, 6應用→9cr)', () => {
    const creditGroups = mod.groups.filter(g => g.rule.type === 'min_credits')
    expect(creditGroups.length).toBe(3)

    const basic = creditGroups.find(g => g.courses.length === 5)
    expect(basic).toBeDefined()
    expect(basic!.rule.min_credits).toBe(3)

    const core = creditGroups.find(g => g.courses.length === 6 && g.rule.min_credits === 3)
    expect(core).toBeDefined()

    const app = creditGroups.find(g => g.courses.length === 6 && g.rule.min_credits === 9)
    expect(app).toBeDefined()
  })

  it('PASS: one from each tier meeting credit thresholds', () => {
    const student: StudentCourse[] = [
      { name: '微積分(一)', credits: 3 },         // 基礎 3cr ≥ 3
      { name: '近代物理', credits: 3 },           // 核心 3cr ≥ 3
      { name: '電路學', credits: 3 },             // 應用
      { name: '固態物理(一)', credits: 3 },        // 應用
      { name: '半導體元件物理', credits: 3 },      // 應用 → total 9cr ≥ 9
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(5)
    expect(result.total_credits_matched).toBe(15)
  })

  it('FAIL: application credits insufficient (only 6 of 9)', () => {
    const student: StudentCourse[] = [
      { name: '微積分(一)', credits: 3 },
      { name: '近代物理', credits: 3 },
      { name: '電路學', credits: 3 },
      { name: '固態物理(一)', credits: 3 },
      // Only 6cr in 應用, need 9
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────
// 7. 影像與視覺文化 — cross-group dependency
// ─────────────────────────────────────────────────────────
describe('台灣人文創新_影像與視覺文化 (cross-group)', () => {
  const mod = findModule(modules, '台灣人文創新學士學位學程_影像與視覺文化')!

  it('loads with correct certification', () => {
    expect(mod.certification).toEqual({ min_courses: 4, min_credits: 8 })
  })

  it('PASS: 2 L1 categories + 1 L2 matching + L3 required', () => {
    const student: StudentCourse[] = [
      { name: '台灣電影', credits: 2 },                // L1 電影
      { name: '社群影音與台灣社會', credits: 2 },       // L1 大眾文化
      { name: '世界電影', credits: 2 },                 // L2 電影 (matches L1)
      { name: '當代影像創作', credits: 2 },              // L3 required
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
    expect(result.total_courses_matched).toBe(4)
    expect(result.total_credits_matched).toBe(8)
  })

  it('FAIL: L2 from unmatched L1 category', () => {
    const student: StudentCourse[] = [
      { name: '台灣電影', credits: 2 },                // L1 電影
      { name: '社群影音與台灣社會', credits: 2 },       // L1 大眾文化
      { name: '音樂劇與表演藝術', credits: 2 },         // L2 表演藝術 (NOT in L1!)
      { name: '當代影像創作', credits: 2 },
    ]
    const result = verifyModule(mod, student)
    // L2 表演藝術 doesn't correspond to any L1 category taken
    const l2Result = result.group_results.find(g => g.label.includes('Level 2'))
    expect(l2Result).toBeDefined()
    expect(l2Result!.is_satisfied).toBe(false)
    expect(result.is_certified).toBe(false)
  })

  it('FAIL: only 1 L1 category', () => {
    const student: StudentCourse[] = [
      { name: '台灣電影', credits: 2 },
      { name: '紀錄片與台灣社會', credits: 2 },  // also 電影 — same category
      { name: '世界電影', credits: 2 },
      { name: '當代影像創作', credits: 2 },
    ]
    const result = verifyModule(mod, student)
    const l1Result = result.group_results.find(g => g.label.includes('Level 1'))
    expect(l1Result).toBeDefined()
    expect(l1Result!.is_satisfied).toBe(false)
    expect(result.is_certified).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────
// 8. 園藝學系_花卉專業 — mixed || and non-|| application courses
// ─────────────────────────────────────────────────────────
describe('園藝學系_花卉專業', () => {
  const mod = findModule(modules, '園藝學系_花卉專業')!

  it('merges all 12 application courses into one min_credits pool', () => {
    const appGroup = mod.groups.find(
      g => g.rule.type === 'min_credits' && g.rule.category === '應用課程'
    )
    expect(appGroup).toBeDefined()
    // 12 application courses (some with ||, some without)
    expect(appGroup!.courses.length).toBe(12)
    expect(appGroup!.rule.min_credits).toBe(6)
  })

  it('PASS: 基礎 + 核心 + ≥6 credits of 應用', () => {
    const student: StudentCourse[] = [
      { name: '園藝學原理', credits: 3 },        // 基礎 2選1
      { name: '花卉學', credits: 3 },            // 核心
      { name: '植物繁殖學', credits: 2 },         // 應用
      { name: '園藝作物育種學', credits: 3 },     // 應用
      { name: '觀賞樹木', credits: 3 },          // 應用 → total 8cr ≥ 6
    ]
    const result = verifyModule(mod, student)
    expect(result.is_certified).toBe(true)
  })
})
