import type { SchoolOverview, ModuleRank, DepartmentRank } from './school-overview.ts'
import { escapeHtml } from './html-utils.ts'

const TOP_MODULES = 15

/** Render /overview — school-wide stats dashboard */
export function renderSchoolOverview(overview: SchoolOverview): string {
  const avgPerCertified = overview.studentsWithCerts === 0
    ? '0'
    : (overview.totalCertifications / overview.studentsWithCerts).toFixed(2)
  const coveragePct = overview.totalStudents === 0
    ? '0'
    : ((overview.studentsWithCerts / overview.totalStudents) * 100).toFixed(1)

  return `
    <h1>全校數據總覽</h1>
    <p class="subtitle">依現有學生修課紀錄計算,以全體真實學生為母體</p>

    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-value" style="color:#27ae60;">${overview.totalCertifications}</div>
        <div class="stat-label">可發出模組認證總數</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${overview.studentsWithCerts} / ${overview.totalStudents}</div>
        <div class="stat-label">取得認證 / 全體學生 (${coveragePct}%)</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${avgPerCertified}</div>
        <div class="stat-label">平均每位取得者拿幾個</div>
      </div>
    </div>

    ${renderModuleTop(overview.moduleRanking)}
    ${renderDeptRanking(overview.departmentRanking)}
    ${renderCertDistribution(overview.certCountDistribution, overview.totalStudents)}
  `
}

function renderModuleTop(modules: readonly ModuleRank[]): string {
  const top = modules.slice(0, TOP_MODULES)
  const moreCount = Math.max(0, modules.length - TOP_MODULES)

  let html = `<div class="card">
    <h2>模組取得排行榜 (Top ${top.length})</h2>
    <div class="course-table-wrap"><table>
      <thead><tr><th>#</th><th>模組</th><th>主責單位</th><th>取得人數</th><th>接近取得</th><th></th></tr></thead>
      <tbody>`
  top.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(r.module.name_zh)}</strong></td>
      <td>${escapeHtml(r.module.unit)}</td>
      <td style="color:#27ae60; font-weight:600;">${r.passedCount}</td>
      <td style="color:#e67e22;">${r.nearMissCount}</td>
      <td><a href="/module/${encodeURIComponent(r.module.key)}" class="btn btn-sm btn-secondary">詳細</a></td>
    </tr>`
  })
  html += `</tbody></table></div>`
  if (moreCount > 0) {
    html += `<p style="color:#888; font-size:0.9rem; margin-top:8px;">尚有 ${moreCount} 個模組未列出,<a href="/modules">完整列表 &rarr;</a></p>`
  }
  html += `</div>`
  return html
}

function renderDeptRanking(depts: readonly DepartmentRank[]): string {
  let html = `<div class="card">
    <h2>系所取得排行</h2>
    <p class="module-meta" style="margin-bottom:12px;">以「取得認證學生數」排序;並列「該系所學生取得的模組數總和」供對照。</p>
    <div class="course-table-wrap"><table>
      <thead><tr><th>#</th><th>系所</th><th>取得學生</th><th>系所總數</th><th>比例</th><th>模組數總和</th><th>平均</th></tr></thead>
      <tbody>`
  depts.forEach((d, i) => {
    const pct = d.totalStudents === 0 ? '0' : ((d.certifiedStudents / d.totalStudents) * 100).toFixed(1)
    const avg = d.certifiedStudents === 0 ? '-' : (d.totalCertifications / d.certifiedStudents).toFixed(2)
    const isZero = d.certifiedStudents === 0
    const rowStyle = isZero ? ' style="color:#999;"' : ''
    html += `<tr${rowStyle}>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(d.department)}</strong></td>
      <td style="font-weight:600;">${d.certifiedStudents}</td>
      <td>${d.totalStudents}</td>
      <td>${pct}%</td>
      <td>${d.totalCertifications}</td>
      <td>${avg}</td>
    </tr>`
  })
  html += `</tbody></table></div></div>`
  return html
}

function renderCertDistribution(
  dist: ReadonlyMap<number, number>,
  totalStudents: number,
): string {
  // Bucket: 0, 1, 2, 3, 4+
  const buckets = [
    { label: '0 個', count: dist.get(0) ?? 0 },
    { label: '1 個', count: dist.get(1) ?? 0 },
    { label: '2 個', count: dist.get(2) ?? 0 },
    { label: '3 個', count: dist.get(3) ?? 0 },
    { label: '4 個以上', count: [...dist.entries()].filter(([k]) => k >= 4).reduce((s, [, v]) => s + v, 0) },
  ]

  let html = `<div class="card">
    <h2>學生取得模組數分佈</h2>
    <div class="course-table-wrap"><table>
      <thead><tr><th>取得模組數</th><th>學生數</th><th>佔比</th></tr></thead>
      <tbody>`
  for (const b of buckets) {
    const pct = totalStudents === 0 ? '0' : ((b.count / totalStudents) * 100).toFixed(1)
    html += `<tr>
      <td>${b.label}</td>
      <td style="font-weight:600;">${b.count}</td>
      <td>${pct}%</td>
    </tr>`
  }
  html += `</tbody></table></div></div>`
  return html
}
