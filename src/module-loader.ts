import { readFileSync } from 'node:fs'
import type { Module, ModuleCourse, RawModuleData, RawCourseData } from './models.ts'
import { parseCertificationRequirement } from './requirement-parser.ts'
import { groupCourses } from './grouper.ts'

/** Extract credits from 排課資訊 or 規劃要點 field, key "5" */
function extractCredits(course: RawCourseData): number {
  const sched = course.排課資訊 ?? course.規劃要點
  if (!sched) return 0
  const raw = sched['5'] ?? '0'
  return parseInt(raw, 10) || 0
}

/** Convert raw course data to normalized ModuleCourse */
function parseCourse(raw: RawCourseData): ModuleCourse {
  return {
    name_zh: raw.課程名稱_中文.trim(),
    name_en: (raw.課程名稱_英文 ?? '').trim(),
    credits: extractCredits(raw),
    offering_unit: (raw.開課單位 ?? '').trim(),
    remark: raw.備註?.trim() ?? null,
    course_codes: raw.課程代碼
      ? raw.課程代碼.split(',').map(c => c.trim()).filter(c => c)
      : undefined,
  }
}

/** Load and parse all modules from the JSON file */
export function loadModules(filePath: string): readonly Module[] {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, RawModuleData>
  const modules: Module[] = []

  for (const [key, data] of Object.entries(raw)) {
    const courses = data.模組總表.課程規劃內容.map(parseCourse)
    const certification = parseCertificationRequirement(data.模組總表.認證要求)
    const groups = groupCourses(courses)

    modules.push({
      key,
      name_zh: data.基本資訊.中文,
      name_en: data.基本資訊.英文,
      unit: data.基本資訊.主責教學單位,
      college: data.基本資訊['主責單位 隸屬一級單位'],
      groups,
      all_courses: courses,
      certification,
    })
  }

  return modules
}

/** Find a module by key */
export function findModule(modules: readonly Module[], key: string): Module | undefined {
  return modules.find(m => m.key === key)
}

/** Get all module keys grouped by college */
export function getModulesByCollege(modules: readonly Module[]): Map<string, readonly Module[]> {
  const map = new Map<string, Module[]>()
  for (const m of modules) {
    const college = m.college || '其他'
    const list = map.get(college) ?? []
    list.push(m)
    map.set(college, list)
  }
  return map
}
