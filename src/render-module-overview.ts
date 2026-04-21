import type { Module } from './models.ts'
import type { ModuleOverview, StudentPassEntry } from './module-overview.ts'
import { groupByDepartment } from './module-overview.ts'
import { escapeHtml } from './html-utils.ts'

/** /modules — list all modules grouped by college, each linking to /module/:key */
export function renderModuleIndex(
  modulesByCollege: ReadonlyMap<string, readonly Module[]>,
): string {
  let html = `
    <h1>模組總覽</h1>
    <p class="subtitle">選擇領域模組查看目前已取得認證的學生</p>
  `

  for (const [college, mods] of modulesByCollege) {
    html += `<div class="card">`
    html += `<div class="college-name">${escapeHtml(college)}</div>`
    html += `<ul class="module-list">`
    for (const m of mods) {
      html += `<li>
        <a href="/module/${encodeURIComponent(m.key)}">
          <strong>${escapeHtml(m.name_zh)}</strong>
          <div class="module-meta">${escapeHtml(m.unit)} | ${m.all_courses.length} 門課程 | 需修 ${m.certification.min_courses} 門 ${m.certification.min_credits} 學分</div>
        </a>
      </li>`
    }
    html += `</ul></div>`
  }
  return html
}

/** /module/:key — header + stats banner + pass list + near-miss list */
export function renderModuleOverview(mod: Module, overview: ModuleOverview): string {
  const passGroups = groupByDepartment(overview.passed)
  const nearGroups = groupByDepartment(overview.nearMiss)
  const passDeptCount = passGroups.size

  return `
    <a href="/modules" class="back-link">&larr; 返回模組總覽</a>
    <div class="card">
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1>${escapeHtml(mod.name_zh)}</h1>
          <p class="subtitle">${escapeHtml(mod.unit)} | ${escapeHtml(mod.college)}</p>
        </div>
        <div style="text-align: right; color: #666;">
          <div>認證要求</div>
          <div style="font-size: 1.1rem; font-weight: 600;">${mod.certification.min_courses} 門 / ${mod.certification.min_credits} 學分</div>
        </div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-value" style="color:#27ae60;">${overview.passed.length}</div>
        <div class="stat-label">取得人數</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${passDeptCount}</div>
        <div class="stat-label">涵蓋系所數</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" style="color:#e67e22;">${overview.nearMiss.length}</div>
        <div class="stat-label">接近取得</div>
      </div>
    </div>

    ${renderPassSection(mod, passGroups)}
    ${renderNearMissSection(mod, nearGroups)}
  `
}

function renderPassSection(
  mod: Module,
  passGroups: ReadonlyMap<string, readonly StudentPassEntry[]>,
): string {
  if (passGroups.size === 0) {
    return `<div class="card"><h2>取得學生</h2><p style="color:#888;">目前尚無學生取得此模組認證</p></div>`
  }

  let html = `<div class="card"><h2>取得學生 (按系所分組)</h2>`
  const sorted = [...passGroups.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [dept, entries] of sorted) {
    html += `<div class="college-name">${escapeHtml(dept)} — ${entries.length} 人</div>`
    html += passTable(mod, entries)
  }
  html += `</div>`
  return html
}

function renderNearMissSection(
  mod: Module,
  nearGroups: ReadonlyMap<string, readonly StudentPassEntry[]>,
): string {
  if (nearGroups.size === 0) {
    return ''
  }

  let html = `<div class="card"><h2>接近取得的學生 (差 1 門 + 3 學分內)</h2>`
  const sorted = [...nearGroups.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [dept, entries] of sorted) {
    html += `<div class="college-name">${escapeHtml(dept)} — ${entries.length} 人</div>`
    html += nearMissTable(mod, entries)
  }
  html += `</div>`
  return html
}

function passTable(mod: Module, entries: readonly StudentPassEntry[]): string {
  let html = `<div class="course-table-wrap"><table>
    <thead><tr><th>學號</th><th>姓名</th><th>門數</th><th>學分</th><th></th></tr></thead>
    <tbody>`
  for (const { student: s, result: r } of entries) {
    html += `<tr>
      <td>${escapeHtml(s.student_id)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${r.total_courses_matched} / ${r.required_courses}</td>
      <td>${r.total_credits_matched} / ${r.required_credits}</td>
      <td><a href="/student/${encodeURIComponent(s.student_id)}/verify/${encodeURIComponent(mod.key)}" class="btn btn-sm btn-secondary">詳細</a></td>
    </tr>`
  }
  html += `</tbody></table></div>`
  return html
}

function nearMissTable(mod: Module, entries: readonly StudentPassEntry[]): string {
  let html = `<div class="course-table-wrap"><table>
    <thead><tr><th>學號</th><th>姓名</th><th>門數</th><th>學分</th><th>未達原因</th><th></th></tr></thead>
    <tbody>`
  for (const { student: s, result: r } of entries) {
    const reason = r.unmet_reasons[0] ?? ''
    html += `<tr>
      <td>${escapeHtml(s.student_id)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${r.total_courses_matched} / ${r.required_courses}</td>
      <td>${r.total_credits_matched} / ${r.required_credits}</td>
      <td style="font-size:0.85rem; max-width: 280px;">${escapeHtml(reason).slice(0, 120)}</td>
      <td><a href="/student/${encodeURIComponent(s.student_id)}/verify/${encodeURIComponent(mod.key)}" class="btn btn-sm btn-secondary">詳細</a></td>
    </tr>`
  }
  html += `</tbody></table></div>`
  return html
}
