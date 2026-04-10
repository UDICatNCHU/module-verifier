/**
 * Thin wrappers around xlsx for reading the two Excel files.
 * Returns typed arrays, no side effects.
 */
import XLSX from 'xlsx'

/** A row from 科目內碼 Excel: code → Chinese name → English name */
export interface CourseCodeEntry {
  readonly code: string
  readonly name_zh: string
  readonly name_en: string
}

/** A row from 20260410-4dept Excel: student course record */
export interface StudentRecord {
  readonly index: number
  readonly student_id: string
  readonly name: string
  readonly program: string
  readonly department: string
  readonly year: string
  readonly semester: string
  readonly course_name: string
  readonly course_code: string
  readonly credits: number
  readonly grade: string
}

/**
 * Read 科目內碼-20260410.xlsx → CourseCodeEntry[]
 * Sheet1: 課程內碼 | 中文名稱 | 英文名稱 (header row + 18,854 data rows)
 */
export function readCourseCodeExcel(filePath: string): readonly CourseCodeEntry[] {
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })

  // Skip header row
  const entries: CourseCodeEntry[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 2) continue
    const code = String(row[0] ?? '').trim()
    const name_zh = String(row[1] ?? '').trim()
    const name_en = String(row[2] ?? '').trim()
    if (code && name_zh) {
      entries.push({ code, name_zh, name_en })
    }
  }
  return entries
}

/**
 * Read 20260410-4dept.xlsx → StudentRecord[]
 * Columns: 序號 | 學號 | 姓名 | 學制 | 系所 | 學年 | 學期 | 科目名稱 | 科目內碼 | 學分數 | 成績
 */
export function read4DeptExcel(filePath: string): readonly StudentRecord[] {
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })

  const records: StudentRecord[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 10) continue
    const course_code = String(row[8] ?? '').trim()
    if (!course_code) continue

    records.push({
      index: Number(row[0]) || i,
      student_id: String(row[1] ?? '').trim(),
      name: String(row[2] ?? '').trim(),
      program: String(row[3] ?? '').trim(),
      department: String(row[4] ?? '').trim(),
      year: String(row[5] ?? '').trim(),
      semester: String(row[6] ?? '').trim(),
      course_name: String(row[7] ?? '').trim(),
      course_code,
      credits: Number(row[9]) || 0,
      grade: String(row[10] ?? '').trim(),
    })
  }
  return records
}
