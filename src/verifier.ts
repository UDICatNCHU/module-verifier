import type {
  Module, StudentCourse, CourseGroup, GroupResult, VerificationResult, CourseMatchDetail,
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

/** Indexes for matching student courses by name and by course_code */
interface StudentLookup {
  readonly byName: Map<string, StudentCourse[]>
  readonly byCode: Map<string, StudentCourse[]>
}

/** Build lookup indexes from student courses */
function buildStudentLookup(studentCourses: readonly StudentCourse[]): StudentLookup {
  const byName = new Map<string, StudentCourse[]>()
  const byCode = new Map<string, StudentCourse[]>()
  for (const sc of studentCourses) {
    const nameKey = normalizeName(sc.name)
    const nameList = byName.get(nameKey) ?? []
    nameList.push(sc)
    byName.set(nameKey, nameList)

    if (sc.course_code) {
      const codeList = byCode.get(sc.course_code) ?? []
      codeList.push(sc)
      byCode.set(sc.course_code, codeList)
    }
  }
  return { byName, byCode }
}

/**
 * Filter matches by semester half when the module course has an
 * `only_semester` restriction (e.g. 「普通物理學認列下學期課程」).
 * semester format is "YYY-N" where N is 1 (上) or 2 (下).
 */
function filterBySemester(
  matches: readonly StudentCourse[],
  onlySemester: '上' | '下' | undefined,
): StudentCourse[] {
  if (!onlySemester) return [...matches]
  const suffix = onlySemester === '上' ? '-1' : '-2'
  return matches.filter(m => m.semester?.endsWith(suffix))
}

/** Find all student records matching a module course (code-first, then name) */
function findAllMatches(
  lookup: StudentLookup,
  courseCodes: readonly string[] | undefined,
  courseName: string,
  onlySemester?: '上' | '下',
): StudentCourse[] {
  // Prefer course_codes match when both sides have codes
  if (courseCodes && courseCodes.length > 0) {
    const results: StudentCourse[] = []
    for (const code of courseCodes) {
      const byCode = lookup.byCode.get(code)
      if (byCode) results.push(...byCode)
    }
    if (results.length > 0) return filterBySemester(results, onlySemester)
  }
  // Fall back to name match
  const key = normalizeName(courseName)
  const byName = lookup.byName.get(key) ?? []
  return filterBySemester(byName, onlySemester)
}

/** Check if a student has taken a specific course */
function findMatch(
  lookup: StudentLookup,
  courseCodes: readonly string[] | undefined,
  courseName: string,
  onlySemester?: '上' | '下',
): StudentCourse | undefined {
  return findAllMatches(lookup, courseCodes, courseName, onlySemester)[0]
}

/** Find match and report how it was matched (code vs name) */
function findMatchWithMethod(
  lookup: StudentLookup,
  courseCodes: readonly string[] | undefined,
  courseName: string,
  onlySemester?: '上' | '下',
): { course: StudentCourse; method: 'code' | 'name' } | undefined {
  if (courseCodes && courseCodes.length > 0) {
    for (const code of courseCodes) {
      const byCode = lookup.byCode.get(code) ?? []
      const filtered = filterBySemester(byCode, onlySemester)
      if (filtered.length > 0) return { course: filtered[0], method: 'code' }
    }
  }
  const key = normalizeName(courseName)
  const byName = lookup.byName.get(key) ?? []
  const filtered = filterBySemester(byName, onlySemester)
  if (filtered.length > 0) return { course: filtered[0], method: 'name' }
  return undefined
}

/** Count semester occurrences for a course (for 選修兩學期 requirement) */
function countSemesters(
  lookup: StudentLookup,
  courseCodes: readonly string[] | undefined,
  courseName: string,
  onlySemester?: '上' | '下',
): number {
  const matches = findAllMatches(lookup, courseCodes, courseName, onlySemester)
  if (matches.length === 0) return 0
  const semesters = new Set(matches.map(m => m.semester ?? 'unknown'))
  return semesters.size
}

/**
 * Sum credits across all student records that match a module course — used
 * for 選修兩學期 courses where each semester's credits must be counted.
 * De-duplicates by (student_course_code, semester) so the same record
 * appearing in both byCode and byName lookups isn't double-counted.
 */
function sumAllCredits(
  lookup: StudentLookup,
  courseCodes: readonly string[] | undefined,
  courseName: string,
  onlySemester?: '上' | '下',
): number {
  const matches = findAllMatches(lookup, courseCodes, courseName, onlySemester)
  const seen = new Set<string>()
  let total = 0
  for (const m of matches) {
    const key = `${m.course_code ?? m.name}|${m.semester ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    total += m.credits
  }
  return total
}

/** Verify a single course group */
function verifyGroup(
  group: CourseGroup,
  lookup: StudentLookup,
): GroupResult {
  const coursesInGroup = group.courses.map(c => c.name_zh)
  const coursesMatched: string[] = []
  const matchDetails: CourseMatchDetail[] = []
  let creditsMatched = 0

  // Find which courses in this group the student has taken
  for (const course of group.courses) {
    const matchResult = findMatchWithMethod(lookup, course.course_codes, course.name_zh, course.only_semester)
    if (matchResult) {
      const { course: match, method } = matchResult
      // Check for 選修兩學期 — this is a per-COURSE constraint from the original remark,
      // not a group-level one. Check the individual course's remark.
      const courseRequiresTwoSemesters = course.remark?.includes('選修兩學期') ?? false
      if (courseRequiresTwoSemesters) {
        const semCount = countSemesters(lookup, course.course_codes, course.name_zh, course.only_semester)
        if (semCount >= 2) {
          coursesMatched.push(course.name_zh)
          // Sum all semesters' credits, not just the first match — otherwise
          // a 2-semester course ends up counted as a single semester.
          creditsMatched += sumAllCredits(lookup, course.course_codes, course.name_zh, course.only_semester)
          matchDetails.push({
            module_course_name: course.name_zh,
            student_course_name: match.name,
            student_course_code: match.course_code,
            module_course_codes: course.course_codes,
            match_method: method,
            credits: sumAllCredits(lookup, course.course_codes, course.name_zh, course.only_semester),
            semester: match.semester,
            score: match.grade,
          })
        }
      } else {
        coursesMatched.push(course.name_zh)
        creditsMatched += match.credits
        matchDetails.push({
          module_course_name: course.name_zh,
          student_course_name: match.name,
          student_course_code: match.course_code,
          module_course_codes: course.course_codes,
          match_method: method,
          credits: match.credits,
          semester: match.semester,
          score: match.grade,
        })
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
    match_details: matchDetails,
  }
}

/**
 * Special verification for 影像與視覺文化 cross-group dependency.
 * Level 1: pick 2 categories out of 3, one course from each
 * Level 2: pick 1 course from a category that was chosen in Level 1
 */
function verifyCrossGroupModule(
  groups: readonly CourseGroup[],
  lookup: StudentLookup,
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
        if (findMatch(lookup, c.course_codes, c.name_zh, c.only_semester)) {
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
  const l1MatchDetails: CourseMatchDetail[] = []
  const l1MatchedNames: string[] = []
  let l1Credits = 0
  for (const c of allL1Courses) {
    const mr = findMatchWithMethod(lookup, c.course_codes, c.name_zh, c.only_semester)
    if (mr) {
      l1MatchedNames.push(c.name_zh)
      l1Credits += mr.course.credits
      l1MatchDetails.push({
        module_course_name: c.name_zh,
        student_course_name: mr.course.name,
        student_course_code: mr.course.course_code,
        module_course_codes: c.course_codes,
        match_method: mr.method,
        credits: mr.course.credits,
        semester: mr.course.semester,
      })
    }
  }
  level1Results.push({
    label: `Level 1: 三大類別選2類，每類各選一門`,
    rule: { type: 'choose_m_from_n', choose_m: 2, choose_n: 3, notes: [] },
    courses_in_group: allL1Courses.map(c => c.name_zh),
    courses_matched: l1MatchedNames,
    credits_matched: l1Credits,
    is_satisfied: level1Satisfied,
    detail: level1Satisfied
      ? `已修 ${satisfiedCategories.size}/2 類別`
      : `已修 ${satisfiedCategories.size}/2 類別 (需再選 ${2 - satisfiedCategories.size} 類別)`,
    match_details: l1MatchDetails,
  })

  // Check Level 2: must correspond to a satisfied Level 1 category
  const allL2Courses = level2Groups.flatMap(g => g.courses)
  const l2Eligible = level2Groups.filter(g =>
    satisfiedCategories.has(g.rule.subcategory_tag ?? '')
  )
  const l2EligibleCourses = l2Eligible.flatMap(g => g.courses)
  const l2MatchDetails: CourseMatchDetail[] = []
  const l2MatchedNames: string[] = []
  let l2Credits = 0
  for (const c of l2EligibleCourses) {
    const mr = findMatchWithMethod(lookup, c.course_codes, c.name_zh, c.only_semester)
    if (mr) {
      l2MatchedNames.push(c.name_zh)
      l2Credits += mr.course.credits
      l2MatchDetails.push({
        module_course_name: c.name_zh,
        student_course_name: mr.course.name,
        student_course_code: mr.course.course_code,
        module_course_codes: c.course_codes,
        match_method: mr.method,
        credits: mr.course.credits,
        semester: mr.course.semester,
      })
    }
  }
  const level2Satisfied = l2MatchedNames.length >= 1

  level1Results.push({
    label: `Level 2: 任選一門 (需對應已修Level 1類別)`,
    rule: { type: 'choose_m_from_n', choose_m: 1, notes: [] },
    courses_in_group: allL2Courses.map(c => c.name_zh),
    courses_matched: l2MatchedNames,
    credits_matched: l2Credits,
    is_satisfied: level2Satisfied,
    detail: level2Satisfied
      ? `已選 1 門對應課程`
      : `需從已修Level 1類別中選修1門Level 2課程`,
    match_details: l2MatchDetails,
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
  // Use module course lookup for code-aware credit counting — name-only
  // lookup would miss courses matched via course_code with different names
  // (e.g. module "專題研究" matched student "專題研究(一)" by code).
  const moduleCourseByName = new Map(module.all_courses.map(c => [c.name_zh, c]))
  const allMatchedNames = new Set<string>()
  let totalCredits = 0
  for (const gr of groupResults) {
    for (const name of gr.courses_matched) {
      if (!allMatchedNames.has(name)) {
        allMatchedNames.add(name)
        const mc = moduleCourseByName.get(name)
        // 選修兩學期 courses must sum credits across semesters;
        // regular courses only count the first match (repeats don't stack).
        const twoSem = mc?.remark?.includes('選修兩學期') ?? false
        if (twoSem) {
          totalCredits += sumAllCredits(lookup, mc?.course_codes, name, mc?.only_semester)
        } else {
          const match = findMatch(lookup, mc?.course_codes, name, mc?.only_semester)
          if (match) totalCredits += match.credits
        }
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
