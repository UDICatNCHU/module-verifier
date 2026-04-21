import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// feedback-store hard-codes its path via import.meta.dirname — we write the
// real file for the duration of each test and clean up after.
const FEEDBACK_PATH = resolve(import.meta.dirname, '../feedback.json')

describe('feedback-store', () => {
  let store: typeof import('../src/feedback-store.ts')

  beforeEach(async () => {
    if (existsSync(FEEDBACK_PATH)) unlinkSync(FEEDBACK_PATH)
    vi.resetModules()
    store = await import('../src/feedback-store.ts')
  })

  afterEach(() => {
    if (existsSync(FEEDBACK_PATH)) unlinkSync(FEEDBACK_PATH)
  })

  it('returns empty array when feedback.json does not exist', () => {
    expect(store.getAllFeedback()).toEqual([])
    expect(store.getFeedbackSummary()).toEqual({ total: 0, correct: 0, incorrect: 0 })
  })

  it('persists a new feedback entry', () => {
    store.addFeedback({
      student_id: 'S001', module_key: 'M1', is_correct: true, comment: 'ok', timestamp: '2026-04-21T00:00:00Z',
    })
    const all = store.getAllFeedback()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ student_id: 'S001', module_key: 'M1', is_correct: true })
  })

  it('updates existing entry for same (student, module) pair instead of duplicating', () => {
    store.addFeedback({ student_id: 'S001', module_key: 'M1', is_correct: false, comment: 'first', timestamp: 't1' })
    store.addFeedback({ student_id: 'S001', module_key: 'M1', is_correct: true, comment: 'second', timestamp: 't2' })

    const all = store.getAllFeedback()
    expect(all).toHaveLength(1)
    expect(all[0].comment).toBe('second')
    expect(all[0].is_correct).toBe(true)
  })

  it('keeps separate entries for different module keys', () => {
    store.addFeedback({ student_id: 'S001', module_key: 'M1', is_correct: true, comment: '', timestamp: 't1' })
    store.addFeedback({ student_id: 'S001', module_key: 'M2', is_correct: false, comment: '', timestamp: 't2' })
    expect(store.getAllFeedback()).toHaveLength(2)
  })

  it('getFeedback returns entry for matching pair, undefined otherwise', () => {
    store.addFeedback({ student_id: 'S001', module_key: 'M1', is_correct: true, comment: 'x', timestamp: 't' })
    expect(store.getFeedback('S001', 'M1')?.comment).toBe('x')
    expect(store.getFeedback('S001', 'MX')).toBeUndefined()
    expect(store.getFeedback('SZZ', 'M1')).toBeUndefined()
  })

  it('summary counts correct vs incorrect', () => {
    store.addFeedback({ student_id: 'S1', module_key: 'M1', is_correct: true, comment: '', timestamp: 't' })
    store.addFeedback({ student_id: 'S2', module_key: 'M1', is_correct: false, comment: '', timestamp: 't' })
    store.addFeedback({ student_id: 'S3', module_key: 'M1', is_correct: true, comment: '', timestamp: 't' })
    expect(store.getFeedbackSummary()).toEqual({ total: 3, correct: 2, incorrect: 1 })
  })

  it('recovers from a corrupt feedback.json (returns empty) without crashing', () => {
    writeFileSync(FEEDBACK_PATH, 'not valid json{{{', 'utf-8')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(store.getAllFeedback()).toEqual([])
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('recovers when feedback.json contains a non-array shape', () => {
    writeFileSync(FEEDBACK_PATH, '{"not":"an array"}', 'utf-8')
    expect(store.getAllFeedback()).toEqual([])
  })
})
