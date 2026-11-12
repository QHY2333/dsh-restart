/**
 * Host half of dsh-restart.
 *
 * Exposes one same-origin endpoint that asks a small detached helper to quit
 * the running Electron application and launch it again. The browser never
 * gets to pick the executable: it is always `process.execPath` of the running
 * app, and the route only exists while a web server is mounted.
 */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

/** Exact route the browser half calls. */
const ROUTE = '/_dsh_restart'
/** Withheld from other origins by the browser's own preflight for this header. */
const TOKEN_HEADER = 'x-dsh-restart'

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    let accepted = false
    const restart = (reason) => {
      if (accepted) return
      accepted = true
      if (reason !== undefined) ctx.logger?.info?.(`dsh-restart: ${reason}`)
      // Let the 202 reach the page before the process tree goes away.
      setTimeout(() => launch(), 300)
    }
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Use POST to request a restart.' })
        }
        if (req.headers[TOKEN_HEADER] !== '1') {
          return json(res, 403, { error: 'Missing restart request header.' })
        }
        if (!sameOrigin(webCtx, req)) {
          return json(res, 403, { error: 'Restart requests must come from the DSH page.' })
        }
        if (!supported()) {
          return json(res, 501, { error: 'Restart is only available in the DSH desktop app.' })
        }
        if (accepted) return json(res, 202, { ok: true, restarting: true })
        json(res, 202, { ok: true, restarting: true })
        restart('restart requested')
      },
    }), 'dsh-restart: restart endpoint')
  })
}

/** Answer one JSON body without keeping the socket around. */
function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', Buffer.byteLength(payload))
  res.end(payload)
}

/** Same-origin check that tolerates localhost ↔ 127.0.0.1 aliases. */
function sameOrigin(webCtx, req) {
  const site = req.headers['sec-fetch-site']
  if (site !== undefined) return site === 'same-origin' || site === 'none'
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const requestOrigin = new URL(origin)
    const serverOrigin = new URL(webCtx.webServer.getOrigin())
    return requestOrigin.host === serverOrigin.host && requestOrigin.protocol === serverOrigin.protocol
  } catch {
    return false
  }
}

/** Restarting means relaunching the Electron app this process belongs to. */
function supported() {
  return process.platform === 'win32'
    ? process.versions.electron !== undefined && existsSync(process.execPath)
    : process.versions.electron !== undefined
}

/** Quit this app and start it again from a detached helper. */
function launch() {
  const exe = process.execPath
  if (process.platform === 'win32') launchWindows(exe)
  else launchPosix(exe)
}

/**
 * Write a UTF-16 PowerShell script that stops every process of the app and
 * relaunches the executable. `-EncodedCommand` avoids all command-line
 * quoting problems, including non-ASCII install directories.
 */
function launchWindows(exe) {
  const name = basename(exe).replace(/\.exe$/i, '').replace(/'/g, "''")
  const file = exe.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    'Start-Sleep -Milliseconds 1200',
    `Get-Process -Name '${name}' | Stop-Process -Force`,
    '$deadline = (Get-Date).AddSeconds(20)',
    `while ((Get-Date) -lt $deadline -and (Get-Process -Name '${name}' -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 300 }`,
    `Start-Process -FilePath '${file}'`,
  ].join('; ')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  try {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      encoded,
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: tmpdir(),
    })
    child.unref()
  } catch (error) {
    writeFileSync(join(tmpdir(), 'dsh-restart-failure.log'), String(error?.stack ?? error))
  }
}

/** Best-effort relaunch on macOS and Linux. */
function launchPosix(exe) {
  const quoted = `'${exe.replace(/'/g, `'\\''`)}'`
  const script = [
    'sleep 1',
    `kill -TERM ${process.ppid} 2>/dev/null`,
    'sleep 2',
    `nohup ${quoted} >/dev/null 2>&1 &`,
  ].join('; ')
  try {
    const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch (error) {
    writeFileSync(join(tmpdir(), 'dsh-restart-failure.log'), String(error?.stack ?? error))
  }
}
