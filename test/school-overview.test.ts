import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSchoolOverview, clearSchoolOverviewCache } from '../src/school-overview.ts'
import { clearModuleOverviewCache } from '../src/module-overview.ts'
import * as verifier from '../src/verifier.ts'
import type { Module, StudentInfo, VerificationResult } from '../src/models.ts'

const fakeModule = (key: string): Module => ({
  key,
  name_zh: key,
  name_en: key,
  unit: 'U',
  college: 'C',
  groups: [],
  all_courses: [],
  certification: { min_courses: 4, min_credits: 12 },
})

const fakeStudent = (id: string, dept: string): StudentInfo => ({
  student_id: id,
  name: id,
  department: dept,
  courses: [],
})

const fakeResult = (overrides: Partial<VerificationResult>): VerificationResult => ({
  module_name: '',
  module_key: 'k',
  is_certified: false,
  total_courses_matched: 0,
  total_credits_matched: 0,
  required_courses: 4,
  required_credits: 12,
  group_results: [],
  unmet_reasons: [],
  advisory_notes: [],
  ...overrides,
})

describe('getSchoolOverview', () => {
  beforeEach(() => {
    clearSchoolOverviewCache()
    clearModuleOverviewCache()
    vi.restoreAllMocks()
  })

  it('aggregates totals across all modules and students', () => {
    const modules = [fakeModule('M1'), fakeModule('M2'), fakeModule('M3')]
    const students = [
      fakeStudent('S1', 'A'),
      fakeStudent('S2', 'A'),
      fakeStudent('S3', 'B'),
    ]
    // Controlled pass matrix:
    //   S1 passes M1, M2      → 2 certs
    //   S2 passes M1          → 1 cert
    //   S3 passes              → 0
    const passMatrix: Record<string, string[]> = {
      S1: ['M1', 'M2'],
      S2: ['M1'],
      S3: [],
    }
    vi.spyOn(verifier, 'verifyModule').mockImplementation((mod, courses) => {
      // Identify student by a sentinel in courses[0].name when present
      const sid = (courses[0] as any)?.sid ?? 'unknown'
      const passes = passMatrix[sid]?.includes(mod.key)
      return fakeResult({
        is_certified: !!passes,
        total_courses_matched: passes ? 4 : 0,
        total_credits_matched: passes ? 12 : 0,
      })
    })
    const stamped = students.map(s => ({ ...s, courses: [{ name: 'x', credits: 0, sid: s.student_id } as any] }))

    const o = getSchoolOverview(modules, stamped)

    expect(o.totalStudents).toBe(3)
    expect(o.studentsWithCerts).toBe(2)       // S1, S2
    expect(o.totalCertifications).toBe(3)     // 2 + 1 + 0

    // Module ranking ordering: M1(2) > M2(1) > M3(0)
    expect(o.moduleRanking.map(m => `${m.module.key}:${m.passedCount}`))
      .toEqual(['M1:2', 'M2:1', 'M3:0'])

    // Dept ranking: A has 2 certified out of 2; B has 0 out of 1
    expect(o.departmentRanking[0]).toMatchObject({
      department: 'A', totalStudents: 2, certifiedStudents: 2, totalCertifications: 3,
    })
    expect(o.departmentRanking[1]).toMatchObject({
      department: 'B', totalStudents: 1, certifiedStudents: 0, totalCertifications: 0,
    })

    // Distribution: S1→2, S2→1, S3→0
    expect(o.certCountDistribution.get(0)).toBe(1)
    expect(o.certCountDistribution.get(1)).toBe(1)
    expect(o.certCountDistribution.get(2)).toBe(1)
  })

  it('caches and does not recompute on second call', () => {
    const spy = vi.spyOn(verifier, 'verifyModule').mockReturnValue(fakeResult({}))
    const modules = [fakeModule('M1'), fakeModule('M2')]
    const students = [fakeStudent('S1', 'X'), fakeStudent('S2', 'X')]

    getSchoolOverview(modules, students)
    // 2 modules × 2 students = 4 verify calls
    expect(spy).toHaveBeenCalledTimes(4)

    getSchoolOverview(modules, students)
    // Fully cached
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('handles all-zero case gracefully', () => {
    vi.spyOn(verifier, 'verifyModule').mockReturnValue(fakeResult({}))
    const o = getSchoolOverview([fakeModule('M1')], [fakeStudent('S1', 'X')])
    expect(o.totalCertifications).toBe(0)
    expect(o.studentsWithCerts).toBe(0)
    expect(o.certCountDistribution.get(0)).toBe(1)
  })

  it('sorts dept ranking by certifiedStudents desc, then totalCertifications, then name', () => {
    vi.spyOn(verifier, 'verifyModule').mockImplementation((_mod, courses) => {
      const sid = (courses[0] as any)?.sid
      // A has 1 certified (S1); B has 1 certified (S2 with 2 certs); C has 0
      if (sid === 'S1') return fakeResult({ is_certified: true })
      if (sid === 'S2') return fakeResult({ is_certified: true })
      return fakeResult({})
    })
    const modules = [fakeModule('M1')]
    const stamp = (id: string, dept: string) => ({ ...fakeStudent(id, dept), courses: [{ name: 'x', credits: 0, sid: id } as any] })
    const o = getSchoolOverview(modules, [stamp('S1', 'A'), stamp('S2', 'B'), stamp('S3', 'C')])

    // A and B tie on certifiedStudents (1 each), A sorted before B by name
    expect(o.departmentRanking[0].department).toBe('A')
    expect(o.departmentRanking[1].department).toBe('B')
    expect(o.departmentRanking[2].department).toBe('C')
  })
})
