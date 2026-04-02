/** Course from module definition */
export interface ModuleCourse {
  readonly name_zh: string
  readonly name_en: string
  readonly credits: number
  readonly offering_unit: string
  readonly remark: string | null
}

export type RuleType =
  | 'required'
  | 'choose_m_from_n'
  | 'min_credits'
  | 'min_courses'
  | 'substitute'

/** Parsed selection rule from 備註 */
export interface SelectionRule {
  readonly type: RuleType
  readonly category?: string // 基礎課程 / 核心課程 / 應用課程
  readonly choose_m?: number
  readonly choose_n?: number
  readonly min_credits?: number
  readonly min_courses?: number
  readonly notes: readonly string[]
  /** For cross-group dependency (影像與視覺文化): tag like 電影/大眾文化/表演藝術 */
  readonly subcategory_tag?: string
  /** For cross-group dependency: which level this belongs to */
  readonly cross_group_level?: number
  /** For substitute: which course(s) this substitutes */
  readonly substitutes_for?: readonly string[]
}

/** A group of courses sharing the same selection rule */
export interface CourseGroup {
  readonly label: string
  readonly rule: SelectionRule
  readonly courses: readonly ModuleCourse[]
}

/** Module with parsed structure */
export interface Module {
  readonly key: string
  readonly name_zh: string
  readonly name_en: string
  readonly unit: string
  readonly college: string
  readonly groups: readonly CourseGroup[]
  readonly all_courses: readonly ModuleCourse[]
  readonly certification: CertificationRequirement
}

export interface CertificationRequirement {
  readonly min_courses: number
  readonly min_credits: number
}

/** Student input */
export interface StudentCourse {
  readonly name: string
  readonly credits: number
  readonly semester?: string // e.g. "113-1"
}

/** Student profile with course records */
export interface StudentInfo {
  readonly student_id: string
  readonly name: string
  readonly department: string
  readonly courses: readonly StudentCourse[]
}

/** Verification result for a single group */
export interface GroupResult {
  readonly label: string
  readonly rule: SelectionRule
  readonly courses_in_group: readonly string[]
  readonly courses_matched: readonly string[]
  readonly credits_matched: number
  readonly is_satisfied: boolean
  readonly detail: string
}

/** Overall verification result */
export interface VerificationResult {
  readonly module_name: string
  readonly module_key: string
  readonly is_certified: boolean
  readonly total_courses_matched: number
  readonly total_credits_matched: number
  readonly required_courses: number
  readonly required_credits: number
  readonly group_results: readonly GroupResult[]
  readonly unmet_reasons: readonly string[]
  readonly advisory_notes: readonly string[]
}

/** Raw JSON structure from modules_data.json */
export interface RawModuleData {
  readonly 基本資訊: {
    readonly 中文: string
    readonly 英文: string
    readonly 主責教學單位: string
    readonly '主責單位 隸屬一級單位': string
    readonly [key: string]: unknown
  }
  readonly 架構計畫: {
    readonly [key: string]: unknown
  }
  readonly 模組總表: {
    readonly 課程規劃內容: readonly RawCourseData[]
    readonly 認證要求: {
      readonly 取得認證需修習總課程數: number | string
      readonly 取得認證需修習總學分數: number | string
    }
  }
  readonly 超連結?: string
}

export interface RawCourseData {
  readonly 課程名稱_中文: string
  readonly 課程名稱_英文: string
  readonly 排課資訊?: Record<string, string>
  readonly 規劃要點?: Record<string, string>
  readonly 開課單位: string
  readonly 備註?: string
}
