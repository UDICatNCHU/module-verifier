import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { Module, StudentInfo, VerificationResult } from './models.ts'

const TEMPLATE_PATH = resolve(import.meta.dirname, '../templates/cert-template.docx')

export interface CertCourseRow {
  readonly name_zh: string
  readonly name_en: string
  readonly credits: number | string
  readonly score: string
}

export interface CertContext {
  readonly date_roc: string
  readonly date_iso: string
  readonly name_zh: string
  readonly student_id: string
  readonly module_zh: string
  readonly module_en: string
  readonly courses: readonly CertCourseRow[]
}

/** Format a Date as 民國 YY年MM月DD日 in Asia/Taipei (e.g. 115年04月27日) */
function formatRoc(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const yyyy = +(parts.find(p => p.type === 'year')!.value)
  const mm = parts.find(p => p.type === 'month')!.value
  const dd = parts.find(p => p.type === 'day')!.value
  return `${yyyy - 1911}年${mm}月${dd}日`
}

/** Format a Date as MM/DD/YYYY in Asia/Taipei for English line */
function formatIso(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const yyyy = parts.find(p => p.type === 'year')!.value
  const mm = parts.find(p => p.type === 'month')!.value
  const dd = parts.find(p => p.type === 'day')!.value
  return `${mm}/${dd}/${yyyy}`
}

/**
 * Build the placeholder context for a passing (student, module) pair.
 * Includes only courses the student actually took (option (a) — drop unmet rows).
 */
export function buildCertContext(
  student: StudentInfo,
  mod: Module,
  result: VerificationResult,
  date: Date,
): CertContext {
  // Collect every matched course detail across all groups.
  const rows: CertCourseRow[] = []
  const seen = new Set<string>()
  for (const gr of result.group_results) {
    for (const d of gr.match_details ?? []) {
      const key = d.module_course_name
      if (seen.has(key)) continue
      seen.add(key)
      // Look up the module course to get the canonical English name.
      const mc = mod.all_courses.find(c => c.name_zh === d.module_course_name)
      rows.push({
        name_zh: d.module_course_name,
        name_en: mc?.name_en ?? '',
        credits: d.credits,
        score: d.score ?? '',
      })
    }
  }

  return {
    date_roc: formatRoc(date),
    date_iso: formatIso(date),
    name_zh: student.name,
    student_id: student.student_id,
    module_zh: mod.name_zh,
    module_en: mod.name_en ?? '',
    courses: rows,
  }
}

/**
 * Render the certificate DOCX for the given context.
 * Returns a Node Buffer ready to send as response or write to disk.
 */
export function renderCertDocx(ctx: CertContext): Buffer {
  const content = readFileSync(TEMPLATE_PATH, 'binary')
  const zip = new PizZip(content)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  })
  doc.render(ctx)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * One-shot helper: verify (student, module) and produce DOCX if certified.
 * Throws if student has not passed the module.
 */
export function generateCertDocx(
  student: StudentInfo,
  mod: Module,
  result: VerificationResult,
  date: Date = new Date(),
): Buffer {
  if (!result.is_certified) {
    throw new Error(`student ${student.student_id} is not certified for ${mod.key}`)
  }
  const ctx = buildCertContext(student, mod, result, date)
  return renderCertDocx(ctx)
}
