import type { ModuleCourse, CourseGroup, SelectionRule } from './models.ts'
import { parseRemark } from './remark-parser.ts'

/**
 * Derive a grouping key from a parsed SelectionRule.
 *
 * Courses sharing the same grouping key are merged into one pool,
 * even if their raw remark text differs (e.g. different prerequisites
 * before the || separator).
 */
function ruleGroupKey(rule: SelectionRule): string {
  const cat = rule.category ?? ''
  const tag = rule.subcategory_tag ?? ''
  const level = rule.cross_group_level ?? ''

  switch (rule.type) {
    case 'required':
      return `required|${cat}`
    case 'choose_m_from_n':
      if (tag) return `choose|${tag}|L${level}`
      return `choose|${cat}|m=${rule.choose_m}|n=${rule.choose_n ?? '?'}`
    case 'min_credits':
      return `min_credits|${cat}|cr=${rule.min_credits}|n=${rule.choose_n ?? ''}`
    case 'min_courses':
      return `min_courses|${cat}|m=${rule.min_courses}`
    case 'substitute':
      return `substitute|${rule.substitutes_for?.join(',') ?? ''}`
    default:
      return `other|${cat}`
  }
}

/**
 * Group courses into CourseGroups based on their 備註 (remark) field.
 *
 * Grouping strategy:
 * 1. "僅認定一門課" → consecutive adjacency grouping (split by gaps)
 * 2. No remark → each course is its own "required" group
 * 3. All others → group by semantic rule key (type + category + params),
 *    NOT by raw remark text. This merges courses that share the same
 *    selection rule but have different advisory notes / prerequisites.
 */
export function groupCourses(courses: readonly ModuleCourse[]): readonly CourseGroup[] {
  const groups: CourseGroup[] = []
  const visited = new Set<number>()

  // ── Pass 1: "僅認定一門課" with consecutive adjacency ──
  for (let i = 0; i < courses.length; i++) {
    if (visited.has(i)) continue
    if (courses[i].remark !== '僅認定一門課') continue

    const groupCourses: ModuleCourse[] = [courses[i]]
    visited.add(i)
    let j = i + 1
    while (j < courses.length && courses[j].remark === '僅認定一門課') {
      groupCourses.push(courses[j])
      visited.add(j)
      j++
    }

    const rule = parseRemark('僅認定一門課')
    groups.push({
      label: `${groupCourses.map(c => c.name_zh).join(' / ')} (擇一)`,
      rule: { ...rule, choose_n: groupCourses.length },
      courses: groupCourses,
    })
  }

  // ── Pass 2: group remaining by semantic rule key ──
  const keyGroups = new Map<string, {
    rule: SelectionRule
    courses: ModuleCourse[]
    allNotes: string[]
  }>()

  for (let i = 0; i < courses.length; i++) {
    if (visited.has(i)) continue

    const remark = courses[i].remark

    // No remark → individually required
    if (!remark) {
      groups.push({
        label: courses[i].name_zh,
        rule: parseRemark(null),
        courses: [courses[i]],
      })
      visited.add(i)
      continue
    }

    const rule = parseRemark(remark)
    const key = ruleGroupKey(rule)

    const existing = keyGroups.get(key)
    if (existing) {
      existing.courses.push(courses[i])
      // Collect unique notes
      for (const note of rule.notes) {
        if (note && !existing.allNotes.includes(note)) {
          existing.allNotes.push(note)
        }
      }
    } else {
      keyGroups.set(key, {
        rule,
        courses: [courses[i]],
        allNotes: [...rule.notes],
      })
    }
    visited.add(i)
  }

  // Convert key groups to CourseGroups
  for (const [_key, { rule, courses: groupCourseList, allNotes }] of keyGroups) {
    // Merge collected notes into the rule
    const mergedRule: SelectionRule = {
      ...rule,
      notes: allNotes,
      choose_n: rule.choose_n ?? (rule.type === 'choose_m_from_n' ? groupCourseList.length : rule.choose_n),
    }

    groups.push({
      label: buildGroupLabel(mergedRule, groupCourseList),
      rule: mergedRule,
      courses: groupCourseList,
    })
  }

  return groups
}

function buildGroupLabel(rule: SelectionRule, courses: readonly ModuleCourse[]): string {
  const category = rule.category ?? ''
  const prefix = category ? `[${category}] ` : ''

  switch (rule.type) {
    case 'required':
      if (courses.length === 1) return `${prefix}${courses[0].name_zh}`
      return `${prefix}必修 (${courses.length}門)`
    case 'choose_m_from_n':
      return `${prefix}${rule.choose_n ?? courses.length}選${rule.choose_m}`
    case 'min_credits':
      return `${prefix}至少${rule.min_credits}學分 (${courses.length}門中選)`
    case 'min_courses':
      return `${prefix}至少${rule.min_courses}門 (${courses.length}門中選)`
    case 'substitute':
      return `替代: ${courses.map(c => c.name_zh).join(', ')}`
    default:
      return courses.map(c => c.name_zh).join(', ')
  }
}
