import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../src/html-utils.ts'

describe('escapeHtml', () => {
  it('escapes ampersands first to avoid double-encoding', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('escapes less-than and greater-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes double quotes for safe attribute interpolation', () => {
    expect(escapeHtml('" onerror="x')).toBe('&quot; onerror=&quot;x')
  })

  it('leaves single quotes alone (attributes use double quotes)', () => {
    expect(escapeHtml("it's")).toBe("it's")
  })

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes CJK characters through untouched', () => {
    expect(escapeHtml('領域模組')).toBe('領域模組')
  })

  it('escapes a typical XSS payload', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">'))
      .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})
