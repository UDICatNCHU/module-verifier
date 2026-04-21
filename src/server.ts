import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { serve } from '@hono/node-server'
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { loadModules, getModulesByCollege, findModule } from './module-loader.ts'
import { verifyModule } from './verifier.ts'
import { fetchStudentInfo, getAllStudents, getStudentsByDepartment, getDepartments } from './student-api.ts'
import { addFeedback, getFeedback, getAllFeedback, getFeedbackSummary } from './feedback-store.ts'
import { getModuleOverview } from './module-overview.ts'
import { renderModuleIndex, renderModuleOverview } from './render-module-overview.ts'
import { escapeHtml } from './html-utils.ts'
import type { Module, StudentCourse, StudentInfo, VerificationResult, CourseMatchDetail } from './models.ts'

const DATA_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(DATA_PATH)
const modulesByCollege = getModulesByCollege(modules)

// ─── Basic Auth ───
interface AuthUser { readonly username: string; readonly password: string }
const AUTH_PATH = resolve(import.meta.dirname, '../auth.json')
const authUsers: readonly AuthUser[] = existsSync(AUTH_PATH)
  ? JSON.parse(readFileSync(AUTH_PATH, 'utf-8')) as AuthUser[]
  : []
if (authUsers.length === 0) {
  console.warn('⚠️  auth.json 不存在或為空,伺服器將在無認證下執行')
}

const app = new Hono()

if (authUsers.length > 0) {
  app.use('*', basicAuth({
    verifyUser: (username, password) =>
      authUsers.some(u => u.username === username && u.password === password),
    realm: 'NCHU Module Verifier',
  }))
}

// ─── Shared HTML layout ───
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
      background: #f5f7fa;
      color: #1a1a2e;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; color: #16213e; }
    h2 { font-size: 1.3rem; margin: 24px 0 12px; color: #0f3460; }
    h3 { font-size: 1.1rem; margin: 16px 0 8px; color: #333; }
    .subtitle { color: #666; margin-bottom: 24px; }
    a { color: #0f3460; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .college-name {
      font-weight: 600;
      color: #0f3460;
      margin: 20px 0 8px;
      font-size: 1.1rem;
    }
    .module-list { list-style: none; }
    .module-list li {
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
    }
    .module-list li:last-child { border-bottom: none; }
    .module-list a {
      text-decoration: none;
      display: block;
    }
    .module-list a:hover { background: #f0f4ff; border-radius: 6px; }
    .module-meta { color: #888; font-size: 0.85rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { background: #f8f9fb; font-weight: 600; color: #333; }
    .check { color: #27ae60; font-weight: bold; }
    .cross { color: #e74c3c; font-weight: bold; }
    .dim { color: #aaa; }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .tag-pass { background: #d4edda; color: #155724; }
    .tag-fail { background: #f8d7da; color: #721c24; }
    .tag-group { background: #e8eaf6; color: #283593; }
    .tag-info { background: #d1ecf1; color: #0c5460; }
    .result-banner {
      padding: 16px 20px;
      border-radius: 8px;
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .result-pass { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .result-fail { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .stat-row {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
    }
    .stat-item {
      flex: 1;
      background: #f8f9fb;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 1.4rem; font-weight: 700; }
    .stat-label { font-size: 0.85rem; color: #666; }
    .group-section {
      border: 1px solid #e8eaf6;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .group-title { font-weight: 600; }
    .note {
      font-size: 0.85rem;
      color: #856404;
      background: #fff3cd;
      padding: 8px 12px;
      border-radius: 6px;
      margin-top: 8px;
    }
    .error-msg {
      background: #f8d7da;
      color: #721c24;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #f5c6cb;
      margin-bottom: 16px;
    }
    .flash-msg {
      background: #d4edda;
      color: #155724;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #c3e6cb;
      margin-bottom: 16px;
    }
    form { margin: 0; }
    .btn {
      display: inline-block;
      padding: 10px 24px;
      background: #0f3460;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover { background: #16213e; }
    .btn-secondary { background: #6c757d; }
    .btn-secondary:hover { background: #5a6268; }
    .btn-sm { padding: 6px 14px; font-size: 0.85rem; }
    .back-link { margin-bottom: 16px; display: inline-block; }
    .search-form {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .search-input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1.1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input:focus { border-color: #0f3460; }
    .student-header {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .student-name { font-size: 1.5rem; font-weight: 700; }
    .course-table-wrap {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }
    .dept-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .dept-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.2s;
    }
    .dept-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
    .dept-card .dept-name { font-weight: 600; font-size: 1.1rem; color: #0f3460; }
    .dept-card .dept-count { color: #888; font-size: 0.9rem; }
    .match-row-unmatched td { color: #aaa; background: #fafafa; }
    textarea {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: inherit;
      resize: vertical;
      min-height: 60px;
      outline: none;
    }
    textarea:focus { border-color: #0f3460; }
    select {
      padding: 8px 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 0.95rem;
      outline: none;
      background: white;
    }
    select:focus { border-color: #0f3460; }
    .nav-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      font-size: 0.9rem;
    }
    .nav-bar a { text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-bar">
      <a href="/">首頁</a>
      <a href="/departments">系所總覽</a>
      <a href="/modules">模組總覽</a>
      <a href="/feedback">回饋總覽</a>
    </div>
    ${body}
  </div>
</body>
</html>`
}

// ─── Page 1: Student ID input ───
app.get('/', (c) => {
  const error = c.req.query('error')
  const errorHtml = error
    ? `<div class="error-msg">${escapeHtml(error)}</div>`
    : ''

  const allStudents = getAllStudents()
  const depts = getDepartments()
  const deptStats = depts.map(d => {
    const count = getStudentsByDepartment(d).length
    return `${d} ${count}人`
  }).join(', ')

  return c.html(layout('領域模組認證檢核系統', `
    <h1>領域模組認證檢核系統</h1>
    <p class="subtitle">國立中興大學 教務處</p>
    <div class="card">
      <h2>輸入學號查詢</h2>
      ${errorHtml}
      <form action="/student" method="GET" class="search-form">
        <input type="text" name="id" class="search-input"
               placeholder="請輸入學號" required autofocus>
        <button type="submit" class="btn">查詢</button>
      </form>
      <p style="margin-top: 12px; color: #888; font-size: 0.85rem;">
        已載入 ${allStudents.length} 位學生 (${deptStats})
      </p>
      <p style="margin-top: 6px; font-size: 0.85rem;">
        <a href="/departments">按系所瀏覽 &rarr;</a>
      </p>
    </div>
  `))
})

// ─── Page 2: Student info + module selection ───
app.get('/student', async (c) => {
  const studentId = c.req.query('id')?.trim()
  if (!studentId) {
    return c.redirect('/?error=請輸入學號')
  }

  const student = await fetchStudentInfo(studentId)
  if (!student) {
    return c.redirect(`/?error=找不到學號 ${encodeURIComponent(studentId)} 的學生資料`)
  }

  // Student course table with course_code column
  let courseTableHtml = `<table>
    <thead><tr><th>課程名稱</th><th>學分</th><th>學期</th><th>內碼</th></tr></thead>
    <tbody>`
  for (const sc of student.courses) {
    courseTableHtml += `<tr>
      <td>${escapeHtml(sc.name)}</td>
      <td>${sc.credits}</td>
      <td>${escapeHtml(sc.semester ?? '-')}</td>
      <td style="font-size:0.8rem;color:#888;">${escapeHtml(sc.course_code ?? '-')}</td>
    </tr>`
  }
  courseTableHtml += `</tbody></table>`

  const totalCredits = student.courses.reduce((sum, c) => sum + c.credits, 0)

  // Module list grouped by college
  let moduleListHtml = ''
  for (const [college, mods] of modulesByCollege) {
    moduleListHtml += `<div class="college-name">${escapeHtml(college)}</div>`
    moduleListHtml += `<ul class="module-list">`
    for (const m of mods) {
      moduleListHtml += `<li>
        <a href="/student/${encodeURIComponent(student.student_id)}/verify/${encodeURIComponent(m.key)}">
          <strong>${escapeHtml(m.name_zh)}</strong>
          <div class="module-meta">${escapeHtml(m.unit)} | ${m.all_courses.length} 門課程 | 需修 ${m.certification.min_courses} 門 ${m.certification.min_credits} 學分</div>
        </a>
      </li>`
    }
    moduleListHtml += `</ul>`
  }

  return c.html(layout(`${student.name} - 修課查詢`, `
    <a href="/" class="back-link">&larr; 重新查詢</a>
    <div class="card">
      <div class="student-header">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="tag tag-info">${escapeHtml(student.student_id)}</span>
        <span class="tag tag-group">${escapeHtml(student.department)}</span>
      </div>
      <p class="module-meta">共修習 ${student.courses.length} 門課程, ${totalCredits} 學分</p>
    </div>

    <div class="two-col">
      <div class="card">
        <h2>修課紀錄</h2>
        <div class="course-table-wrap">
          ${courseTableHtml}
        </div>
      </div>
      <div class="card">
        <h2>選擇要檢核的領域模組</h2>
        ${moduleListHtml}
      </div>
    </div>
  `))
})

// ─── Page 3: Auto-verification result ───
app.get('/student/:studentId/verify/:moduleKey', async (c) => {
  const studentId = c.req.param('studentId')
  const moduleKey = c.req.param('moduleKey')

  const student = await fetchStudentInfo(studentId)
  if (!student) {
    return c.redirect(`/?error=找不到學號 ${encodeURIComponent(studentId)} 的學生資料`)
  }

  const mod = findModule(modules, moduleKey)
  if (!mod) {
    return c.html(layout('找不到模組', '<h1>找不到該領域模組</h1>'), 404)
  }

  const result = verifyModule(mod, student.courses)

  const feedbackFlash = c.req.query('feedback') === 'saved'
    ? '<div class="flash-msg">回饋已儲存，感謝您的協助！</div>'
    : ''

  return c.html(layout(`認證結果 - ${student.name}`, `
    <a href="/student?id=${encodeURIComponent(student.student_id)}" class="back-link">&larr; 返回選擇模組</a>
    ${feedbackFlash}
    ${renderResult(result, mod, student)}
  `))
})

// ─── Department overview ───
app.get('/departments', (c) => {
  const depts = getDepartments()
  let cardsHtml = ''
  for (const dept of depts) {
    const count = getStudentsByDepartment(dept).length
    cardsHtml += `<a href="/department/${encodeURIComponent(dept)}" class="dept-card">
      <div class="dept-name">${escapeHtml(dept)}</div>
      <div class="dept-count">${count} 位學生</div>
    </a>`
  }

  return c.html(layout('系所總覽', `
    <h1>系所總覽</h1>
    <p class="subtitle">選擇系所查看學生列表與批次驗證</p>
    <div class="dept-grid">${cardsHtml}</div>
  `))
})

// ─── Department detail + batch verify ───
app.get('/department/:name', (c) => {
  const deptName = c.req.param('name')
  const students = getStudentsByDepartment(deptName)
  const selectedModule = c.req.query('module')

  if (students.length === 0) {
    return c.html(layout('系所不存在', `<h1>找不到系所: ${escapeHtml(deptName)}</h1>`), 404)
  }

  // Module selector
  let moduleSelectorHtml = `<form method="GET" style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center;">
    <select name="module">
      <option value="">-- 選擇模組進行批次驗證 --</option>`
  for (const [college, mods] of modulesByCollege) {
    moduleSelectorHtml += `<optgroup label="${escapeHtml(college)}">`
    for (const m of mods) {
      const selected = selectedModule === m.key ? ' selected' : ''
      moduleSelectorHtml += `<option value="${escapeHtml(m.key)}"${selected}>${escapeHtml(m.name_zh)}</option>`
    }
    moduleSelectorHtml += `</optgroup>`
  }
  moduleSelectorHtml += `</select>
    <button type="submit" class="btn btn-sm">驗證</button>
  </form>`

  let contentHtml = ''

  if (selectedModule) {
    const mod = findModule(modules, selectedModule)
    if (!mod) {
      contentHtml = '<div class="error-msg">找不到該模組</div>'
    } else {
      // Batch verify
      const results = students.map(s => {
        const result = verifyModule(mod, s.courses)
        return { student: s, result }
      }).sort((a, b) => {
        if (a.result.is_certified !== b.result.is_certified) return a.result.is_certified ? -1 : 1
        return b.result.total_credits_matched - a.result.total_credits_matched
      })

      const passCount = results.filter(r => r.result.is_certified).length

      contentHtml = `
        <div class="card">
          <h2>${escapeHtml(mod.name_zh)}</h2>
          <p class="module-meta">認證要求: ${mod.certification.min_courses} 門 / ${mod.certification.min_credits} 學分</p>
          <div class="result-banner ${passCount > 0 ? 'result-pass' : 'result-fail'}">
            通過 ${passCount} / ${students.length} 人
          </div>
          <div class="course-table-wrap">
            <table>
              <thead><tr><th>學號</th><th>姓名</th><th>結果</th><th>課程</th><th>學分</th><th>未達原因</th><th></th></tr></thead>
              <tbody>`

      for (const { student: s, result: r } of results) {
        const tag = r.is_certified
          ? '<span class="tag tag-pass">PASS</span>'
          : '<span class="tag tag-fail">FAIL</span>'
        const reasons = r.is_certified ? '' : escapeHtml(r.unmet_reasons.join('; ')).substring(0, 80)
        contentHtml += `<tr>
          <td>${escapeHtml(s.student_id)}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${tag}</td>
          <td>${r.total_courses_matched}/${r.required_courses}</td>
          <td>${r.total_credits_matched}/${r.required_credits}</td>
          <td style="font-size:0.8rem;max-width:200px;">${reasons}</td>
          <td><a href="/student/${encodeURIComponent(s.student_id)}/verify/${encodeURIComponent(mod.key)}" class="btn btn-sm btn-secondary">詳細</a></td>
        </tr>`
      }

      contentHtml += `</tbody></table></div></div>`
    }
  } else {
    // Student list (no module selected)
    contentHtml = `<div class="card">
      <div class="course-table-wrap">
        <table>
          <thead><tr><th>學號</th><th>姓名</th><th>修課數</th><th>總學分</th><th></th></tr></thead>
          <tbody>`

    for (const s of students) {
      const totalCredits = s.courses.reduce((sum, c) => sum + c.credits, 0)
      contentHtml += `<tr>
        <td>${escapeHtml(s.student_id)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${s.courses.length}</td>
        <td>${totalCredits}</td>
        <td><a href="/student?id=${encodeURIComponent(s.student_id)}" class="btn btn-sm btn-secondary">查看</a></td>
      </tr>`
    }

    contentHtml += `</tbody></table></div></div>`
  }

  return c.html(layout(`${deptName} - 系所總覽`, `
    <a href="/departments" class="back-link">&larr; 返回系所列表</a>
    <h1>${escapeHtml(deptName)}</h1>
    <p class="subtitle">${students.length} 位學生</p>
    ${moduleSelectorHtml}
    ${contentHtml}
  `))
})

// ─── Module overview ───
const REAL_DEPT_FILTER = (s: StudentInfo) => s.department !== '【範例資料】'

app.get('/modules', (c) => {
  return c.html(layout('模組總覽', renderModuleIndex(modulesByCollege)))
})

app.get('/module/:key', (c) => {
  const key = c.req.param('key')
  const mod = findModule(modules, key)
  if (!mod) {
    return c.html(layout('找不到模組', '<h1>找不到該領域模組</h1>'), 404)
  }
  const realStudents = getAllStudents().filter(REAL_DEPT_FILTER)
  const overview = getModuleOverview(mod, realStudents)
  return c.html(layout(`${mod.name_zh} - 模組總覽`, renderModuleOverview(mod, overview)))
})

// ─── Feedback submission ───
app.post('/feedback', async (c) => {
  const body = await c.req.parseBody()
  const studentId = String(body['student_id'] ?? '')
  const moduleKey = String(body['module_key'] ?? '')
  const isCorrect = body['is_correct'] === 'yes'
  const comment = String(body['comment'] ?? '').trim().slice(0, 2000)

  if (studentId && moduleKey) {
    addFeedback({
      student_id: studentId,
      module_key: moduleKey,
      is_correct: isCorrect,
      comment,
      timestamp: new Date().toISOString(),
    })
  }

  return c.redirect(
    `/student/${encodeURIComponent(studentId)}/verify/${encodeURIComponent(moduleKey)}?feedback=saved`,
  )
})

// ─── Feedback dashboard ───
app.get('/feedback', (c) => {
  const filter = c.req.query('filter')
  const summary = getFeedbackSummary()
  let entries = getAllFeedback()

  if (filter === 'correct') entries = entries.filter(e => e.is_correct)
  if (filter === 'incorrect') entries = entries.filter(e => !e.is_correct)

  // Sort by timestamp desc
  entries = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  let tableHtml = ''
  if (entries.length === 0) {
    tableHtml = '<p style="color:#888;">尚無回饋資料</p>'
  } else {
    tableHtml = `<div class="course-table-wrap"><table>
      <thead><tr><th>學號</th><th>模組</th><th>結果</th><th>備註</th><th>時間</th><th></th></tr></thead>
      <tbody>`
    for (const e of entries) {
      const tag = e.is_correct
        ? '<span class="tag tag-pass">正確</span>'
        : '<span class="tag tag-fail">不正確</span>'
      const time = e.timestamp.substring(0, 16).replace('T', ' ')
      const modName = findModule(modules, e.module_key)?.name_zh ?? e.module_key
      tableHtml += `<tr>
        <td>${escapeHtml(e.student_id)}</td>
        <td>${escapeHtml(modName)}</td>
        <td>${tag}</td>
        <td style="font-size:0.85rem;max-width:200px;">${escapeHtml(e.comment || '-')}</td>
        <td style="font-size:0.8rem;color:#888;">${time}</td>
        <td><a href="/student/${encodeURIComponent(e.student_id)}/verify/${encodeURIComponent(e.module_key)}" class="btn btn-sm btn-secondary">查看</a></td>
      </tr>`
    }
    tableHtml += `</tbody></table></div>`
  }

  const activeFilter = (f: string | undefined) => f === filter ? 'font-weight:700;' : ''

  return c.html(layout('回饋總覽', `
    <h1>回饋總覽</h1>
    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-value">${summary.total}</div>
        <div class="stat-label">總回饋數</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" style="color:#27ae60;">${summary.correct}</div>
        <div class="stat-label">正確</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" style="color:#e74c3c;">${summary.incorrect}</div>
        <div class="stat-label">不正確</div>
      </div>
    </div>
    <div style="margin-bottom: 16px; font-size: 0.9rem;">
      篩選:
      <a href="/feedback" style="${activeFilter(undefined)}">全部</a> |
      <a href="/feedback?filter=correct" style="${activeFilter('correct')}">正確</a> |
      <a href="/feedback?filter=incorrect" style="${activeFilter('incorrect')}">不正確</a>
    </div>
    <div class="card">
      ${tableHtml}
    </div>
  `))
})

// ─── API endpoints ───
app.get('/api/student/:id', async (c) => {
  const student = await fetchStudentInfo(c.req.param('id'))
  if (!student) return c.json({ error: '找不到該學生' }, 404)
  return c.json(student)
})

app.post('/api/verify/:key', async (c) => {
  const key = c.req.param('key')
  const mod = findModule(modules, key)
  if (!mod) return c.json({ error: '找不到該領域模組' }, 404)

  const body = await c.req.json<{ courses: StudentCourse[] }>()
  const result = verifyModule(mod, body.courses)
  return c.json(result)
})

app.get('/api/modules', (c) => {
  return c.json(modules.map(m => ({
    key: m.key,
    name_zh: m.name_zh,
    name_en: m.name_en,
    unit: m.unit,
    college: m.college,
    course_count: m.all_courses.length,
    certification: m.certification,
  })))
})

app.get('/api/modules/:key', (c) => {
  const key = c.req.param('key')
  const mod = findModule(modules, key)
  if (!mod) return c.json({ error: '找不到該領域模組' }, 404)
  return c.json(mod)
})

// ─── Render verification result ───
function renderResult(result: VerificationResult, mod: Module, student: StudentInfo): string {
  const statusClass = result.is_certified ? 'result-pass' : 'result-fail'
  const statusText = result.is_certified ? 'PASS 符合認證資格' : 'FAIL 尚未符合認證資格'

  let groupsHtml = ''
  for (const gr of result.group_results) {
    const statusIcon = gr.is_satisfied
      ? '<span class="check">&#10003;</span>'
      : '<span class="cross">&#10007;</span>'
    groupsHtml += `<div class="group-section">`
    groupsHtml += `<div class="group-header">
      <span class="group-title">${statusIcon} ${escapeHtml(gr.label)}</span>
      <span class="tag ${gr.is_satisfied ? 'tag-pass' : 'tag-fail'}">${escapeHtml(gr.detail)}</span>
    </div>`

    // Build match detail lookup
    const detailMap = new Map<string, CourseMatchDetail>()
    if (gr.match_details) {
      for (const d of gr.match_details) {
        detailMap.set(d.module_course_name, d)
      }
    }

    // Render as detailed table
    groupsHtml += `<table style="font-size:0.9rem;">
      <thead><tr><th>模組課程</th><th>比對</th><th>學生課程</th><th>學分</th><th>學期</th><th>比對方式</th></tr></thead>
      <tbody>`

    for (const courseName of gr.courses_in_group) {
      const detail = detailMap.get(courseName)
      if (detail) {
        const nameDisplay = detail.student_course_name !== detail.module_course_name
          ? escapeHtml(detail.student_course_name)
          : escapeHtml(detail.student_course_name)
        const methodTag = detail.match_method === 'code'
          ? '<span class="tag tag-info">內碼</span>'
          : '<span class="tag tag-group">名稱</span>'
        groupsHtml += `<tr>
          <td>${escapeHtml(courseName)}</td>
          <td><span class="check">&#10003;</span></td>
          <td>${nameDisplay}</td>
          <td>${detail.credits}</td>
          <td>${escapeHtml(detail.semester ?? '-')}</td>
          <td>${methodTag}</td>
        </tr>`
      } else {
        groupsHtml += `<tr class="match-row-unmatched">
          <td>${escapeHtml(courseName)}</td>
          <td><span class="dim">&mdash;</span></td>
          <td class="dim">(未修)</td>
          <td class="dim">-</td>
          <td class="dim">-</td>
          <td class="dim">-</td>
        </tr>`
      }
    }

    groupsHtml += `</tbody></table></div>`
  }

  let unmetHtml = ''
  if (result.unmet_reasons.length > 0) {
    unmetHtml = `<div class="card">
      <h2>未達標項目</h2>
      <ul>${result.unmet_reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>`
  }

  let advisoryHtml = ''
  if (result.advisory_notes.length > 0) {
    advisoryHtml = `<div class="note" style="margin-top: 12px;">
      <strong>注意事項:</strong><br>
      ${result.advisory_notes.map(escapeHtml).join('<br>')}
    </div>`
  }

  // Feedback form
  const existingFeedback = getFeedback(student.student_id, mod.key)
  let feedbackHtml = `<div class="card">
    <h2>結果回饋</h2>
    <p style="color: #666; margin-bottom: 12px; font-size: 0.9rem;">此結果是否正確？您的回饋將協助我們改進系統。</p>`

  if (existingFeedback) {
    const fbTag = existingFeedback.is_correct
      ? '<span class="tag tag-pass">正確</span>'
      : '<span class="tag tag-fail">不正確</span>'
    feedbackHtml += `<p style="margin-bottom: 12px;">已回饋: ${fbTag}${existingFeedback.comment ? ` — ${escapeHtml(existingFeedback.comment)}` : ''}</p>`
  }

  feedbackHtml += `<form action="/feedback" method="POST">
      <input type="hidden" name="student_id" value="${escapeHtml(student.student_id)}">
      <input type="hidden" name="module_key" value="${escapeHtml(mod.key)}">
      <div style="margin-bottom: 12px;">
        <label style="margin-right: 16px;"><input type="radio" name="is_correct" value="yes"${existingFeedback?.is_correct === true ? ' checked' : ''} required> 正確</label>
        <label><input type="radio" name="is_correct" value="no"${existingFeedback?.is_correct === false ? ' checked' : ''}> 不正確</label>
      </div>
      <textarea name="comment" placeholder="補充說明 (選填)" style="margin-bottom: 12px;">${escapeHtml(existingFeedback?.comment ?? '')}</textarea>
      <button type="submit" class="btn btn-sm">${existingFeedback ? '更新回饋' : '送出回饋'}</button>
    </form>
  </div>`

  return `
    <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="tag tag-info">${escapeHtml(student.student_id)}</span>
        <span class="tag tag-group">${escapeHtml(student.department)}</span>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 600;">${escapeHtml(result.module_name)}</div>
        <div class="module-meta">${escapeHtml(mod.unit)} | ${escapeHtml(mod.college)}</div>
      </div>
    </div>

    <div class="result-banner ${statusClass}">${statusText}</div>

    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-value">${result.total_courses_matched} / ${result.required_courses}</div>
        <div class="stat-label">課程數</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${result.total_credits_matched} / ${result.required_credits}</div>
        <div class="stat-label">學分數</div>
      </div>
    </div>

    <div class="card">
      <h2>分組檢核</h2>
      ${groupsHtml}
      ${advisoryHtml}
    </div>

    ${unmetHtml}

    ${feedbackHtml}

    <div style="text-align: center; margin-top: 20px;">
      <a href="/student?id=${encodeURIComponent(student.student_id)}" class="btn btn-secondary">檢核其他模組</a>
      <a href="/" class="btn btn-secondary" style="margin-left: 8px;">查詢其他學生</a>
    </div>
  `
}

// ─── Start server ───
const PORT = 3456
console.log(`Server running at http://localhost:${PORT}`)
console.log(`Loaded ${modules.length} modules`)
serve({ fetch: app.fetch, port: PORT })
