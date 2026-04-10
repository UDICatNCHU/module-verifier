# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NCHU (國立中興大學) domain module certification verification system. Given a student's course records and a target domain module, determines whether the student qualifies for that module's certification. 71 modules, 505 courses, 79 distinct remark patterns.

## Commands

```bash
npm run dev          # Dev server with hot reload (port 3456)
npm start            # Production server (port 3456)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npx vitest run test/remark-parser.test.ts  # Run single test file
```

Preview server is configured in `.claude/launch.json` as `module-verifier`.

## Architecture

Four-stage pipeline transforming raw JSON into verification results:

```
modules_data.json
  → remark-parser.ts    (備註 text → SelectionRule)
  → grouper.ts          (courses → CourseGroup[] by semantic rule key)
  → verifier.ts         (student courses × groups → GroupResult[])
  → VerificationResult  { is_certified, group_results, unmet_reasons }
```

### Key modules

| File | Role |
|------|------|
| `src/models.ts` | All TypeScript interfaces. Every field is `readonly`. |
| `src/remark-parser.ts` | Parses 79 distinct 備註 patterns via priority regex cascade into 5 rule types: `required`, `choose_m_from_n`, `min_credits`, `min_courses`, `substitute`. Handles `||` separator, Chinese numerals, full-width normalization. |
| `src/requirement-parser.ts` | Parses mixed int/string certification requirements (23 formats like `"至少5"`, `"12-15"`, `"5門課"`). |
| `src/grouper.ts` | Groups courses by **semantic rule key** (type + category + params), not raw remark text. Special: consecutive adjacency for `僅認定一門課`, cross-group tags for 影像與視覺文化. |
| `src/verifier.ts` | Matches student courses to groups. Special logic: substitute groups are OR (not AND), `選修兩學期` is per-course (not per-group), 影像與視覺文化 has Level 1→2 dependency. |
| `src/student-api.ts` | Dummy student data. Single integration point — swap `fetchStudentInfo()` for real API. |
| `src/server.ts` | Hono web server. Flow: enter student ID → select module → auto-verify. Also has REST API at `/api/`. |

### Data source

`modules_data.json` — 71 modules. Each module has `模組總表.課程規劃內容` (course array with `備註` field) and `模組總表.認證要求` (certification thresholds). Credits are in `排課資訊["5"]` or `規劃要點["5"]`.

### Critical design decisions

- **Grouping by semantic key, not raw text**: Courses with different `||` prefixes (prerequisites, advisory notes) but identical core rules merge into one pool. The key is `type|category|params` (e.g. `min_courses|應用課程|m=3`).
- **Substitute groups are alternatives**: `verifier.ts` requires at least one substitute path to pass, not all. This handles reciprocal substitution (e.g. 「電子學及實習」↔「電子學」+「電子學實習」).
- **選修兩學期 is per-course**: Checked via `course.remark`, not `group.rule.notes`, so merging doesn't incorrectly apply the constraint to all courses in the group.
- **僅認定一門課 uses adjacency**: Consecutive courses with this remark form one pick-1 group; a gap (different remark) starts a new group.

### Course code (科目內碼) matching

`verifier.ts` uses **code-first matching**: when both module course and student record have `course_codes`, match by code; otherwise fall back to name. This solves the 生科系「專題研究」problem where the same course appears with different names (專題研究(一)、專題研究(二)) but shares the same course code. `countSemesters()` also uses code-first to correctly count semesters across name variants.

**Multi-code support**: `ModuleCourse.course_codes` is `readonly string[]` — one module course can map to multiple 科目內碼. This handles courses where semesters have different codes (e.g. 生科系 專題研究: `02603` in 上學期, `99501` in 下學期). In `modules_data.json`, multi-codes are stored comma-separated: `"課程代碼": "02603,99501"`. `module-loader.ts` splits on comma at load time. `StudentCourse.course_code` remains singular (each student record has one code).

**Data status**: 486/505 courses have `課程代碼` in `modules_data.json`. 19 remain unresolved (ambiguous multi-department matches like 專題研究 in 歷史系/行銷系/植病系 etc.) — none affect the 4 departments under active testing.

### Scripts

| File | Purpose |
|------|------|
| `scripts/import-course-codes.ts` | 3-layer matching pipeline (exact → normalized → suffix-stripped) to auto-import 科目內碼 from Excel into `modules_data.json`. Run with `--apply` to write. |
| `scripts/verify-4dept.ts` | Verify all students in a department against relevant modules. Usage: `npx tsx scripts/verify-4dept.ts 生科系` |
| `scripts/lib/excel-reader.ts` | Read 科目內碼 Excel and 4dept student records (xlsx). |
| `scripts/lib/normalize.ts` | Name normalization utilities (full-width→half-width, 臺→台, trailing numeral strip). |

## Tests

141 tests across 4 files. `test/complex-audit.test.ts` covers the hardest modules:
- 園藝學系 (|| prefix fragmentation)
- 電機系 (僅認定一門課 adjacency with gaps)
- 生機系 (reciprocal substitute courses)
- 生命科學系 (選修兩學期 per-course constraint)
- 物理學系 (3-tier credit pool)
- 影像與視覺文化 (cross-group Level 1→2 dependency)

`test/verifier.test.ts` includes course_code matching tests (single-code match, multi-code across semesters, semester counting, name fallback).

## Stakeholder notes (負責人回饋)

Three hardest module categories identified (2026-04-07):

1. **生科系 (動物生理、微生物科技、植物生理)** — 「專題研究」有多個科目內碼、全學年但不指定學期 → **已處理**: multi-code `course_codes[]` matching + `countSemesters()`
2. **企管系** — 各層級至少 1 門 + 合計至少 4 門（唯一此設計的模組） → **待處理**: 資料尚未進入 `modules_data.json`，且目前架構無此驗證模式，需新增 per-tier minimum + global total 規則
3. **台文學士 影像與視覺文化** — 各層級選修間具對應關係（唯一此設計） → **已處理**: `verifyCrossGroupModule()`

## Verified results (2026-04-10)

4dept 學生驗證結果 (`scripts/verify-4dept.ts`):
- **台文學士** (20人) × 影像與視覺文化: 0 人通過（跨院模組，課程重疊少）
- **生科系** (91人) × 動物生理: 20 通過 / 微生物科技: 16 通過 / 植物生理: 1 通過（吳昌翰，multi-code fix 後才正確判定）
- **資工系** (34人) × 資管系_資訊管理領域模組: 待驗證

## Pending work

- **企管系模組**: 等資料加入後，需在 `verifier.ts` 新增「各 tier ≥1 門 + 合計 ≥N 門」驗證邏輯
- **真實 API 串接**: 替換 `src/student-api.ts` 的 `fetchStudentInfo()` 為真實學生成績 API，確認回傳的 `course_code` 欄位格式
- **19 門課程代碼未解決**: 歷史系、行銷系、植病系、物理系、環工系、化工系、電機系、森林系、應經系的同名課程內碼不確定，不影響 4 系所測試
