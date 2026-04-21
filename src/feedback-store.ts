import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface FeedbackEntry {
  readonly student_id: string
  readonly module_key: string
  readonly is_correct: boolean
  readonly comment: string
  readonly timestamp: string
}

const FEEDBACK_PATH = resolve(import.meta.dirname, '../feedback.json')

function loadAll(): FeedbackEntry[] {
  if (!existsSync(FEEDBACK_PATH)) return []
  try {
    const parsed = JSON.parse(readFileSync(FEEDBACK_PATH, 'utf-8'))
    return Array.isArray(parsed) ? parsed as FeedbackEntry[] : []
  } catch (err) {
    console.error(`feedback.json 解析失敗,回傳空陣列:`, err)
    return []
  }
}

function saveAll(entries: readonly FeedbackEntry[]): void {
  writeFileSync(FEEDBACK_PATH, JSON.stringify(entries, null, 2), 'utf-8')
}

/** Add or update feedback for a student+module pair */
export function addFeedback(entry: FeedbackEntry): void {
  const entries = loadAll()
  const idx = entries.findIndex(
    e => e.student_id === entry.student_id && e.module_key === entry.module_key,
  )
  if (idx >= 0) {
    entries[idx] = entry
  } else {
    entries.push(entry)
  }
  saveAll(entries)
}

/** Get feedback for a specific student+module pair */
export function getFeedback(studentId: string, moduleKey: string): FeedbackEntry | undefined {
  return loadAll().find(e => e.student_id === studentId && e.module_key === moduleKey)
}

/** Get all feedback entries */
export function getAllFeedback(): readonly FeedbackEntry[] {
  return loadAll()
}

/** Get summary statistics */
export function getFeedbackSummary(): { total: number; correct: number; incorrect: number } {
  const entries = loadAll()
  return {
    total: entries.length,
    correct: entries.filter(e => e.is_correct).length,
    incorrect: entries.filter(e => !e.is_correct).length,
  }
}
