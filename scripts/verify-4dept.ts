/**
 * Verify 4dept students against relevant modules.
 * Usage: npx tsx scripts/verify-4dept.ts
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadModules } from '../src/module-loader.ts'
import { verifyModule } from '../src/verifier.ts'
import type { StudentCourse, StudentInfo } from '../src/models.ts'
import { read4DeptExcel } from './lib/excel-reader.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const MODULES_JSON = resolve(PROJECT_ROOT, 'modules_data.json')
const FOUR_DEPT_EXCEL = resolve(PROJECT_ROOT, '20260410-4dept.xlsx')

// Parse target department from CLI args, default to 台文學士
const targetDept = process.argv[2] || '台文學士'

// Load modules
const modules = loadModules(MODULES_JSON)

// Map department to relevant module keys
const deptModuleMap: Record<string, readonly string[]> = {
  '台文學士': ['台灣人文創新學士學位學程_影像與視覺文化'],
  '生科系': [
    '生命科學系_動物生理',
    '生命科學系_微生物科技',
    '生命科學系_植物生理',
  ],
  '資工系': ['資管系_資訊管理領域模組'],
  '企管系': [], // 模組尚未建立
}

const moduleKeys = deptModuleMap[targetDept]
if (!moduleKeys || moduleKeys.length === 0) {
  console.log(`${targetDept}: 無對應模組可測試`)
  process.exit(0)
}

// Load student records
const records = read4DeptExcel(FOUR_DEPT_EXCEL)
const deptRecords = records.filter(r => r.department === targetDept)

// Group by student
const studentMap = new Map<string, { name: string; courses: StudentCourse[] }>()
for (const r of deptRecords) {
  if (!studentMap.has(r.student_id)) {
    studentMap.set(r.student_id, { name: r.name, courses: [] })
  }
  studentMap.get(r.student_id)!.courses.push({
    name: r.course_name,
    credits: r.credits,
    semester: `${r.year}-${r.semester}`,
    course_code: r.course_code,
  })
}

console.log(`=== ${targetDept} 學生 × 模組驗證 ===`)
console.log(`學生數: ${studentMap.size}`)
console.log(`測試模組: ${moduleKeys.join(', ')}`)
console.log('')

for (const moduleKey of moduleKeys) {
  const mod = modules.find(m => m.key === moduleKey)
  if (!mod) {
    console.log(`⚠️ 模組 ${moduleKey} 未找到`)
    continue
  }

  console.log(`--- ${mod.name_zh} (${moduleKey}) ---`)
  console.log(`認證要求: ${mod.certification.min_courses} 門 / ${mod.certification.min_credits} 學分`)
  console.log('')

  const results: { id: string; name: string; pass: boolean; courses: number; credits: number; detail: string }[] = []

  for (const [sid, student] of studentMap) {
    const result = verifyModule(mod, student.courses)
    results.push({
      id: sid,
      name: student.name,
      pass: result.is_certified,
      courses: result.total_courses_matched,
      credits: result.total_credits_matched,
      detail: result.is_certified
        ? ''
        : result.unmet_reasons.join('; '),
    })
  }

  // Sort: passed first, then by credits desc
  results.sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? -1 : 1
    return b.credits - a.credits
  })

  const passed = results.filter(r => r.pass)
  const top5Failed = results.filter(r => !r.pass).slice(0, 5)

  console.log(`✅ 通過: ${passed.length} / ${studentMap.size} 人`)
  if (passed.length > 0) {
    console.log('')
    for (const r of passed) {
      console.log(`  ${r.id} ${r.name}: ${r.courses}門 ${r.credits}學分`)
    }
  }

  if (top5Failed.length > 0) {
    console.log(`\n❌ 未通過（前5名最接近的）:`)
    for (const r of top5Failed) {
      console.log(`  ${r.id} ${r.name}: ${r.courses}門 ${r.credits}學分`)
      console.log(`    原因: ${r.detail}`)
    }
  }
  console.log('')
}
