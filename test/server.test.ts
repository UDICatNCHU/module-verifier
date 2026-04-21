import { describe, it, expect, beforeAll } from 'vitest'

// Pre-resolve auth password the server uses (loaded once at boot from auth.json).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
let AUTH_HEADER: string

// Dynamically import server so top-level code runs once.
let app: import('hono').Hono

beforeAll(async () => {
  const authPath = resolve(import.meta.dirname, '../auth.json')
  const users = JSON.parse(readFileSync(authPath, 'utf-8')) as { username: string; password: string }[]
  const { username, password } = users[0]
  AUTH_HEADER = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')

  const mod = await import('../src/server.ts')
  app = mod.app
}, 60_000)

async function get(path: string, authed = true): Promise<Response> {
  return app.request(path, {
    headers: authed ? { Authorization: AUTH_HEADER } : {},
  })
}

describe('server — auth', () => {
  it('returns 401 when no credentials are provided', async () => {
    const res = await get('/', false)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/Basic/)
  })

  it('returns 401 for wrong password', async () => {
    const bad = 'Basic ' + Buffer.from('staff:wrong').toString('base64')
    const res = await app.request('/', { headers: { Authorization: bad } })
    expect(res.status).toBe(401)
  })

  it('returns 200 on / with valid credentials', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('領域模組認證檢核系統')
  })

  it('also protects /api routes', async () => {
    const res = await get('/api/modules', false)
    expect(res.status).toBe(401)
  })
})

describe('server — public routes', () => {
  it('/departments renders a grid', async () => {
    const res = await get('/departments')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('系所總覽')
    expect(body).toContain('dept-card')
  })

  it('/modules lists all modules grouped by college', async () => {
    const res = await get('/modules')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('模組總覽')
    const moduleLinks = body.match(/href="\/module\//g) ?? []
    expect(moduleLinks.length).toBeGreaterThan(10)
  })

  it('/overview shows school-wide stats', async () => {
    const res = await get('/overview')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('全校數據總覽')
    expect(body).toContain('可發出模組認證總數')
    expect(body).toContain('模組取得排行榜')
    expect(body).toContain('系所取得排行')
    expect(body).toContain('學生取得模組數分佈')
  }, 60_000) // first call walks every (student, module) pair — cache is cold at test start

  it('/module/:key returns 200 for a known module and shows stats', async () => {
    const key = encodeURIComponent('企業管理學系_商業智慧')
    const res = await get(`/module/${key}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('商業智慧')
    expect(body).toContain('取得人數')
    expect(body).toContain('接近取得')
  })

  it('/module/:key returns 404 for unknown key', async () => {
    const res = await get('/module/definitely-not-a-real-module')
    expect(res.status).toBe(404)
  })
})

describe('server — JSON APIs', () => {
  it('GET /api/modules returns a non-empty array', async () => {
    const res = await get('/api/modules')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ key: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('key')
  })

  it('GET /api/modules/:key returns the module', async () => {
    const key = encodeURIComponent('企業管理學系_商業智慧')
    const res = await get(`/api/modules/${key}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { key: string; name_zh: string }
    expect(body.name_zh).toBe('商業智慧')
  })

  it('GET /api/modules/:key returns 404 for unknown key', async () => {
    const res = await get('/api/modules/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/verify/:key returns a VerificationResult', async () => {
    const key = encodeURIComponent('企業管理學系_商業智慧')
    const res = await app.request(`/api/verify/${key}`, {
      method: 'POST',
      headers: { Authorization: AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courses: [
          { name: '統計學(二)', credits: 3, semester: '113-1', course_code: '34648' },
          { name: '人工智慧概論', credits: 3, semester: '113-2', course_code: '61663' },
          { name: '管理科學', credits: 3, semester: '114-1', course_code: '44615' },
          { name: '顧客分析與管理', credits: 3, semester: '114-1', course_code: '27043' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { is_certified: boolean }
    expect(body.is_certified).toBe(true)
  })

  it('GET /api/student/:id returns dummy student data', async () => {
    const res = await get('/api/student/D1234001')
    expect(res.status).toBe(200)
    const body = await res.json() as { student_id: string; name: string }
    expect(body.student_id).toBe('D1234001')
    expect(body.name).toContain('範例')
  })

  it('GET /api/student/:id returns 404 for unknown id', async () => {
    const res = await get('/api/student/NONEXISTENT')
    expect(res.status).toBe(404)
  })
})

describe('server — student + feedback flow', () => {
  it('/student redirects home when id missing', async () => {
    const res = await get('/student')
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toContain('error=')
  })

  it('/student?id=... renders a dummy student page with modules to pick', async () => {
    const res = await get('/student?id=D1234001')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('[範例] 王小明')
    expect(body).toContain('選擇要檢核的領域模組')
  })

  it('/student/:id/verify/:key renders full verification result', async () => {
    const key = encodeURIComponent('企業管理學系_商業智慧')
    const res = await get(`/student/D1234001/verify/${key}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('商業智慧')
    expect(body).toContain('分組檢核')
  })
})
