import type { Module, StudentInfo } from './models.ts'
import { getModuleOverview } from './module-overview.ts'

export interface ModuleRank {
  readonly module: Module
  readonly passedCount: number
  readonly nearMissCount: number
}

export interface DepartmentRank {
  readonly department: string
  readonly totalStudents: number         // 系所總學生數
  readonly certifiedStudents: number     // 取得 ≥1 模組的學生數
  readonly totalCertifications: number   // 此系所學生取得的模組數總和
}

export interface SchoolOverview {
  readonly totalStudents: number              // 真實學生數(排除範例)
  readonly studentsWithCerts: number          // 取得 ≥1 模組認證的學生
  readonly totalCertifications: number        // 所有 (學生, 模組) pair 的總和
  readonly moduleRanking: readonly ModuleRank[]      // 依取得人數 desc
  readonly departmentRanking: readonly DepartmentRank[]  // 依取得學生數 desc
  readonly certCountDistribution: ReadonlyMap<number, number>  // 取得模組數 → 學生數
}

let cached: SchoolOverview | null = null

/**
 * Compute (or return cached) school-wide certification statistics.
 *
 * First call walks every (student, module) pair — uses the per-module
 * cache from `getModuleOverview`, so partially-warm caches are cheap.
 * Call `clearSchoolOverviewCache()` in tests to force recompute.
 */
export function getSchoolOverview(
  modules: readonly Module[],
  students: readonly StudentInfo[],
): SchoolOverview {
  if (cached) return cached

  // Build per-student cert count first (via per-module overview)
  const certCountByStudent = new Map<string, number>()
  const moduleRanking: ModuleRank[] = []
  const certCountByDept = new Map<string, number>()

  for (const mod of modules) {
    const overview = getModuleOverview(mod, students)
    moduleRanking.push({
      module: mod,
      passedCount: overview.passed.length,
      nearMissCount: overview.nearMiss.length,
    })
    for (const { student } of overview.passed) {
      certCountByStudent.set(student.student_id, (certCountByStudent.get(student.student_id) ?? 0) + 1)
      const dept = student.department || '未指定'
      certCountByDept.set(dept, (certCountByDept.get(dept) ?? 0) + 1)
    }
  }

  moduleRanking.sort((a, b) => b.passedCount - a.passedCount)

  // Department totals (even if 0 certs, still counted for totalStudents column)
  const deptTotal = new Map<string, number>()
  const certifiedByDept = new Map<string, Set<string>>()
  for (const s of students) {
    const dept = s.department || '未指定'
    deptTotal.set(dept, (deptTotal.get(dept) ?? 0) + 1)
    if ((certCountByStudent.get(s.student_id) ?? 0) > 0) {
      const set = certifiedByDept.get(dept) ?? new Set<string>()
      set.add(s.student_id)
      certifiedByDept.set(dept, set)
    }
  }

  const departmentRanking: DepartmentRank[] = []
  for (const [dept, total] of deptTotal) {
    departmentRanking.push({
      department: dept,
      totalStudents: total,
      certifiedStudents: certifiedByDept.get(dept)?.size ?? 0,
      totalCertifications: certCountByDept.get(dept) ?? 0,
    })
  }
  departmentRanking.sort((a, b) =>
    b.certifiedStudents - a.certifiedStudents
    || b.totalCertifications - a.totalCertifications
    || a.department.localeCompare(b.department),
  )

  // Distribution of cert counts across students (include those with 0)
  const distribution = new Map<number, number>()
  for (const s of students) {
    const n = certCountByStudent.get(s.student_id) ?? 0
    distribution.set(n, (distribution.get(n) ?? 0) + 1)
  }

  let totalCertifications = 0
  for (const r of moduleRanking) totalCertifications += r.passedCount

  cached = {
    totalStudents: students.length,
    studentsWithCerts: certCountByStudent.size,
    totalCertifications,
    moduleRanking,
    departmentRanking,
    certCountDistribution: distribution,
  }
  return cached
}

/** Test helper: invalidate the cache so next call recomputes. */
export function clearSchoolOverviewCache(): void {
  cached = null
}
