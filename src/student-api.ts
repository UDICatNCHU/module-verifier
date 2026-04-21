import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { StudentInfo, StudentCourse } from './models.ts'

/**
 * Dummy student records for development/testing.
 * All dummy records live in the 【範例資料】 department with "[範例]" name
 * prefix so they are never mixed with real student data in the UI.
 */
const DUMMY_DEPT = '【範例資料】'

const DUMMY_STUDENTS: readonly StudentInfo[] = [
  {
    student_id: 'D1234001',
    name: '[範例] 王小明',
    department: DUMMY_DEPT,
    courses: [
      { name: '臺灣史', credits: 4, semester: '113-1' },
      { name: '中臺灣區域史', credits: 2, semester: '113-2' },
      { name: '戰後中臺灣旅遊觀光史(1945-2010)', credits: 2, semester: '114-1' },
      { name: '臺中學', credits: 2, semester: '114-1' },
      { name: '日治時期臺灣山區探險史', credits: 2, semester: '114-2' },
      { name: '中國通史', credits: 4, semester: '113-1' },
      { name: '西洋史', credits: 3, semester: '113-2' },
    ],
  },
  {
    student_id: 'D1234002',
    name: '[範例] 李美玲',
    department: DUMMY_DEPT,
    courses: [
      { name: '中級會計學(一)', credits: 3, semester: '113-1' },
      { name: '中級會計學(二)', credits: 3, semester: '113-2' },
      { name: '成本與管理會計學', credits: 6, semester: '114-1' },
      { name: '審計學', credits: 6, semester: '114-1' },
      { name: '會計資訊系統', credits: 3, semester: '114-2' },
      { name: '經濟學原理', credits: 3, semester: '113-1' },
      { name: '統計學', credits: 3, semester: '113-2' },
      { name: '管理學', credits: 3, semester: '113-1' },
    ],
  },
  {
    student_id: 'D1234003',
    name: '[範例] 張志豪',
    department: DUMMY_DEPT,
    courses: [
      { name: '計算機概論', credits: 3, semester: '113-1' },
      { name: '管理數學', credits: 3, semester: '113-1' },
      { name: '資訊管理導論', credits: 3, semester: '113-2' },
      { name: '機器學習', credits: 3, semester: '114-1' },
      { name: '程式設計', credits: 3, semester: '113-1' },
      { name: '資料結構', credits: 3, semester: '113-2' },
      { name: '資料庫管理', credits: 3, semester: '114-1' },
    ],
  },
  {
    student_id: 'D1234004',
    name: '[範例] 陳怡君',
    department: DUMMY_DEPT,
    courses: [
      { name: '中級會計學(一)', credits: 3, semester: '113-1' },
      { name: '中級會計學(二)', credits: 3, semester: '113-2' },
      { name: '成本與管理會計學', credits: 6, semester: '114-1' },
      { name: '會計學原理', credits: 3, semester: '113-1' },
      { name: '統計學', credits: 3, semester: '113-2' },
    ],
  },
]

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

// Merge dummy students (don't overwrite real data)
for (const dummy of DUMMY_STUDENTS) {
  if (!STUDENT_MAP.has(dummy.student_id)) {
    STUDENT_MAP.set(dummy.student_id, dummy)
  }
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
