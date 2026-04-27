import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Convert a DOCX buffer to PDF using LibreOffice headless mode.
 *
 * Requires `libreoffice` (or `soffice`) on PATH. Runs in a temp dir so
 * concurrent calls don't collide.
 */
export async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'cert-pdf-'))
  const docxPath = join(dir, 'in.docx')
  const pdfPath = join(dir, 'in.pdf')
  writeFileSync(docxPath, docxBuffer)

  try {
    await runLibreOffice(docxPath, dir)
    return readFileSync(pdfPath)
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

function runLibreOffice(docxPath: string, outDir: string): Promise<void> {
  return new Promise((res, rej) => {
    const proc = spawn(
      'libreoffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath],
      { env: { ...process.env, HOME: outDir } },  // isolate user profile
    )
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => rej(new Error(`libreoffice spawn failed: ${err.message}. Is libreoffice installed?`)))
    proc.on('close', code => {
      if (code === 0) res()
      else rej(new Error(`libreoffice exited ${code}: ${stderr}`))
    })
  })
}

/** Cheap probe used by routes/tests: is libreoffice on PATH? */
export function libreOfficeAvailable(): Promise<boolean> {
  return new Promise(res => {
    const proc = spawn('libreoffice', ['--version'])
    proc.on('error', () => res(false))
    proc.on('close', code => res(code === 0))
  })
}
