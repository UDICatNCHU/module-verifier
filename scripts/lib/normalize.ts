/**
 * Shared normalization utilities for course name matching.
 * Used by the import script to match module course names
 * against the 科目內碼 Excel lookup table.
 */

/** Normalize a course name for matching: full-width → half-width, remove spaces, 臺→台 */
export function normalizeForMatching(name: string): string {
  return name
    .trim()
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .replace(/臺/g, '台')
}

/**
 * Extract Chinese name from dual-language format:
 * "（中文）微積分(一) （英文）Calculus(I)" → "微積分(一)"
 */
export function extractChineseName(raw: string): string | null {
  const match = raw.match(/（中文）(.+?)(?:\s*（英文）|$)/)
  return match ? match[1].trim() : null
}

/**
 * Strip trailing bare Chinese numeral: "電路學一" → "電路學"
 * Only strips if the numeral is NOT inside parentheses.
 */
export function stripTrailingNumeral(name: string): string | null {
  const stripped = name.replace(/[一二三四五六七八九十]+$/, '')
  return stripped !== name && stripped.length > 0 ? stripped : null
}

/** Normalize English name for fuzzy comparison: lowercase, strip spaces/punctuation */
export function normalizeEnglish(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
