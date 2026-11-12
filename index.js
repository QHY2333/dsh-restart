/**
 * Host half of dsh-restart.
 *
 * Exposes one same-origin endpoint that asks a small detached helper to quit
 * the running Electron application and launch it again. The browser never
 * gets to pick the executable: it is always `process.execPath` of the running
 * app, and the route only exists while a web server is mounted.
 */
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** Exact route the browser half calls. */
const ROUTE = '/_dsh_restart'
/** Withheld from other origins by the browser's own preflight for this header. */
const TOKEN_HEADER = 'x-dsh-restart'

export function apply(ctx) {
  try {
    appendFileSync(join(tmpdir(), 'dsh-restart-host.log'), `loaded ${new Date().toISOString()}\n`)
  } catch {
    // Diagnostics must never prevent the restart endpoint from mounting.
  }
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
 * The Host process lives inside an Electron job object, so a helper spawned as
 * its child is terminated when the application exits. Write the real helper to
 * a file and ask WMI to create it: a WMI-created process belongs to WmiPrvSE,
 * runs in the user's session, and survives the job's close.
 */
function launchWindows(exe) {
  const name = basename(exe).replace(/\.exe$/i, '').replace(/'/g, "''")
  const file = exe.replace(/'/g, "''")
  const directory = dirname(exe).replace(/'/g, "''")
  const helperPath = join(tmpdir(), `dsh-restart-helper-${process.pid}.ps1`)
  const helperLog = join(tmpdir(), 'dsh-restart-helper.log').replace(/'/g, "''")
  const launcherLog = join(tmpdir(), 'dsh-restart-launcher.log').replace(/'/g, "''")
  const hostLog = join(tmpdir(), 'dsh-restart-host.log')

  const helperScript = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$log = '${helperLog}'`,
    '"start " + (Get-Date -Format o) | Add-Content $log',
    // The Host runs with ELECTRON_RUN_AS_NODE=1. A launched Electron app
    // inherits it and starts as Node, then exits immediately, so drop the
    // variables that turn the desktop app into a headless runtime.
    'Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
    'Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue',
    'Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 1200',
    `Get-Process -Name '${name}' | Stop-Process -Force`,
    '$deadline = (Get-Date).AddSeconds(20)',
    `while ((Get-Date) -lt $deadline -and (Get-Process -Name '${name}' -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 300 }`,
    `"launching '${file}'" | Add-Content $log`,
    `$process = Start-Process -FilePath '${file}' -WorkingDirectory '${directory}' -PassThru`,
    'if ($null -eq $process) { Start-Sleep -Seconds 2; ' + `$process = Start-Process -FilePath '${file}' -WorkingDirectory '${directory}' -PassThru }`,
    'if ($null -eq $process) { "start failed" | Add-Content $log } else { "started pid " + $process.Id | Add-Content $log }',
  ].join('\r\n')
  writeFileSync(helperPath, '\uFEFF' + helperScript, 'utf8')

  const wmiCommand = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${helperPath.replace(/"/g, '""')}"`
  const launcherScript = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$command = '${wmiCommand.replace(/'/g, "''")}'`,
    '$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command }',
    `if ($null -eq $result -or $result.ReturnValue -ne 0) { "wmi failed " + $result.ReturnValue | Add-Content '${launcherLog}' } else { "helper pid " + $result.ProcessId | Add-Content '${launcherLog}' }`,
  ].join('; ')
  const encoded = Buffer.from(launcherScript, 'utf16le').toString('base64')
  try {
    appendFileSync(hostLog, `launch ${new Date().toISOString()} ${exe} via ${helperPath}\n`)
    // Run the WMI launcher synchronously so it finishes creating the helper
    // before the application goes away. The helper itself lives outside the
    // Electron job and does the actual stop-and-start.
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      encoded,
    ], {
      stdio: 'ignore',
      windowsHide: true,
      cwd: tmpdir(),
      timeout: 15000,
    })
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
