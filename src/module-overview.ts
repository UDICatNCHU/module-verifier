import type { Module, StudentInfo, VerificationResult } from './models.ts'
import { verifyModule } from './verifier.ts'

/** One student's verification result against a module. */
export interface StudentPassEntry {
  readonly student: StudentInfo
  readonly result: VerificationResult
}

export interface ModuleOverview {
  readonly passed: readonly StudentPassEntry[]
  readonly nearMiss: readonly StudentPassEntry[]
}

/**
 * Near miss = not yet certified, but within 1 course AND 3 credits of passing,
 * with at least 1 course already matched. Both gap conditions must hold so a
 * student who took just 1 course won't appear as "near miss" for a large module.
 */
export function isNearMiss(r: VerificationResult): boolean {
  if (r.is_certified) return false
  if (r.total_courses_matched === 0) return false
  const courseGap = r.required_courses - r.total_courses_matched
  const creditGap = r.required_credits - r.total_credits_matched
  return courseGap <= 1 && creditGap <= 3
}

const cache = new Map<string, ModuleOverview>()

/**
 * Compute (or return cached) pass / near-miss lists for a module.
 *
 * Runs `verifyModule` once per student on first call; subsequent calls for
 * the same module.key return the cached result. Safe because module data and
 * student records are loaded once at boot and never mutate at runtime.
 */
export function getModuleOverview(
  mod: Module,
  students: readonly StudentInfo[],
): ModuleOverview {
  const hit = cache.get(mod.key)
  if (hit) return hit

  const passed: StudentPassEntry[] = []
  const nearMiss: StudentPassEntry[] = []
  for (const student of students) {
    const result = verifyModule(mod, student.courses)
    if (result.is_certified) {
      passed.push({ student, result })
    } else if (isNearMiss(result)) {
      nearMiss.push({ student, result })
    }
  }

  const overview: ModuleOverview = { passed, nearMiss }
  cache.set(mod.key, overview)
  return overview
}

/** Test helper: clear the memoization cache between runs. */
export function clearModuleOverviewCache(): void {
  cache.clear()
}

/** Group pass entries by department, preserving insertion order. */
export function groupByDepartment(
  entries: readonly StudentPassEntry[],
): ReadonlyMap<string, readonly StudentPassEntry[]> {
  const map = new Map<string, StudentPassEntry[]>()
  for (const e of entries) {
    const dept = e.student.department || '未指定'
    const list = map.get(dept) ?? []
    list.push(e)
    map.set(dept, list)
  }
  // Sort each dept's entries by student_id for stable display
  for (const list of map.values()) {
    list.sort((a, b) => a.student.student_id.localeCompare(b.student.student_id))
  }
  return map
}
