import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { StudentInfo, StudentCourse } from './models.ts'

// ─── Grade filtering ───

/**
 * Determine if a grade represents a passed course.
 * Passing: numeric ≥ 60, "Y" (抵免), "P" (通過)
 * Failing: numeric < 60, "N" (不通過), "I" (未完成), "" (尚未登錄)
 */
function isPassingGrade(grade: string): boolean {
  if (grade === 'Y' || grade === 'P') return true
  if (grade === '' || grade === 'N' || grade === 'I') return false
  const n = Number(grade)
  return !isNaN(n) && n >= 60
}

// ─── Load real student data from Excel ───
const EXCEL_PATH = resolve(import.meta.dirname, '../20260420.xlsx')
const STUDENT_MAP = new Map<string, StudentInfo>()

// Load 4dept Excel if available
if (existsSync(EXCEL_PATH)) {
  // Dynamic import to avoid hard dependency on xlsx when Excel not present
  const { read4DeptExcel } = await import('../scripts/lib/excel-reader.ts')
  const records = read4DeptExcel(EXCEL_PATH)

  let totalRecords = 0
  let filteredOut = 0
  const tempMap = new Map<string, { name: string; department: string; courses: StudentCourse[] }>()
  for (const r of records) {
    totalRecords++
    // Skip courses that are not passed (failed, incomplete, or not yet graded)
    if (!isPassingGrade(r.grade)) {
      filteredOut++
      continue
    }
    if (!tempMap.has(r.student_id)) {
      tempMap.set(r.student_id, { name: r.name, department: r.department, courses: [] })
    }
    tempMap.get(r.student_id)!.courses.push({
      name: r.course_name,
      credits: r.credits,
      semester: `${r.year}-${r.semester}`,
      course_code: r.course_code,
      grade: r.grade,
    })
  }

  for (const [id, data] of tempMap) {
    STUDENT_MAP.set(id, {
      student_id: id,
      name: data.name,
      department: data.department,
      courses: data.courses,
    })
  }
  console.log(`Loaded ${STUDENT_MAP.size} students from Excel (${totalRecords} records, ${filteredOut} filtered out: failed/incomplete/ungraded)`)
}

/**
 * Fetch student info by student ID.
 */
export async function fetchStudentInfo(studentId: string): Promise<StudentInfo | null> {
  return STUDENT_MAP.get(studentId.toUpperCase()) ?? STUDENT_MAP.get(studentId) ?? null
}

/** Get all loaded students */
export function getAllStudents(): readonly StudentInfo[] {
  return [...STUDENT_MAP.values()]
}

/** Get students filtered by department */
export function getStudentsByDepartment(dept: string): readonly StudentInfo[] {
  return [...STUDENT_MAP.values()].filter(s => s.department === dept)
}

/** Get distinct department names */
export function getDepartments(): readonly string[] {
  const depts = new Set([...STUDENT_MAP.values()].map(s => s.department))
  return [...depts].sort()
}
