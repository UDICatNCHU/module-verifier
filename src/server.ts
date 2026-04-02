import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { resolve } from 'node:path'
import { loadModules, getModulesByCollege, findModule } from './module-loader.ts'
import { verifyModule } from './verifier.ts'
import { fetchStudentInfo } from './student-api.ts'
import type { Module, StudentCourse, StudentInfo, VerificationResult } from './models.ts'

const DATA_PATH = resolve(import.meta.dirname, '../modules_data.json')
const modules = loadModules(DATA_PATH)
const modulesByCollege = getModulesByCollege(modules)

const app = new Hono()

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
    .container { max-width: 900px; margin: 0 auto; }
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
    .course-item {
      padding: 6px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .course-item + .course-item { border-top: 1px solid #f0f0f0; }
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
    }
    .student-name { font-size: 1.5rem; font-weight: 700; }
    .course-table-wrap {
      max-height: 300px;
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
  </style>
</head>
<body>
  <div class="container">
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

  return c.html(layout('領域模組認證檢核系統', `
    <h1>領域模組認證檢核系統</h1>
    <p class="subtitle">國立中興大學 教務處</p>
    <div class="card">
      <h2>輸入學號查詢</h2>
      ${errorHtml}
      <form action="/student" method="GET" class="search-form">
        <input type="text" name="id" class="search-input"
               placeholder="請輸入學號 (例: D1234001)" required autofocus>
        <button type="submit" class="btn">查詢</button>
      </form>
      <p style="margin-top: 12px; color: #888; font-size: 0.85rem;">
        測試用學號: D1234001 (王小明)、D1234002 (李美玲)、D1234003 (張志豪)、D1234004 (陳怡君)
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

  // Student course table
  let courseTableHtml = `<table>
    <thead><tr><th>課程名稱</th><th>學分</th><th>學期</th></tr></thead>
    <tbody>`
  for (const sc of student.courses) {
    courseTableHtml += `<tr>
      <td>${escapeHtml(sc.name)}</td>
      <td>${sc.credits}</td>
      <td>${escapeHtml(sc.semester ?? '-')}</td>
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
  const studentId = decodeURIComponent(c.req.param('studentId'))
  const moduleKey = decodeURIComponent(c.req.param('moduleKey'))

  const student = await fetchStudentInfo(studentId)
  if (!student) {
    return c.redirect(`/?error=找不到學號 ${encodeURIComponent(studentId)} 的學生資料`)
  }

  const mod = findModule(modules, moduleKey)
  if (!mod) {
    return c.html(layout('找不到模組', '<h1>找不到該領域模組</h1>'), 404)
  }

  const result = verifyModule(mod, student.courses)

  return c.html(layout(`認證結果 - ${student.name}`, `
    <a href="/student?id=${encodeURIComponent(student.student_id)}" class="back-link">&larr; 返回選擇模組</a>
    ${renderResult(result, mod, student)}
  `))
})

// ─── API endpoints ───
app.get('/api/student/:id', async (c) => {
  const student = await fetchStudentInfo(c.req.param('id'))
  if (!student) return c.json({ error: '找不到該學生' }, 404)
  return c.json(student)
})

app.post('/api/verify/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
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
  const key = decodeURIComponent(c.req.param('key'))
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

    for (const courseName of gr.courses_in_group) {
      const matched = gr.courses_matched.includes(courseName)
      const icon = matched
        ? '<span class="check">&#10003;</span>'
        : '<span class="cross">&mdash;</span>'
      const text = matched ? courseName : `${courseName} (未修)`
      groupsHtml += `<div class="course-item">
        <span>${icon} ${escapeHtml(text)}</span>
      </div>`
    }
    groupsHtml += `</div>`
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

  return `
    <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
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

    <div style="text-align: center; margin-top: 20px;">
      <a href="/student?id=${encodeURIComponent(student.student_id)}" class="btn btn-secondary">檢核其他模組</a>
      <a href="/" class="btn btn-secondary" style="margin-left: 8px;">查詢其他學生</a>
    </div>
  `
}

function ruleDescription(rule: import('./models.ts').SelectionRule): string {
  switch (rule.type) {
    case 'required': return '必修'
    case 'choose_m_from_n': return `${rule.choose_n ?? '?'}選${rule.choose_m ?? '?'}`
    case 'min_credits': return `至少${rule.min_credits}學分`
    case 'min_courses': return `至少${rule.min_courses}門`
    case 'substitute': return '替代'
    default: return ''
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Start server ───
const PORT = 3456
console.log(`Server running at http://localhost:${PORT}`)
console.log(`Loaded ${modules.length} modules`)
serve({ fetch: app.fetch, port: PORT })
