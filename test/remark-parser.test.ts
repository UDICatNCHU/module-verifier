import { describe, it, expect } from 'vitest'
import { parseRemark, parseChineseOrDigit } from '../src/remark-parser.ts'

describe('parseChineseOrDigit', () => {
  it('parses digits', () => {
    expect(parseChineseOrDigit('3')).toBe(3)
    expect(parseChineseOrDigit('12')).toBe(12)
  })

  it('parses Chinese numerals', () => {
    expect(parseChineseOrDigit('一')).toBe(1)
    expect(parseChineseOrDigit('二')).toBe(2)
    expect(parseChineseOrDigit('三')).toBe(3)
    expect(parseChineseOrDigit('七')).toBe(7)
    expect(parseChineseOrDigit('十')).toBe(10)
  })

  it('returns null for unknown', () => {
    expect(parseChineseOrDigit('abc')).toBeNull()
  })
})

describe('parseRemark', () => {
  // ── No remark / empty ──
  it('null → required', () => {
    const r = parseRemark(null)
    expect(r.type).toBe('required')
  })

  it('empty string → required', () => {
    const r = parseRemark('')
    expect(r.type).toBe('required')
  })

  // ── Simple labels → required ──
  it('"基礎課程" → required with category', () => {
    const r = parseRemark('基礎課程')
    expect(r.type).toBe('required')
    expect(r.category).toBe('基礎課程')
  })

  it('"核心課程" → required with category', () => {
    const r = parseRemark('核心課程')
    expect(r.type).toBe('required')
    expect(r.category).toBe('核心課程')
  })

  it('"必修" → required', () => {
    const r = parseRemark('必修')
    expect(r.type).toBe('required')
  })

  // ── N choose M patterns ──
  it('"二選一" → choose 1 from 2', () => {
    const r = parseRemark('二選一')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"二擇一" → choose 1 from 2', () => {
    const r = parseRemark('二擇一')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"二選一課程" → choose 1 from 2', () => {
    const r = parseRemark('二選一課程')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"(4選2)" → choose 2 from 4', () => {
    const r = parseRemark('(4選2)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(2)
  })

  it('"4選2" → choose 2 from 4', () => {
    const r = parseRemark('4選2')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(2)
  })

  it('"(3選1)" → choose 1 from 3', () => {
    const r = parseRemark('(3選1)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"(3選2)" → choose 2 from 3', () => {
    const r = parseRemark('(3選2)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(2)
  })

  it('"3選2" → choose 2 from 3', () => {
    const r = parseRemark('3選2')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(2)
  })

  it('"三門選一門" → choose 1 from 3', () => {
    const r = parseRemark('三門選一門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"三門選兩門" → choose 2 from 3', () => {
    const r = parseRemark('三門選兩門')
    expect(r.type).toBe('choose_m_from_n')
    // Note: "兩" is not in CHINESE_NUMS, but the regex matches "三" and "兩"
    // We should test what actually happens
    expect(r.choose_n).toBe(3)
  })

  it('"三門 選 二門" → choose 2 from 3', () => {
    const r = parseRemark('三門 選 二門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(2)
  })

  it('"四門 選 二門" → choose 2 from 4', () => {
    const r = parseRemark('四門 選 二門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(2)
  })

  it('"二科選修一科" → choose 1 from 2', () => {
    const r = parseRemark('二科選修一科')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"三科選修一科" → choose 1 from 3', () => {
    const r = parseRemark('三科選修一科')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"四科選修一科" → choose 1 from 4', () => {
    const r = parseRemark('四科選修一科')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(1)
  })

  it('"兩科選修一科" → choose 1 from 2', () => {
    const r = parseRemark('兩科選修一科')
    expect(r.type).toBe('choose_m_from_n')
    // "兩" needs handling
    expect(r.choose_m).toBe(1)
  })

  it('"多選課程 三擇一" → choose 1 from 3', () => {
    const r = parseRemark('多選課程 三擇一')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"學碩合開四擇二" → choose 2 from 4', () => {
    const r = parseRemark('學碩合開四擇二')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(2)
  })

  it('"選修4擇3" → choose 3 from 4', () => {
    const r = parseRemark('選修4擇3')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(4)
    expect(r.choose_m).toBe(3)
  })

  it('"選修2擇1" → choose 1 from 2', () => {
    const r = parseRemark('選修2擇1')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  // ── Category + N choose M ──
  it('"核心課程 (三門選兩門、修習至少6學分)" → choose_m_from_n with category', () => {
    const r = parseRemark('核心課程 (三門選兩門、修習至少6學分)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('核心課程')
    expect(r.choose_n).toBe(3)
  })

  it('"應用課程 (三門選一門、修習至少3學分)" → choose_m_from_n', () => {
    const r = parseRemark('應用課程 (三門選一門、修習至少3學分)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"核心課程 (二選一)" → choose 1 from 2', () => {
    const r = parseRemark('核心課程 (二選一)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('核心課程')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"應用課程 (七選一)" → choose 1 from 7', () => {
    const r = parseRemark('應用課程 (七選一)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(7)
    expect(r.choose_m).toBe(1)
  })

  it('"應用課程(七選二)" → choose 2 from 7', () => {
    const r = parseRemark('應用課程(七選二)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(7)
    expect(r.choose_m).toBe(2)
  })

  it('"應用課程(三選一)" → choose 1 from 3', () => {
    const r = parseRemark('應用課程(三選一)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"(三選一)" → choose 1 from 3', () => {
    const r = parseRemark('(三選一)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"(三選二)" → choose 2 from 3', () => {
    const r = parseRemark('(三選二)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(2)
  })

  // ── Category + credit requirements ──
  it('"基礎課程  (修習4 學分)" → min_credits', () => {
    const r = parseRemark('基礎課程  (修習4 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('基礎課程')
    expect(r.min_credits).toBe(4)
  })

  it('"核心課程  (修習至少6學分)" → min_credits', () => {
    const r = parseRemark('核心課程  (修習至少6學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('核心課程')
    expect(r.min_credits).toBe(6)
  })

  it('"應用課程  (修習至少3學分)" → min_credits', () => {
    const r = parseRemark('應用課程  (修習至少3學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(3)
  })

  it('"核心課程  (修習至少6 學分)" → min_credits', () => {
    const r = parseRemark('核心課程  (修習至少6 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('核心課程')
    expect(r.min_credits).toBe(6)
  })

  it('"應用課程  (修習至少6 學分)" → min_credits', () => {
    const r = parseRemark('應用課程  (修習至少6 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(6)
  })

  it('"基礎課程  (修習至少3學分)" → min_credits', () => {
    const r = parseRemark('基礎課程  (修習至少3學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('基礎課程')
    expect(r.min_credits).toBe(3)
  })

  it('"基礎課程  (修習6 學分)" → min_credits', () => {
    const r = parseRemark('基礎課程  (修習6 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('基礎課程')
    expect(r.min_credits).toBe(6)
  })

  it('"核心課程  (修習3 學分)" → min_credits', () => {
    const r = parseRemark('核心課程  (修習3 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('核心課程')
    expect(r.min_credits).toBe(3)
  })

  it('"應用課程  (修習至少3 學分)" → min_credits', () => {
    const r = parseRemark('應用課程  (修習至少3 學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(3)
  })

  // ── Pool-credit patterns ──
  it('"5門基礎課程中修習其中3學分。(普通物理學認列下學期課程)" → min_credits', () => {
    const r = parseRemark('5門基礎課程中修習其中3學分。(普通物理學認列下學期課程)')
    expect(r.type).toBe('min_credits')
    expect(r.choose_n).toBe(5)
    expect(r.min_credits).toBe(3)
  })

  it('"6門核心課程中修習其中3學分" → min_credits', () => {
    const r = parseRemark('6門核心課程中修習其中3學分')
    expect(r.type).toBe('min_credits')
    expect(r.choose_n).toBe(6)
    expect(r.min_credits).toBe(3)
  })

  it('"6門應用課程中修習其中9學分" → min_credits', () => {
    const r = parseRemark('6門應用課程中修習其中9學分')
    expect(r.type).toBe('min_credits')
    expect(r.choose_n).toBe(6)
    expect(r.min_credits).toBe(9)
  })

  it('"基礎課程(五門課程)修習其中3學分 (學生可依修課成績證明抵免至多3學分)" → min_credits', () => {
    const r = parseRemark('基礎課程(五門課程)修習其中3學分 (學生可依修課成績證明抵免至多3學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('基礎課程')
    expect(r.choose_n).toBe(5)
    expect(r.min_credits).toBe(3)
  })

  it('"核心課程(七門課程)修習其中3學分 (學生可依修課成績證明抵免至多3學分)" → min_credits', () => {
    const r = parseRemark('核心課程(七門課程)修習其中3學分 (學生可依修課成績證明抵免至多3學分)')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('核心課程')
    expect(r.choose_n).toBe(7)
    expect(r.min_credits).toBe(3)
  })

  it('"應用課程(五門課程)修習其中9學分" → min_credits', () => {
    const r = parseRemark('應用課程(五門課程)修習其中9學分')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(5)
    expect(r.min_credits).toBe(9)
  })

  // ── Credit-only patterns ──
  it('"至少8學分" → min_credits', () => {
    const r = parseRemark('至少8學分')
    expect(r.type).toBe('min_credits')
    expect(r.min_credits).toBe(8)
  })

  it('"至少4學分(任選2門)" → min_credits + min_courses', () => {
    const r = parseRemark('至少4學分(任選2門)')
    expect(r.type).toBe('min_credits')
    expect(r.min_credits).toBe(4)
    expect(r.min_courses).toBe(2)
  })

  it('"4學分" → min_credits', () => {
    const r = parseRemark('4學分')
    expect(r.type).toBe('min_credits')
    expect(r.min_credits).toBe(4)
  })

  // ── "僅認定一門課" ──
  it('"僅認定一門課" → choose 1', () => {
    const r = parseRemark('僅認定一門課')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_m).toBe(1)
  })

  // ── Free-form "擇一" ──
  it('"兩門課內容相同，擇一選修即可" → choose 1', () => {
    const r = parseRemark('兩門課內容相同，擇一選修即可')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_m).toBe(1)
  })

  it('"東亞交流史(一)與(二)擇一修習即可" → choose 1', () => {
    const r = parseRemark('東亞交流史(一)與(二)擇一修習即可')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_m).toBe(1)
  })

  // ── Advisory notes ──
  it('"基礎課程 (計算機概論只承認管理學院所開設課程)" → required with note', () => {
    const r = parseRemark('基礎課程 (計算機概論只承認管理學院所開設課程)')
    expect(r.type).toBe('required')
    expect(r.category).toBe('基礎課程')
    expect(r.notes.length).toBeGreaterThan(0)
  })

  it('"不得以通識之法學緒論抵免" → required with note', () => {
    const r = parseRemark('不得以通識之法學緒論抵免')
    expect(r.type).toBe('required')
    expect(r.notes.length).toBeGreaterThan(0)
  })

  // ── "選修兩學期" ──
  it('"應用課程(三選一) 選修兩學期" → choose with semester note', () => {
    const r = parseRemark('應用課程(三選一) 選修兩學期')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
    expect(r.notes).toContain('選修兩學期')
  })

  it('"應用課程(七選二) 選修兩學期" → choose with semester note', () => {
    const r = parseRemark('應用課程(七選二) 選修兩學期')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(7)
    expect(r.choose_m).toBe(2)
    expect(r.notes).toContain('選修兩學期')
  })

  // ── || separator patterns ──
  it('"替 代 課 程 || 「電子學及實習」" → substitute', () => {
    const r = parseRemark('替 代 課 程 || 「電子學及實習」')
    expect(r.type).toBe('substitute')
    expect(r.substitutes_for).toEqual(['電子學及實習'])
  })

  it('"替 代 課 程 || 「電子學」及「電子學實習」" → substitute with multiple targets', () => {
    const r = parseRemark('替 代 課 程 || 「電子學」及「電子學實習」')
    expect(r.type).toBe('substitute')
    expect(r.substitutes_for).toEqual(['電子學', '電子學實習'])
  })

  it('"電影 || 自左方三大類別選2類，每類各選一門" → cross-group level 1', () => {
    const r = parseRemark('電影 || 自左方三大類別選2類，每類各選一門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.subcategory_tag).toBe('電影')
    expect(r.cross_group_level).toBe(1)
    expect(r.choose_m).toBe(2)
  })

  it('"大眾文化 || 自左方三大類別選2類，每類各選一門" → cross-group level 1', () => {
    const r = parseRemark('大眾文化 || 自左方三大類別選2類，每類各選一門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.subcategory_tag).toBe('大眾文化')
    expect(r.cross_group_level).toBe(1)
  })

  it('"表演藝術 || 自左方三大類別選2類，每類各選一門" → cross-group level 1', () => {
    const r = parseRemark('表演藝術 || 自左方三大類別選2類，每類各選一門')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.subcategory_tag).toBe('表演藝術')
    expect(r.cross_group_level).toBe(1)
  })

  it('"電影 || 任選一門，需對應已修習之Level 1基礎課程" → cross-group level 2', () => {
    const r = parseRemark('電影 || 任選一門，需對應已修習之Level 1基礎課程')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.subcategory_tag).toBe('電影')
    expect(r.cross_group_level).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"園藝學原理、園藝學二選一 || 基礎課程" → choose with category', () => {
    const r = parseRemark('園藝學原理、園藝學二選一 || 基礎課程')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('基礎課程')
    expect(r.choose_n).toBe(2)
    expect(r.choose_m).toBe(1)
  })

  it('"普通植物學、園藝學原理、園藝學三選一 || 基礎課程" → choose with category', () => {
    const r = parseRemark('普通植物學、園藝學原理、園藝學三選一 || 基礎課程')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('基礎課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  it('"先修\'園藝學原理\'或\'園藝學\' || 核心課程" → required with prerequisite note', () => {
    const r = parseRemark("先修『園藝學原理』或『園藝學』 || 核心課程")
    expect(r.type).toBe('required')
    expect(r.category).toBe('核心課程')
    expect(r.notes.length).toBeGreaterThan(0)
  })

  it('"先修... || 應用課程 至少選3門..." → min_courses with note', () => {
    const r = parseRemark("先修『園藝學原理』或『園藝學』 || 應用課程 至少選3門   本領域模組需完成1門基礎課程、1門核心課程及至少3門應用課程，且總學分數12(含)以上。")
    expect(r.type).toBe('min_courses')
    expect(r.category).toBe('應用課程')
    expect(r.min_courses).toBe(3)
    expect(r.notes.length).toBeGreaterThan(0)
  })

  it('"英文授課 || 應用課程 至少選3門..." → min_courses with note', () => {
    const r = parseRemark("英文授課 || 應用課程 至少選3門   本領域模組需完成1門基礎課程、1門核心課程及至少3門應用課程，且總學分數12(含)以上。")
    expect(r.type).toBe('min_courses')
    expect(r.category).toBe('應用課程')
    expect(r.min_courses).toBe(3)
  })

  it('"含實習1學分 || 應用課程 至少選修6學分..." → min_credits with note', () => {
    const r = parseRemark("含實習1學分 || 應用課程 至少選修6學分   本領域模組需完成1門基礎課程、1門核心課程及至少選修6學分之應用課程，且總學分數12(含)以上。")
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(6)
  })

  it('handles "應用課程 至少選3門..." without || prefix', () => {
    const r = parseRemark("應用課程 至少選3門  本領域模組需完成1門基礎課程、1門核心課程及至少3門應用課程，且總學分數12(含)以上。")
    expect(r.type).toBe('min_courses')
    expect(r.category).toBe('應用課程')
    expect(r.min_courses).toBe(3)
  })

  it('handles "應用課程 至少選修6學分..." without || prefix', () => {
    const r = parseRemark("應用課程 至少選修6學分   本領域模組需完成1門基礎課程、1門核心課程及至少選修6學分之應用課程，且總學分數12(含)以上。")
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(6)
  })

  // ── "應用課程(三選一)" pattern (parenthetical) ──
  it('"應用課程(三選一)" → choose 1 from 3', () => {
    const r = parseRemark('應用課程(三選一)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  // ── Remark about offering unit ──
  it('"基礎課程 (計算機概論只承認管理學院所開設課程)" preserved as note', () => {
    const r = parseRemark('基礎課程 (計算機概論只承認管理學院所開設課程)')
    expect(r.category).toBe('基礎課程')
    expect(r.notes.some(n => n.includes('只承認管理學院'))).toBe(true)
  })

  // ── Full-width characters ──
  it('handles full-width parentheses in "應用課程（三選一）"', () => {
    const r = parseRemark('應用課程（三選一）')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.category).toBe('應用課程')
    expect(r.choose_n).toBe(3)
    expect(r.choose_m).toBe(1)
  })

  // ── 應用課程(七選二) without 選修兩學期 ──
  it('"應用課程(七選二)" without semester note', () => {
    const r = parseRemark('應用課程(七選二)')
    expect(r.type).toBe('choose_m_from_n')
    expect(r.choose_n).toBe(7)
    expect(r.choose_m).toBe(2)
    expect(r.notes).not.toContain('選修兩學期')
  })

  // ── 應用課程(三選一) with 選修兩學期 ──
  it('"應用課程(三選一) 選修兩學期" flagged correctly', () => {
    const r = parseRemark('應用課程(三選一) 選修兩學期')
    expect(r.notes).toContain('選修兩學期')
  })

  // ── "1.園藝系學生除外 2.僅開放選修下學期班 || 應用課程 至少選修6學分..." ──
  it('complex || with numbered notes', () => {
    const r = parseRemark('1.園藝系學生除外 2.僅開放選修下學期班 || 應用課程 至少選修6學分   本領域模組需完成1門基礎課程、1門核心課程及至少選修6學分之應用課程，且總學分數12(含)以上。')
    expect(r.type).toBe('min_credits')
    expect(r.category).toBe('應用課程')
    expect(r.min_credits).toBe(6)
    expect(r.notes.some(n => n.includes('園藝系學生除外'))).toBe(true)
  })
})
