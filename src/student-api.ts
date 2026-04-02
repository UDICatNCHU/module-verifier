import type { StudentInfo } from './models.ts'

/**
 * Dummy student records for development/testing.
 *
 * When a real API is available, replace the implementation of
 * `fetchStudentInfo()` below — everything else stays the same.
 */
const DUMMY_STUDENTS: readonly StudentInfo[] = [
  {
    student_id: 'D1234001',
    name: '王小明',
    department: '歷史學系',
    courses: [
      { name: '臺灣史', credits: 4, semester: '113-1' },
      { name: '中臺灣區域史', credits: 2, semester: '113-2' },
      { name: '戰後中臺灣旅遊觀光史(1945-2010)', credits: 2, semester: '114-1' },
      { name: '臺中學', credits: 2, semester: '114-1' },
      { name: '日治時期臺灣山區探險史', credits: 2, semester: '114-2' },
      // Extra courses not in any module
      { name: '中國通史', credits: 4, semester: '113-1' },
      { name: '西洋史', credits: 3, semester: '113-2' },
    ],
  },
  {
    student_id: 'D1234002',
    name: '李美玲',
    department: '會計學系',
    courses: [
      { name: '中級會計學(一)', credits: 3, semester: '113-1' },
      { name: '中級會計學(二)', credits: 3, semester: '113-2' },
      { name: '成本與管理會計學', credits: 6, semester: '114-1' },
      { name: '審計學', credits: 6, semester: '114-1' },
      { name: '會計資訊系統', credits: 3, semester: '114-2' },
      // Extra
      { name: '經濟學原理', credits: 3, semester: '113-1' },
      { name: '統計學', credits: 3, semester: '113-2' },
      { name: '管理學', credits: 3, semester: '113-1' },
    ],
  },
  {
    student_id: 'D1234003',
    name: '張志豪',
    department: '資訊管理學系',
    courses: [
      { name: '計算機概論', credits: 3, semester: '113-1' },
      { name: '管理數學', credits: 3, semester: '113-1' },
      { name: '資訊管理導論', credits: 3, semester: '113-2' },
      { name: '機器學習', credits: 3, semester: '114-1' },
      // Extra
      { name: '程式設計', credits: 3, semester: '113-1' },
      { name: '資料結構', credits: 3, semester: '113-2' },
      { name: '資料庫管理', credits: 3, semester: '114-1' },
    ],
  },
  {
    student_id: 'D1234004',
    name: '陳怡君',
    department: '會計學系',
    courses: [
      // Only partial — should FAIL the 會計審計核心課程 module
      { name: '中級會計學(一)', credits: 3, semester: '113-1' },
      { name: '中級會計學(二)', credits: 3, semester: '113-2' },
      { name: '成本與管理會計學', credits: 6, semester: '114-1' },
      // Missing: second 核心 course and 應用 course
      { name: '會計學原理', credits: 3, semester: '113-1' },
      { name: '統計學', credits: 3, semester: '113-2' },
    ],
  },
]

const STUDENT_MAP = new Map(DUMMY_STUDENTS.map(s => [s.student_id, s]))

/**
 * Fetch student info by student ID.
 *
 * Replace this implementation with a real API call when available:
 *   const res = await fetch(`https://api.nchu.edu.tw/students/${studentId}/courses`)
 *   return res.ok ? await res.json() : null
 */
export async function fetchStudentInfo(studentId: string): Promise<StudentInfo | null> {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 100))
  return STUDENT_MAP.get(studentId.toUpperCase()) ?? null
}
