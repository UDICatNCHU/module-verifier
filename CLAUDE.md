# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NCHU (國立中興大學) domain module certification verification system. Given a student's course records and a target domain module, determines whether the student qualifies for that module's certification. 73 modules, ~500 courses, 79+ distinct remark patterns. Running live at https://cert.nlpnchu.org behind HTTP Basic Auth.

## Commands

```bash
npm run dev            # Dev server with hot reload (port 3456)
npm start              # Production server (port 3456)
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (v8) — 80% thresholds enforced
npx vitest run test/remark-parser.test.ts  # Run single test file
npx tsx scripts/audit-false-positives.ts   # Over-cert risk scan → docs/FALSE_POSITIVE_AUDIT.md
```

See `docs/CONTRIB.md` for developer workflow, `docs/RUNBOOK.md` for deployment/ops.

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
| `src/verifier.ts` | Matches student courses to groups. Per-course flags: `選修兩學期` sums two-semester credits via `sumAllCredits`; `only_semester` (上/下) filters matches via `filterBySemester`. Substitute groups are OR. 影像與視覺文化 has Level 1→2 dependency. |
| `src/student-api.ts` | Loads real students from `20260420.xlsx` (2,120 students, ~164k records, filters failing/incomplete grades). |
| `src/module-overview.ts` / `src/school-overview.ts` | Per-module and school-wide stats with in-memory caching. |
| `src/render-*.ts` | HTML rendering for `/modules`, `/module/:key`, `/overview`. |
| `src/html-utils.ts` | Shared `escapeHtml` used by all render modules. |
| `src/feedback-store.ts` | `feedback.json` read/write with corruption-safe load. |
| `src/server.ts` | Hono web server + Basic Auth. Routes: `/` `/student` `/overview` `/modules` `/module/:key` `/departments` `/department/:name` `/feedback` plus `/api/*`. |

### Data source

`modules_data.json` — 73 modules. Each module has `模組總表.課程規劃內容` (course array with `備註` field) and `模組總表.認證要求` (certification thresholds). Credits are in `排課資訊["5"]` or `規劃要點["5"]`.

**Structured per-course flags** (beyond free-text 備註):
- `課程代碼`: comma-separated codes (e.g. `"02603,99501"` for multi-semester versions)
- `認列學期`: `"上"` | `"下"` — restricts matches to one semester half (e.g. 物理系 普物 only counts 下學期)

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
| `scripts/audit-false-positives.ts` | Over-cert risk scan; writes `scripts/output/false-positive-report.{md,json}`. |
| `scripts/lib/excel-reader.ts` | Read 科目內碼 Excel and student records (xlsx). |
| `scripts/lib/normalize.ts` | Name normalization utilities (full-width→half-width, 臺→台, trailing numeral strip). |

## Tests

**212 tests across 9 files** (97% statements, 100% functions coverage enforced via `vitest.config.ts`):
- `test/complex-audit.test.ts` — hardest modules: 園藝系 (|| prefix fragmentation), 電機系 (僅認定一門課 adjacency), 生機系 (reciprocal substitutes), 生命科學系 (選修兩學期), 物理系 (3-tier pool), 影像與視覺文化 (cross-group L1→L2)
- `test/verifier.test.ts` — core matching + 3 false-positive snapshot guards (substitute dedupe, 一碼多課, advisory not enforced)
- `test/server.test.ts` — 30 integration tests via `app.request()`; covers auth, all routes, JSON API
- `test/school-overview.test.ts`, `test/module-overview.test.ts` — aggregation + cache behavior
- `test/feedback-store.test.ts`, `test/html-utils.test.ts`, `test/remark-parser.test.ts`, `test/requirement-parser.test.ts`

## Stakeholder notes (負責人回饋)

Three hardest module categories identified (2026-04-07):

1. **生科系 (動物生理、微生物科技、植物生理)** — 「專題研究」有多個科目內碼、全學年但不指定學期 → **已處理**: multi-code `course_codes[]` matching + `countSemesters()`
2. **企管系 商業智慧** — 各層級至少 1 門 + 合計至少 4 門 → **已處理**: 由現有 `required` + `choose_m_from_n` group 各自滿足（各 tier ≥1 門）結合 `certification.min_courses` 全域檢查（合計 ≥4 門）達成，不需特殊規則
3. **台文學士 影像與視覺文化** — 各層級選修間具對應關係（唯一此設計） → **已處理**: `verifyCrossGroupModule()`

## Verified results (2026-04-24 snapshot)

全校實際可發出認證總數:**972 張**(2,120 學生中 749 人 / 35.3% 取得 ≥1 模組認證,平均每位取得者 1.30 個模組)。

累計全年課修正救回 **149 張認證**(5 個 commits):
- **應經系** 3 模組 × 經濟學原理(00cd85a, +18)
- 物理/機械 3 模組 × 普通物理學 認列下學期(62eefca, +0 翻盤但對齊規則)
- **動科系** 2 模組 × 動物解剖生理學(83089b7, +54)
- **材料系** 金屬材料工程 × 材料科學導論(63a15dd, +42)
- **動科/生科/食生** 4 模組 × 生物化學(9e3c47f, +36)

Top 模組(取得人數):動科系 動物生產模組 54、動物遺傳生理模組 54、材料系 金屬材料工程 46、生科系 動物生理 35、飲食中的生物技術 22、資源與環境經濟模組 23、動科系 100% 學生取得 ≥1 模組。

## Pending work

- **真實 API 串接**: 替換 `src/student-api.ts` 的 `fetchStudentInfo()` 為真實學生成績 API,確認回傳的 `course_code` 欄位格式。目前 `20260420.xlsx` 是學期快照。
- **14 人翻盤 的剩餘全年課**:普通昆蟲學(農業害蟲模組)、史學方法(史學應用實務)、中文系敘事力應用(詩/詞/小說選讀)、成本與管理會計學(會計審計核心)— 需對應承辦人確認「選修兩學期」語義後加備註。
- **過度認證稽核(2026-04-24)**:`docs/FALSE_POSITIVE_AUDIT.md`。4 類可疑訊號待校方確認,其中:
  - code `40614` 映射電子學/一/二(**data 衝突**,需修)
  - 憲法 × 法學緒論「不得以通識抵免」18 人(需法律系確認)
  - 生機系 substitute 重複計入 5 人(需 verifier 層 dedupe 修法)
- **19 門課程代碼未解決**(2026-04-10 清單):歷史、行銷、植病、物理、環工、化工、電機、森林、應經的同名課程。可用內碼-20260410.xlsx 人工對照。
