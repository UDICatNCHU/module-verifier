import type { SelectionRule, RuleType } from './models.ts'

/** Chinese numeral to integer mapping */
const CHINESE_NUMS: Record<string, number> = {
  '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}

/** Full-width to half-width character mapping */
const FULLWIDTH_MAP: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '（': '(', '）': ')', '，': ',',
}

/** Chinese numeral character class for regex (without anchoring) */
const CN = '一二兩三四五六七八九十'

/** Convert a Chinese numeral string or digit string to number */
export function parseChineseOrDigit(s: string): number | null {
  const trimmed = s.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  if (CHINESE_NUMS[trimmed] !== undefined) return CHINESE_NUMS[trimmed]
  return null
}

/** Normalize full-width characters to half-width */
function normalizeFullWidth(s: string): string {
  return s.replace(/[０-９（），]/g, ch => FULLWIDTH_MAP[ch] ?? ch)
}

/** Category labels in order of matching */
const CATEGORIES = ['基礎課程', '核心課程', '應用課程'] as const

/** Extract category prefix from text, returning [category, remainder] */
function extractCategory(text: string): [string | undefined, string] {
  for (const cat of CATEGORIES) {
    if (text.startsWith(cat)) {
      return [cat, text.slice(cat.length).trim()]
    }
  }
  return [undefined, text]
}

function makeRule(overrides: Partial<SelectionRule> & { type: RuleType }): SelectionRule {
  return {
    notes: [],
    ...overrides,
  }
}

/**
 * Parse a 備註 string into a structured SelectionRule.
 *
 * This handles all 79 distinct patterns found in the NCHU modules_data.json.
 */
export function parseRemark(raw: string | null | undefined): SelectionRule {
  if (!raw || raw.trim() === '') {
    return makeRule({ type: 'required' })
  }

  let text = normalizeFullWidth(raw.trim())
  const notes: string[] = []

  // ─── Handle || separator ───
  if (text.includes('||')) {
    const [left, right] = text.split('||').map(s => s.trim())

    // 替代課程 pattern: "替 代 課 程 || 「電子學及實習」"
    if (/替\s*代\s*課\s*程/.test(left)) {
      const cleaned = right.trim()
      // Split on 「...」及「...」 pattern (multiple quoted names joined by 及)
      // But NOT on 及 inside a single 「...」 pair
      const quoted = cleaned.match(/「[^」]+」/g)
      let substitutes_for: string[]
      if (quoted && quoted.length > 1) {
        // Multiple 「」 pairs: "「電子學」及「電子學實習」"
        substitutes_for = quoted.map(q => q.replace(/[「」]/g, '').trim())
      } else {
        // Single 「」 or no quotes: "「電子學及實習」" → treat as one name
        substitutes_for = [cleaned.replace(/[「」『』]/g, '').trim()]
      }
      return makeRule({
        type: 'substitute',
        substitutes_for,
        notes: [`替代課程: ${right}`],
      })
    }

    // Cross-group category tags (影像與視覺文化 module)
    const crossGroupCategories = ['電影', '大眾文化', '表演藝術']
    if (crossGroupCategories.includes(left)) {
      if (right.includes('自左方三大類別選2類')) {
        return makeRule({
          type: 'choose_m_from_n',
          choose_m: 2,
          choose_n: 3,
          subcategory_tag: left,
          cross_group_level: 1,
          notes: [right],
        })
      }
      if (right.includes('任選一門') && right.includes('Level 1')) {
        return makeRule({
          type: 'choose_m_from_n',
          choose_m: 1,
          subcategory_tag: left,
          cross_group_level: 2,
          notes: [right],
        })
      }
    }

    // "園藝學原理、園藝學二選一 || 基礎課程" or "普通植物學、園藝學原理、園藝學三選一 || 基礎課程"
    const leftChooseMatch = left.match(new RegExp(`([${CN}\\d]+)\\s*選\\s*([${CN}\\d]+)`))
    if (leftChooseMatch) {
      const n = parseChineseOrDigit(leftChooseMatch[1])
      const m = parseChineseOrDigit(leftChooseMatch[2])
      const [category] = extractCategory(right)
      return makeRule({
        type: 'choose_m_from_n',
        choose_n: n ?? undefined,
        choose_m: m ?? undefined,
        category,
        notes: [left],
      })
    }

    // Left side is advisory (prerequisite, etc.), right side is the actual rule
    notes.push(left)
    text = right
  }

  // ─── Extract category prefix ───
  const [category, remainder] = extractCategory(text)

  if (remainder === '' || remainder === '必修') {
    return makeRule({ type: 'required', category, notes })
  }

  if (text === '必修') {
    return makeRule({ type: 'required', notes })
  }

  const rule_text = remainder

  // ─── Pattern 1: "N門X課程中修習其中M學分" ───
  const poolCreditPattern = rule_text.match(/(\d+)門.*?課程中.*?修習.*?(\d+)學分/)
  if (poolCreditPattern) {
    return makeRule({
      type: 'min_credits',
      category,
      choose_n: parseInt(poolCreditPattern[1], 10),
      min_credits: parseInt(poolCreditPattern[2], 10),
      notes: [...notes, ...extractExtraNotes(rule_text)],
    })
  }

  // ─── Pattern 2: "X(N門課程)修習其中M學分" ───
  const parenPoolPattern = rule_text.match(new RegExp(`\\(([${CN}\\d]+)門課程\\)修習.*?(\\d+)學分`))
  if (parenPoolPattern) {
    const n = parseChineseOrDigit(parenPoolPattern[1])
    return makeRule({
      type: 'min_credits',
      category,
      choose_n: n ?? undefined,
      min_credits: parseInt(parenPoolPattern[2], 10),
      notes: [...notes, ...extractExtraNotes(rule_text)],
    })
  }

  // ─── Pattern 3: "至少選N門" / "至少選修N學分" ───
  const atLeastSelectCourses = rule_text.match(/至少選(?:修)?(\d+)門/)
  if (atLeastSelectCourses) {
    return makeRule({
      type: 'min_courses',
      category,
      min_courses: parseInt(atLeastSelectCourses[1], 10),
      notes: [...notes, ...extractExtraNotes(rule_text)],
    })
  }

  const atLeastSelectCredits = rule_text.match(/至少選修(\d+)學分/)
  if (atLeastSelectCredits) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(atLeastSelectCredits[1], 10),
      notes: [...notes, ...extractExtraNotes(rule_text)],
    })
  }

  // ─── Pattern 4: N選M / N擇M / N門選M門 (BEFORE credit patterns) ───
  // Must come before "修習至少N學分" to handle "三門選兩門、修習至少6學分" correctly
  const choosePatterns: RegExp[] = [
    // "選修N擇M" pattern
    /選修(\d+)擇(\d+)/,
    // "(N選M)" or "N選M" with Chinese or digit
    new RegExp(`[（(]?([${CN}\\d]+)\\s*選\\s*([${CN}\\d]+)[）)]?`),
    // "N擇M" with Chinese or digit
    new RegExp(`([${CN}\\d]+)\\s*擇\\s*([${CN}\\d]+)`),
    // "N門選M門" or "N門 選 M門"
    new RegExp(`([${CN}\\d]+)門?\\s*選\\s*([${CN}\\d]+)門?`),
    // "N科選修M科" or "N科選M科"
    new RegExp(`([${CN}\\d]+)科選修?([${CN}\\d]+)科`),
  ]

  for (const pattern of choosePatterns) {
    const match = rule_text.match(pattern)
    if (match) {
      const n = parseChineseOrDigit(match[1])
      const m = parseChineseOrDigit(match[2])
      const hasSemesterNote = rule_text.includes('選修兩學期')
      const extraNotes = hasSemesterNote ? ['選修兩學期'] : []
      return makeRule({
        type: 'choose_m_from_n',
        category,
        choose_n: n ?? undefined,
        choose_m: m ?? undefined,
        notes: [...notes, ...extraNotes],
      })
    }
  }

  // ─── Pattern 5: "修習至少N學分" ───
  const minCreditsAtLeast = rule_text.match(/修習至少\s*(\d+)\s*學分/)
  if (minCreditsAtLeast) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(minCreditsAtLeast[1], 10),
      notes,
    })
  }

  // ─── Pattern 6: "修習N學分" (exact) ───
  const exactCredits = rule_text.match(/修習\s*(\d+)\s*學分/)
  if (exactCredits) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(exactCredits[1], 10),
      notes,
    })
  }

  // ─── Pattern 7: "至少N學分(任選M門)" ───
  const creditAndCourses = rule_text.match(/至少(\d+)學分\s*\(任選(\d+)門\)/)
  if (creditAndCourses) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(creditAndCourses[1], 10),
      min_courses: parseInt(creditAndCourses[2], 10),
      notes,
    })
  }

  // ─── Pattern 8: "至少N學分" ───
  const atLeastCredits = rule_text.match(/至少(\d+)學分/)
  if (atLeastCredits) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(atLeastCredits[1], 10),
      notes,
    })
  }

  // ─── Pattern 9: "N學分" (bare) ───
  const bareCredits = rule_text.match(/^(\d+)學分$/)
  if (bareCredits) {
    return makeRule({
      type: 'min_credits',
      category,
      min_credits: parseInt(bareCredits[1], 10),
      notes,
    })
  }

  // ─── Pattern 10: "僅認定一門課" ───
  if (rule_text.includes('僅認定一門課') || rule_text.includes('僅認定一門')) {
    return makeRule({
      type: 'choose_m_from_n',
      category,
      choose_m: 1,
      notes,
    })
  }

  // ─── Pattern 11: "擇一" free-form ───
  if (rule_text.includes('擇一')) {
    return makeRule({
      type: 'choose_m_from_n',
      category,
      choose_m: 1,
      notes: [...notes, rule_text],
    })
  }

  // ─── Pattern 12: Advisory notes ───
  if (rule_text.includes('不得以') || rule_text.includes('只承認') || rule_text.includes('認列')) {
    return makeRule({
      type: 'required',
      category,
      notes: [...notes, rule_text],
    })
  }

  // ─── Fallback: required with note ───
  return makeRule({
    type: 'required',
    category,
    notes: [...notes, rule_text].filter(n => n !== ''),
  })
}

/** Extract extra informational notes from rule text */
function extractExtraNotes(text: string): string[] {
  const notes: string[] = []
  const parenNotes = text.match(/\(學生[^)]+\)/)
  if (parenNotes) notes.push(parenNotes[0])
  const physicsNote = text.match(/\([^)]*認列[^)]+\)/)
  if (physicsNote) notes.push(physicsNote[0])
  const moduleDesc = text.match(/本領域模組需完成.+/)
  if (moduleDesc) notes.push(moduleDesc[0])
  return notes
}
