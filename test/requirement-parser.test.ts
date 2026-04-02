import { describe, it, expect } from 'vitest'
import { parseRequirementValue, parseCertificationRequirement } from '../src/requirement-parser.ts'

describe('parseRequirementValue', () => {
  // Integer values
  it('handles integer input', () => {
    expect(parseRequirementValue(5)).toBe(5)
    expect(parseRequirementValue(4)).toBe(4)
    expect(parseRequirementValue(12)).toBe(12)
    expect(parseRequirementValue(15)).toBe(15)
    expect(parseRequirementValue(16)).toBe(16)
    expect(parseRequirementValue(8)).toBe(8)
  })

  // Pure digit strings
  it('handles pure digit strings', () => {
    expect(parseRequirementValue('5')).toBe(5)
    expect(parseRequirementValue('4')).toBe(4)
    expect(parseRequirementValue('6')).toBe(6)
    expect(parseRequirementValue('7')).toBe(7)
    expect(parseRequirementValue('10')).toBe(10)
    expect(parseRequirementValue('12')).toBe(12)
    expect(parseRequirementValue('13')).toBe(13)
    expect(parseRequirementValue('14')).toBe(14)
    expect(parseRequirementValue('15')).toBe(15)
    expect(parseRequirementValue('16')).toBe(16)
    expect(parseRequirementValue('8')).toBe(8)
  })

  // "至少N" pattern
  it('handles 至少N pattern', () => {
    expect(parseRequirementValue('至少5')).toBe(5)
    expect(parseRequirementValue('至少4')).toBe(4)
    expect(parseRequirementValue('至少12')).toBe(12)
    expect(parseRequirementValue('至少15')).toBe(15)
  })

  // "至少修習N門" pattern
  it('handles 至少修習N門 pattern', () => {
    expect(parseRequirementValue('至少修習5門')).toBe(5)
  })

  // "至少N學分" pattern
  it('handles 至少N學分 pattern', () => {
    expect(parseRequirementValue('至少12學分')).toBe(12)
  })

  // "N門課" pattern
  it('handles N門課 pattern', () => {
    expect(parseRequirementValue('5門課')).toBe(5)
  })

  // "N課程" pattern
  it('handles N課程 pattern', () => {
    expect(parseRequirementValue('5課程')).toBe(5)
  })

  // "N學分" pattern
  it('handles N學分 pattern', () => {
    expect(parseRequirementValue('15學分')).toBe(15)
    expect(parseRequirementValue('12學分')).toBe(12)
  })

  // Dash range pattern (takes min)
  it('handles N-M range (returns min)', () => {
    expect(parseRequirementValue('12-13')).toBe(12)
    expect(parseRequirementValue('12-15')).toBe(12)
    expect(parseRequirementValue('14-15')).toBe(14)
    expect(parseRequirementValue('13-14')).toBe(13)
    expect(parseRequirementValue('4-6課程')).toBe(4)
  })

  // Tilde range pattern
  it('handles N~M range (returns min)', () => {
    expect(parseRequirementValue('12~13')).toBe(12)
  })

  // "或" pattern
  it('handles N或M pattern (returns min)', () => {
    expect(parseRequirementValue('5或6')).toBe(5)
    expect(parseRequirementValue('11或12')).toBe(11)
    expect(parseRequirementValue('15或16')).toBe(15)
  })
})

describe('parseCertificationRequirement', () => {
  it('parses both fields together', () => {
    const result = parseCertificationRequirement({
      取得認證需修習總課程數: 5,
      取得認證需修習總學分數: 12,
    })
    expect(result).toEqual({ min_courses: 5, min_credits: 12 })
  })

  it('handles mixed types', () => {
    const result = parseCertificationRequirement({
      取得認證需修習總課程數: '至少5',
      取得認證需修習總學分數: '12-15',
    })
    expect(result).toEqual({ min_courses: 5, min_credits: 12 })
  })
})
