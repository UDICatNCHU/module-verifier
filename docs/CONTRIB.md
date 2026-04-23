# 開發指南

NCHU 領域模組認證檢核系統 — 本文件面向維護者 / 貢獻者。系統層級設計與驗證邏輯請看專案根目錄的 `CLAUDE.md`。

## 技術棧

- **Runtime**: Node.js + tsx(TypeScript 無 build step)
- **Web**: [Hono 4](https://hono.dev) + `@hono/node-server`
- **Test**: Vitest 3 + `@vitest/coverage-v8`
- **Excel**: `xlsx` npm package

## 初次設定

```bash
git clone https://github.com/UDICatNCHU/module-verifier.git
cd module-verifier
npm install
```

### 執行期必要檔案(皆為 gitignore,不會從 repo 取得)

| 檔案 | 必要 | 內容 | 缺少時行為 |
|------|------|------|-------------|
| `auth.json` | 🟢 強烈建議 | Basic Auth 帳密,`[{"username":"staff","password":"..."}]` | server 會在無認證下執行(console 有 warning) |
| `20260420.xlsx` | ⚪ 選配 | 2,120 位真實學生修課紀錄(個資) | 只載入 4 位 `【範例資料】` dummy 學生 |
| `feedback.json` | ⚪ 自動生成 | 使用者提交的回饋,由 server 寫入 | 首次送出回饋時自動建立 |

**認證格式範例**(`auth.json`):

```json
[
  { "username": "staff", "password": "<隨機強密碼>" }
]
```

支援多組(每位職員一組):

```json
[
  { "username": "alice", "password": "..." },
  { "username": "bob",   "password": "..." }
]
```

編輯後需重啟 dev server(或 `touch src/server.ts`)讓 tsx watch 重載。

## 可用 npm scripts

| 指令 | 用途 |
|------|------|
| `npm run dev` | tsx watch,port 3456,檔案異動自動重載(主要開發指令) |
| `npm start` | 同 dev 但不 watch(給 production 用) |
| `npm test` | vitest run,執行全部測試 |
| `npm run test:watch` | vitest 互動模式 |
| `npm run test:coverage` | 產出覆蓋率報告到 `coverage/`(v8 provider) |

### 輔助 scripts(手動執行)

| 指令 | 用途 |
|------|------|
| `npx tsx scripts/import-course-codes.ts` | 產生匹配報告(科目內碼 ↔ 模組課程) |
| `npx tsx scripts/import-course-codes.ts --apply` | 寫入 `modules_data.json` 的 `課程代碼` 欄位 |
| `npx tsx scripts/verify-4dept.ts <系所>` | 單系所批次 verify(CLI 版) |

## 開發流程

1. **新功能先寫 plan**:本專案慣用 `/plan` 命令產生設計文件,經 user 核准才動手寫 code
2. **TDD**:logic 類變動先寫測試;render/server route 可先實作再用 integration test 鎖定
3. **覆蓋率要求**:`vitest.config.ts` 設 80% 全線門檻,不達門檻 CI 會 fail
4. **Commit 訊息**:採 Conventional Commits 格式(`feat:`、`fix:`、`docs:`、`test:`、`chore:`、`refactor:`)

## 測試策略

```bash
npm test                          # 全部測試(~20s,含 server integration)
npx vitest run test/verifier.test.ts       # 單檔
npx vitest run --coverage         # 含覆蓋率
```

**測試層級**:

- **單元測試**:`verifier`、`remark-parser`、`grouper`、`module-overview`、`school-overview`、`html-utils`、`requirement-parser`、`feedback-store`
- **整合測試**:`server.test.ts` 透過 Hono 的 `app.request(...)` 直打(不起 HTTP server),涵蓋 auth、所有 route、JSON API
- **排除測試**:`scripts/` 是一次性 CLI 工具,不列入覆蓋率

**測試中的 server**:`src/server.ts` 底部以 `process.env.VITEST` 為旗標,測試環境下跳過 `serve()`,讓測試能共用同一個 `app` 實例。

## Code style

- TypeScript strict mode
- 所有 interface 的欄位都標 `readonly`
- 盡量用純函式 + 不可變模式;cache / Map 等內部 mutation 可以但限定在建構階段
- 不加 emoji 到 console.log 或 UI(僅允許 UI 必要的 `✓`/`✗` 符號等)
- 不寫無意義的註解;只在「為何這樣做」而非「做了什麼」時加

## 目錄結構

```
src/
  server.ts                       Hono app + routes + layout (~845 行)
  models.ts                       所有 TypeScript interfaces
  verifier.ts                     核心驗證引擎
  remark-parser.ts                79 種「備註」pattern 解析
  grouper.ts                      課程分組(by 語意規則鍵)
  module-loader.ts                modules_data.json → Module[]
  requirement-parser.ts           認證要求欄位正規化
  student-api.ts                  Excel 載入 + dummy students
  feedback-store.ts               feedback.json 讀寫
  module-overview.ts              單模組:已取得 / 接近取得(含 cache)
  school-overview.ts              全校總覽(含 cache)
  render-module-overview.ts       /modules、/module/:key 的 HTML
  render-school-overview.ts       /overview 的 HTML
  html-utils.ts                   escapeHtml

test/                             9 個測試檔,191 tests
scripts/                          CLI 工具(import-course-codes、verify-4dept)
docs/                             本目錄
```
