import type {
  Module, StudentCourse, CourseGroup, GroupResult, VerificationResult,
} from './models.ts'

/** Normalize course name for matching: trim, collapse spaces, normalize width */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[Ⅰ]/g, 'I')
    .replace(/[Ⅱ]/g, 'II')
    .replace(/[Π]/g, 'II')
}

/** Build a lookup map from student courses */
function buildStudentLookup(studentCourses: readonly StudentCourse[]): Map<string, StudentCourse[]> {
  const map = new Map<string, StudentCourse[]>()
  for (const sc of studentCourses) {
    const key = normalizeName(sc.name)
    const existing = map.get(key) ?? []
    existing.push(sc)
    map.set(key, existing)
  }
  return map
}

/** Check if a student has taken a specific course */
function findMatch(
  lookup: Map<string, StudentCourse[]>,
  courseName: string,
): StudentCourse | undefined {
  const key = normalizeName(courseName)
  const matches = lookup.get(key)
  return matches?.[0]
}

/** Count semester occurrences for a course (for 選修兩學期 requirement) */
function countSemesters(
  lookup: Map<string, StudentCourse[]>,
  courseName: string,
): number {
  const key = normalizeName(courseName)
  const matches = lookup.get(key)
  if (!matches) return 0
  // Count distinct semesters
  const semesters = new Set(matches.map(m => m.semester ?? 'unknown'))
  return semesters.size
}

/** Verify a single course group */
function verifyGroup(
  group: CourseGroup,
  lookup: Map<string, StudentCourse[]>,
): GroupResult {
  const coursesInGroup = group.courses.map(c => c.name_zh)
  const coursesMatched: string[] = []
  let creditsMatched = 0

  // Find which courses in this group the student has taken
  for (const course of group.courses) {
    const match = findMatch(lookup, course.name_zh)
    if (match) {
      // Check for 選修兩學期 — this is a per-COURSE constraint from the original remark,
      // not a group-level one. Check the individual course's remark.
      const courseRequiresTwoSemesters = course.remark?.includes('選修兩學期') ?? false
      if (courseRequiresTwoSemesters) {
        const semCount = countSemesters(lookup, course.name_zh)
        if (semCount >= 2) {
          coursesMatched.push(course.name_zh)
          creditsMatched += match.credits
        }
      } else {
        coursesMatched.push(course.name_zh)
        creditsMatched += match.credits
      }
    }
  }

  let is_satisfied = false
  let detail = ''

  switch (group.rule.type) {
    case 'required': {
      // All courses in group must be taken
      is_satisfied = coursesMatched.length === group.courses.length
      const missing = coursesInGroup.filter(c => !coursesMatched.includes(c))
      detail = is_satisfied
        ? `已完成全部 ${group.courses.length} 門必修`
        : `缺少: ${missing.join(', ')}`
      break
    }
    case 'choose_m_from_n': {
      const m = group.rule.choose_m ?? 1
      is_satisfied = coursesMatched.length >= m
      detail = `已選 ${coursesMatched.length}/${m} 門`
      if (!is_satisfied) {
        detail += ` (尚需 ${m - coursesMatched.length} 門)`
      }
      break
    }
    case 'min_credits': {
      const minCredits = group.rule.min_credits ?? 0
      const minCourses = group.rule.min_courses
      is_satisfied = creditsMatched >= minCredits
      if (minCourses !== undefined) {
        is_satisfied = is_satisfied && coursesMatched.length >= minCourses
        detail = `已修 ${creditsMatched}/${minCredits} 學分, ${coursesMatched.length}/${minCourses} 門`
      } else {
        detail = `已修 ${creditsMatched}/${minCredits} 學分`
      }
      if (!is_satisfied) {
        const creditGap = Math.max(0, minCredits - creditsMatched)
        if (creditGap > 0) detail += ` (尚需 ${creditGap} 學分)`
      }
      break
    }
    case 'min_courses': {
      const minCourses = group.rule.min_courses ?? 1
      is_satisfied = coursesMatched.length >= minCourses
      detail = `已選 ${coursesMatched.length}/${minCourses} 門`
      if (!is_satisfied) {
        detail += ` (尚需 ${minCourses - coursesMatched.length} 門)`
      }
      break
    }
    case 'substitute': {
      // For substitute courses, at least one course in the group must be taken
      is_satisfied = coursesMatched.length >= 1
      detail = is_satisfied
        ? `已修替代課程: ${coursesMatched.join(', ')}`
        : `未修習替代課程`
      break
    }
  }

  return {
    label: group.label,
    rule: group.rule,
    courses_in_group: coursesInGroup,
    courses_matched: coursesMatched,
    credits_matched: creditsMatched,
    is_satisfied,
    detail,
  }
}

/**
 * Special verification for 影像與視覺文化 cross-group dependency.
 * Level 1: pick 2 categories out of 3, one course from each
 * Level 2: pick 1 course from a category that was chosen in Level 1
 */
function verifyCrossGroupModule(
  groups: readonly CourseGroup[],
  lookup: Map<string, StudentCourse[]>,
): readonly GroupResult[] {
  // Separate Level 1, Level 2, and other groups
  const level1Groups = groups.filter(g => g.rule.cross_group_level === 1)
  const level2Groups = groups.filter(g => g.rule.cross_group_level === 2)
  const otherGroups = groups.filter(g => !g.rule.cross_group_level)

  // Check Level 1: which categories have at least one matched course?
  const level1Results: GroupResult[] = []
  const satisfiedCategories = new Set<string>()

  // Group Level 1 courses by subcategory_tag
  const l1ByTag = new Map<string, CourseGroup[]>()
  for (const g of level1Groups) {
    const tag = g.rule.subcategory_tag ?? 'unknown'
    const list = l1ByTag.get(tag) ?? []
    list.push(g)
    l1ByTag.set(tag, list)
  }

  // For Level 1, we need 2 categories satisfied (one course from each of 2 different categories)
  for (const [tag, tagGroups] of l1ByTag) {
    let tagMatched = false
    for (const g of tagGroups) {
      for (const c of g.courses) {
        if (findMatch(lookup, c.name_zh)) {
          tagMatched = true
          satisfiedCategories.add(tag)
          break
        }
      }
      if (tagMatched) break
    }
  }

  const level1Satisfied = satisfiedCategories.size >= 2
  // Create a single Level 1 result
  const allL1Courses = level1Groups.flatMap(g => g.courses)
  const l1Matched = allL1Courses.filter(c => findMatch(lookup, c.name_zh))
  level1Results.push({
    label: `Level 1: 三大類別選2類，每類各選一門`,
    rule: { type: 'choose_m_from_n', choose_m: 2, choose_n: 3, notes: [] },
    courses_in_group: allL1Courses.map(c => c.name_zh),
    courses_matched: l1Matched.map(c => c.name_zh),
    credits_matched: l1Matched.reduce((sum, c) => sum + c.credits, 0),
    is_satisfied: level1Satisfied,
    detail: level1Satisfied
      ? `已修 ${satisfiedCategories.size}/2 類別`
      : `已修 ${satisfiedCategories.size}/2 類別 (需再選 ${2 - satisfiedCategories.size} 類別)`,
  })

  // Check Level 2: must correspond to a satisfied Level 1 category
  const allL2Courses = level2Groups.flatMap(g => g.courses)
  const l2Eligible = level2Groups.filter(g =>
    satisfiedCategories.has(g.rule.subcategory_tag ?? '')
  )
  const l2EligibleCourses = l2Eligible.flatMap(g => g.courses)
  const l2Matched = l2EligibleCourses.filter(c => findMatch(lookup, c.name_zh))
  const level2Satisfied = l2Matched.length >= 1

  level1Results.push({
    label: `Level 2: 任選一門 (需對應已修Level 1類別)`,
    rule: { type: 'choose_m_from_n', choose_m: 1, notes: [] },
    courses_in_group: allL2Courses.map(c => c.name_zh),
    courses_matched: l2Matched.map(c => c.name_zh),
    credits_matched: l2Matched.reduce((sum, c) => sum + c.credits, 0),
    is_satisfied: level2Satisfied,
    detail: level2Satisfied
      ? `已選 1 門對應課程`
      : `需從已修Level 1類別中選修1門Level 2課程`,
  })

  // Add other groups (like the Level 3 required course)
  const otherResults = otherGroups.map(g => verifyGroup(g, lookup))

  return [...level1Results, ...otherResults]
}

/** Main verification function */
export function verifyModule(
  module: Module,
  studentCourses: readonly StudentCourse[],
): VerificationResult {
  const lookup = buildStudentLookup(studentCourses)

  // Check if this is a cross-group module (影像與視覺文化)
  const hasCrossGroup = module.groups.some(g => g.rule.cross_group_level !== undefined)
  const groupResults = hasCrossGroup
    ? verifyCrossGroupModule(module.groups, lookup)
    : module.groups.map(g => verifyGroup(g, lookup))

  // Calculate totals from all matched courses (deduplicated by course name)
  const allMatchedNames = new Set<string>()
  let totalCredits = 0
  for (const gr of groupResults) {
    for (const name of gr.courses_matched) {
      if (!allMatchedNames.has(name)) {
        allMatchedNames.add(name)
        // Find the actual student credit for this course
        const match = findMatch(lookup, name)
        if (match) totalCredits += match.credits
      }
    }
  }

  const totalCourses = allMatchedNames.size

  // Check group satisfaction with special handling for substitute groups.
  // Substitute groups that reference each other are reciprocal alternatives —
  // at least one path must be satisfied, not all.
  const substituteResults = groupResults.filter(gr => gr.rule.type === 'substitute')
  const nonSubstituteResults = groupResults.filter(gr => gr.rule.type !== 'substitute')

  const nonSubsSatisfied = nonSubstituteResults.every(gr => gr.is_satisfied)
  const subsSatisfied = substituteResults.length === 0
    || substituteResults.some(gr => gr.is_satisfied)

  const allGroupsSatisfied = nonSubsSatisfied && subsSatisfied
  const meetsCoursesReq = totalCourses >= module.certification.min_courses
  const meetsCreditsReq = totalCredits >= module.certification.min_credits

  const is_certified = allGroupsSatisfied && meetsCoursesReq && meetsCreditsReq

  const unmet: string[] = []
  if (!meetsCoursesReq) {
    unmet.push(`總課程數不足: ${totalCourses}/${module.certification.min_courses}`)
  }
  if (!meetsCreditsReq) {
    unmet.push(`總學分數不足: ${totalCredits}/${module.certification.min_credits}`)
  }
  for (const gr of nonSubstituteResults) {
    if (!gr.is_satisfied) {
      unmet.push(`${gr.label}: ${gr.detail}`)
    }
  }
  if (!subsSatisfied) {
    unmet.push(`替代課程: 需修習其中一組替代課程`)
  }

  // Collect advisory notes
  const advisory: string[] = []
  for (const gr of groupResults) {
    for (const note of gr.rule.notes) {
      if (!advisory.includes(note)) {
        advisory.push(note)
      }
    }
  }

  return {
    module_name: module.name_zh,
    module_key: module.key,
    is_certified,
    total_courses_matched: totalCourses,
    total_credits_matched: totalCredits,
    required_courses: module.certification.min_courses,
    required_credits: module.certification.min_credits,
    group_results: groupResults,
    unmet_reasons: unmet,
    advisory_notes: advisory,
  }
}
