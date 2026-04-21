import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isNearMiss,
  getModuleOverview,
  clearModuleOverviewCache,
  groupByDepartment,
} from '../src/module-overview.ts'
import * as verifier from '../src/verifier.ts'
import type { Module, StudentInfo, VerificationResult } from '../src/models.ts'

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

describe('isNearMiss', () => {
  it('returns false for already-certified', () => {
    expect(isNearMiss(fakeResult({ is_certified: true }))).toBe(false)
  })

  it('returns false for students who matched zero courses', () => {
    expect(isNearMiss(fakeResult({ total_courses_matched: 0 }))).toBe(false)
  })

  it('returns true when missing exactly 1 course and 3 credits', () => {
    expect(
      isNearMiss(fakeResult({ total_courses_matched: 3, total_credits_matched: 9 })),
    ).toBe(true)
  })

  it('returns false when course gap is 2', () => {
    expect(
      isNearMiss(fakeResult({ total_courses_matched: 2, total_credits_matched: 11 })),
    ).toBe(false)
  })

  it('returns false when credit gap is 4', () => {
    expect(
      isNearMiss(fakeResult({ total_courses_matched: 3, total_credits_matched: 8 })),
    ).toBe(false)
  })

  it('handles over-match (courseGap negative) as near miss if also negative credit gap', () => {
    // 已修 5 門 6 門 / 14 學分 / 12 學分 — group 沒過但總數夠,仍算 nearMiss
    expect(
      isNearMiss(fakeResult({ total_courses_matched: 5, total_credits_matched: 14 })),
    ).toBe(true)
  })
})

describe('groupByDepartment', () => {
  const mkStudent = (id: string, dept: string): StudentInfo => ({
    student_id: id,
    name: id,
    department: dept,
    courses: [],
  })

  it('groups entries by department and sorts each group by student_id', () => {
    const entries = [
      { student: mkStudent('S003', 'A'), result: fakeResult({}) },
      { student: mkStudent('S001', 'B'), result: fakeResult({}) },
      { student: mkStudent('S002', 'A'), result: fakeResult({}) },
    ]
    const grouped = groupByDepartment(entries)
    expect([...grouped.keys()]).toEqual(['A', 'B'])
    expect(grouped.get('A')!.map(e => e.student.student_id)).toEqual(['S002', 'S003'])
    expect(grouped.get('B')!.map(e => e.student.student_id)).toEqual(['S001'])
  })

  it('falls back to 未指定 for empty department', () => {
    const entries = [{ student: mkStudent('X', ''), result: fakeResult({}) }]
    expect([...groupByDepartment(entries).keys()]).toEqual(['未指定'])
  })
})

describe('getModuleOverview', () => {
  const mod: Module = {
    key: 'test_module',
    name_zh: '測試',
    name_en: 'Test',
    unit: '測試單位',
    college: '測試學院',
    groups: [],
    all_courses: [],
    certification: { min_courses: 4, min_credits: 12 },
  }

  const studentA: StudentInfo = {
    student_id: 'S001',
    name: 'A',
    department: 'X',
    courses: [],
  }
  const studentB: StudentInfo = {
    student_id: 'S002',
    name: 'B',
    department: 'X',
    courses: [],
  }
  const studentC: StudentInfo = {
    student_id: 'S003',
    name: 'C',
    department: 'Y',
    courses: [],
  }

  beforeEach(() => {
    clearModuleOverviewCache()
    vi.restoreAllMocks()
  })

  it('classifies passed vs near-miss vs neither', () => {
    vi.spyOn(verifier, 'verifyModule').mockImplementation((_m, courses) => {
      // Distinguish by course count (test rig): 0 = neither, 3 = near, 4 = pass
      const n = courses.length
      if (n >= 4) return fakeResult({ is_certified: true, total_courses_matched: 4, total_credits_matched: 12 })
      if (n === 3) return fakeResult({ total_courses_matched: 3, total_credits_matched: 9 })
      return fakeResult({ total_courses_matched: 0 })
    })

    const s1 = { ...studentA, courses: Array(4).fill({ name: 'x', credits: 3 }) }
    const s2 = { ...studentB, courses: Array(3).fill({ name: 'x', credits: 3 }) }
    const s3 = { ...studentC, courses: [] }

    const overview = getModuleOverview(mod, [s1, s2, s3])
    expect(overview.passed.map(e => e.student.student_id)).toEqual(['S001'])
    expect(overview.nearMiss.map(e => e.student.student_id)).toEqual(['S002'])
  })

  it('caches by module key and skips re-verification on repeat calls', () => {
    const spy = vi.spyOn(verifier, 'verifyModule').mockReturnValue(fakeResult({}))

    getModuleOverview(mod, [studentA, studentB])
    expect(spy).toHaveBeenCalledTimes(2)

    getModuleOverview(mod, [studentA, studentB])
    // Second call should hit cache — no additional verifyModule calls
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('treats different module keys as separate cache entries', () => {
    const spy = vi.spyOn(verifier, 'verifyModule').mockReturnValue(fakeResult({}))

    getModuleOverview(mod, [studentA])
    getModuleOverview({ ...mod, key: 'different' }, [studentA])
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
