import type { CertificationRequirement } from './models.ts'

/**
 * Extract a numeric value from a mixed-type certification requirement field.
 * Handles: int, pure digit string, "至少N", "N門課", "N學分", "N-M" ranges, "N或M", etc.
 * Always returns the minimum value for ranges.
 */
export function parseRequirementValue(raw: number | string): number {
  if (typeof raw === 'number') return raw

  const s = raw.trim()

  // Pure digit string: "5", "12"
  if (/^\d+$/.test(s)) return parseInt(s, 10)

  // Range with dash: "12-13", "4-6課程", "12-15", "14-15"
  const dashRange = s.match(/^(\d+)[-~](\d+)/)
  if (dashRange) return parseInt(dashRange[1], 10)

  // "或" pattern: "5或6", "11或12", "15或16"
  const orPattern = s.match(/^(\d+)或(\d+)/)
  if (orPattern) return parseInt(orPattern[1], 10)

  // "至少修習N門": "至少修習5門"
  const atLeastCourses = s.match(/至少修習(\d+)/)
  if (atLeastCourses) return parseInt(atLeastCourses[1], 10)

  // "至少N學分": "至少12學分"
  const atLeastCredits = s.match(/至少(\d+)學分/)
  if (atLeastCredits) return parseInt(atLeastCredits[1], 10)

  // "至少N": "至少5", "至少12", "至少4", "至少15"
  const atLeast = s.match(/至少(\d+)/)
  if (atLeast) return parseInt(atLeast[1], 10)

  // "N門課" / "N課程": "5門課", "5課程"
  const courseSuffix = s.match(/(\d+)[門課程]+/)
  if (courseSuffix) return parseInt(courseSuffix[1], 10)

  // "N學分": "15學分", "12學分"
  const creditSuffix = s.match(/(\d+)學分/)
  if (creditSuffix) return parseInt(creditSuffix[1], 10)

  // Fallback: try to extract any number
  const anyNum = s.match(/(\d+)/)
  if (anyNum) return parseInt(anyNum[1], 10)

  throw new Error(`Cannot parse certification requirement: "${raw}"`)
}

/**
 * Parse both fields of 認證要求 into a CertificationRequirement.
 */
export function parseCertificationRequirement(raw: {
  取得認證需修習總課程數: number | string
  取得認證需修習總學分數: number | string
}): CertificationRequirement {
  return {
    min_courses: parseRequirementValue(raw.取得認證需修習總課程數),
    min_credits: parseRequirementValue(raw.取得認證需修習總學分數),
  }
}
