#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const skillDir = resolve(here, '..')
const repoRoot = resolve(skillDir, '..', '..', '..')

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log('Usage: node drive.mjs --scenario proof [--out DIR] [--base URL] [--login-latency MS] [--headed]')
  process.exit(0)
}
if (args.scenario !== 'proof') {
  console.error(`Unknown scenario "${args.scenario}". Only "proof" is automated today.`)
  process.exit(2)
}

const fileEnv = readDotEnv(join(repoRoot, '.env.verify'))
const email = process.env.SETPLATE_VERIFY_EMAIL || fileEnv.SETPLATE_VERIFY_EMAIL
const password = process.env.SETPLATE_VERIFY_PASSWORD || fileEnv.SETPLATE_VERIFY_PASSWORD
if (!email || !password) {
  console.error('Missing credentials. Set SETPLATE_VERIFY_EMAIL and SETPLATE_VERIFY_PASSWORD in .env.verify or the environment.')
  process.exit(2)
}

const chromePath = findChrome()
if (!chromePath) {
  console.error('Chrome or Edge was not found. Set CHROME_PATH.')
  process.exit(2)
}

const startedAt = new Date().toISOString()
const outDir = resolve(args.out || join(skillDir, 'evidence', startedAt.replace(/[:.]/g, '-')))
mkdirSync(outDir, { recursive: true })
const runDir = join(skillDir, '.run')
mkdirSync(runDir, { recursive: true })
const profileDir = join(runDir, `chrome-profile-${process.pid}`)

const consoleErrors = []
const requestUrls = new Map()
const exerciseResponses = []
const failedApiRequests = []
let loginStatus = null

async function main() {
let child = null
let browser = null
let page = null
let exitCode = 0

try {
  await warmUpLogin(args.base, email, password)
  const launched = await launchChrome(profileDir)
  child = launched.child
  const endpoint = `http://127.0.0.1:${launched.port}`
  const version = await (await fetch(`${endpoint}/json/version`)).json()
  browser = new Cdp(version.webSocketDebuggerUrl)
  await browser.connect()

  const targetResponse = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  const target = await targetResponse.json()
  page = new Cdp(target.webSocketDebuggerUrl)
  await page.connect()

  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Network.enable')
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
  })
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type !== 'error') return
    consoleErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
  })
  page.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Uncaught exception')
  })
  page.on('Network.requestWillBeSent', (params) => {
    requestUrls.set(params.requestId, params.request.url)
  })
  page.on('Network.responseReceived', (params) => {
    const url = params.response.url
    if (url.includes('/api/v1/users/login')) loginStatus = params.response.status
    if (url.includes('/api/v1/workouts/exercises?')) {
      exerciseResponses.push({ requestId: params.requestId, url, status: params.response.status })
    }
  })
  page.on('Network.loadingFinished', async (params) => {
    const entry = exerciseResponses.find((item) => item.requestId === params.requestId && !item.body && !item.bodyError)
    if (!entry) return
    try {
      const body = await page.send('Network.getResponseBody', { requestId: params.requestId })
      const parsed = JSON.parse(body.body)
      entry.body = {
        total: parsed.total,
        items: Array.isArray(parsed.items)
          ? parsed.items.map(({ id, name, category }) => ({ id, name, category }))
          : [],
      }
    } catch (error) {
      entry.bodyError = String(error?.message || error)
    }
  })
  page.on('Network.loadingFailed', (params) => {
    if (params.type !== 'Fetch' && params.type !== 'XHR') return
    const url = requestUrls.get(params.requestId) || ''
    if (!url.includes('/api/')) return
    if (params.errorText === 'net::ERR_ABORTED') return
    failedApiRequests.push({ url, error: params.errorText })
  })

  await navigate(page, `${args.base}/login`)
  const loginForm = await waitForValue(
    page,
    `document.querySelector('#login-email') && document.querySelector('#login-password') ? 'form' : ''`,
    20000,
    'login form',
  )
  if (loginForm !== 'form') throw new Error('Login form did not render')

  await setInput(page, '#login-email', email)
  await setInput(page, '#login-password', password)

  if (args.loginLatency > 0) {
    await page.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: args.loginLatency,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
  }

  let loginOutcome = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForValue(page, `(() => {
      const button = document.querySelector('form.login-form button[type="submit"]');
      return button && !button.disabled ? 'ready' : '';
    })()`, 10000, 'enabled sign-in button')
    await evaluate(page, `document.querySelector('form.login-form').requestSubmit(); true`)
    await sleep(500)
    loginOutcome = await waitForValue(page, `(() => {
      try {
        if (localStorage.getItem('set_plate_user')) return 'session';
      } catch (error) {}
      const notice = document.querySelector('.login-notice');
      if (notice && notice.textContent.trim()) return 'error:' + notice.textContent.trim();
      return '';
    })()`, 25000, 'login outcome')
    if (!loginOutcome.startsWith('error:')) break
    if (!/timed out|timeout|taking longer/i.test(loginOutcome)) break
    await sleep(1000)
  }
  if (loginOutcome.startsWith('error:')) throw new Error(loginOutcome)

  if (args.loginLatency > 0) {
    await page.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
  }

  const session = await evaluate(page, `(() => {
    try { return JSON.parse(localStorage.getItem('set_plate_user') || 'null'); } catch (error) { return null; }
  })()`)
  if (!session?.id) throw new Error('Login succeeded without a user id in localStorage')

  // Full navigation cancels the login screen's delayed SPA redirect, so Home
  // never mounts and never calls POST /api/v1/workouts/plan-today.
  await navigate(page, `${args.base}/workouts/active/exercises`)
  const catalogOutcome = await waitForValue(page, `(() => {
    const count = document.querySelectorAll('.exercise-picker-item').length;
    if (count > 0) return 'items:' + count;
    const state = document.querySelector('.state-card');
    const text = state ? state.textContent.trim() : '';
    if (text && !/loading/i.test(text)) return 'state:' + text;
    return '';
  })()`, 25000, 'exercise catalog')
  if (catalogOutcome.startsWith('state:')) {
    throw new Error(`Exercise catalog did not render: ${catalogOutcome.slice(6)}`)
  }

  const initial = await evaluate(page, `({
    count: document.querySelectorAll('.exercise-picker-item').length,
    names: Array.from(document.querySelectorAll('.exercise-picker-item strong')).slice(0, 5).map((el) => el.textContent.trim()),
    state: document.querySelector('.state-card')?.textContent?.trim() || null
  })`)
  await screenshot(page, '01-before-search.png')

  await setInput(page, 'input[aria-label="Search exercises"]', 'bench')
  const bench = await waitUntil(() => {
    return [...exerciseResponses].reverse().find((entry) => entry.url.includes('q=bench') && entry.body) || null
  }, 25000, 'search API response')

  const expectedCount = bench.body.items.length
  await waitForValue(
    page,
    `document.querySelectorAll('.exercise-picker-item').length === ${expectedCount} ? 'rendered' : ''`,
    15000,
    'rendered search results',
  )

  const searched = await evaluate(page, `({
    count: document.querySelectorAll('.exercise-picker-item').length,
    names: Array.from(document.querySelectorAll('.exercise-picker-item strong')).slice(0, 8).map((el) => el.textContent.trim()),
    pagination: document.querySelector('.pagination-count')?.textContent?.trim() || null,
    state: document.querySelector('.state-card')?.textContent?.trim() || null
  })`)
  await screenshot(page, '02-search-bench.png')

  const apiNames = bench.body.items.slice(0, 8).map((item) => item.name)
  const significantConsole = consoleErrors.filter((line) => !/\[vite\]/i.test(line) && !/Download the React DevTools/i.test(line))
  const assertions = {
    catalog_rendered: initial.count > 0,
    search_request_succeeded: bench.status === 200,
    search_returned_results: expectedCount > 0,
    dom_count_matches_api: searched.count === expectedCount,
    dom_names_match_api: JSON.stringify(searched.names) === JSON.stringify(apiNames),
    search_name_contains_bench: searched.names.some((name) => /bench/i.test(name)),
    api_total_at_least_visible: Number(bench.body.total) >= searched.count,
    no_api_request_failures: failedApiRequests.length === 0,
    no_console_errors: significantConsole.length === 0,
  }
  const ok = Object.values(assertions).every(Boolean)

  const result = {
    ok,
    scenario: 'proof',
    base_url: args.base,
    mode: readMode(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    account: {
      email: maskEmail(email),
      user_id_prefix: String(session.id).slice(0, 8),
    },
    login_status: loginStatus,
    login_latency_ms: args.loginLatency,
    initial,
    searched,
    network: {
      url: bench.url,
      status: bench.status,
      total: bench.body.total,
      items: expectedCount,
    },
    assertions,
    console_errors: significantConsole,
    failed_api_requests: failedApiRequests,
    artifacts: ['01-before-search.png', '02-search-bench.png', 'console.log', 'network.json', 'result.json'],
  }
  if (!ok) exitCode = 1

  writeFileSync(join(outDir, 'console.log'), significantConsole.join('\n') + (significantConsole.length ? '\n' : ''))
  writeFileSync(join(outDir, 'network.json'), JSON.stringify({
    login_status: loginStatus,
    exercise_responses: exerciseResponses.map(({ url, status, body, bodyError }) => ({ url, status, body, bodyError })),
  }, null, 2))
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({
    ok,
    evidence: outDir,
    assertions,
    initial_count: initial.count,
    searched_count: searched.count,
    api_total: bench.body.total,
    target: bench.url,
  }, null, 2))
} catch (error) {
  exitCode = 1
  const failure = {
    ok: false,
    scenario: 'proof',
    base_url: args.base,
    mode: readMode(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    account: { email: maskEmail(email), user_id_prefix: null },
    error: String(error?.message || error),
    url: page ? await evaluate(page, 'location.href').catch(() => null) : null,
    body_text: page ? await evaluate(page, 'document.body.innerText.slice(0, 800)').catch(() => null) : null,
    login_status: loginStatus,
    login_latency_ms: args.loginLatency,
    console_errors: consoleErrors,
    failed_api_requests: failedApiRequests,
    artifacts: ['failure.png', 'console.log', 'network.json', 'result.json'],
  }
  if (page) await screenshot(page, 'failure.png').catch(() => null)
  writeFileSync(join(outDir, 'console.log'), consoleErrors.join('\n') + (consoleErrors.length ? '\n' : ''))
  writeFileSync(join(outDir, 'network.json'), JSON.stringify({
    login_status: loginStatus,
    exercise_responses: exerciseResponses.map(({ url, status, body, bodyError }) => ({ url, status, body, bodyError })),
  }, null, 2))
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(failure, null, 2))
  console.error(JSON.stringify({ ok: false, evidence: outDir, error: failure.error, url: failure.url }, null, 2))
} finally {
  await closeChrome(browser, child, page)
  try {
    rmSync(profileDir, { recursive: true, force: true })
  } catch {}
}

process.exit(exitCode)
}

function parseArgs(argv) {
  const parsed = { scenario: 'proof', out: null, base: 'http://localhost:5173', loginLatency: 0, headed: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--scenario') parsed.scenario = argv[++index]
    else if (arg === '--out') parsed.out = argv[++index]
    else if (arg === '--base') parsed.base = argv[++index]
    else if (arg === '--login-latency') parsed.loginLatency = Number(argv[++index]) || 0
    else if (arg === '--headed') parsed.headed = true
    else if (arg === '--help' || arg === '-h') parsed.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

function readDotEnv(path) {
  const values = {}
  if (!existsSync(path)) return values
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
  }
  return values
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) || null
}

function readMode() {
  const path = join(skillDir, '.run', 'mode')
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : 'unknown'
}

function maskEmail(value) {
  const at = value.indexOf('@')
  if (at === -1) return '***'
  return `${value.slice(0, 1)}***${value.slice(at)}`
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function warmUpLogin(base, accountEmail, accountPassword) {
  const response = await fetch(`${base}/api/v1/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: accountEmail, password: accountPassword }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Warm-up login failed with HTTP ${response.status}`)
}

async function launchChrome(profile) {
  const chromeArgs = [
    args.headed ? '' : '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=430,932',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank',
  ].filter(Boolean)
  const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore', windowsHide: true })
  let launchError = null
  chrome.on('error', (error) => {
    launchError = error
  })
  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (launchError) throw launchError
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early with code ${chrome.exitCode}`)
    if (existsSync(portFile)) {
      try {
        const [line] = readFileSync(portFile, 'utf8').split(/\r?\n/)
        const port = Number(line)
        if (port > 0) return { child: chrome, port }
      } catch {
        // Chrome can hold the file for a moment while it writes the port.
      }
    }
    await sleep(100)
  }
  chrome.kill()
  throw new Error('Timed out waiting for the Chrome DevTools port')
}

async function closeChrome(browserHandle, childHandle, pageHandle) {
  if (browserHandle) {
    await Promise.race([browserHandle.send('Browser.close').catch(() => {}), sleep(3000)])
    browserHandle.close()
  }
  if (childHandle && childHandle.exitCode === null) {
    await Promise.race([new Promise((resolvePromise) => childHandle.once('exit', resolvePromise)), sleep(5000)])
  }
  if (childHandle && childHandle.exitCode === null) {
    spawn('taskkill', ['/PID', String(childHandle.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    await sleep(1000)
  }
  if (pageHandle) pageHandle.close()
}

class Cdp {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return
      }
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result)
        return
      }
      if (message.method) {
        for (const handler of this.handlers.get(message.method) || []) {
          try {
            handler(message.params)
          } catch {}
        }
      }
    })
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('DevTools socket closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set())
    this.handlers.get(method).add(handler)
  }

  off(method, handler) {
    this.handlers.get(method)?.delete(handler)
  }

  close() {
    try {
      this.socket.close()
    } catch {}
  }
}

async function evaluate(pageHandle, expression) {
  const response = await pageHandle.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed')
  }
  return response.result?.value
}

async function waitForValue(pageHandle, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await evaluate(pageHandle, expression).catch(() => null)
    if (value) return value
    await sleep(120)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function waitUntil(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function once(pageHandle, method, timeoutMs, label) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${label}`))
    }, timeoutMs)
    const handler = (params) => {
      cleanup()
      resolvePromise(params)
    }
    const cleanup = () => {
      clearTimeout(timer)
      pageHandle.off(method, handler)
    }
    pageHandle.on(method, handler)
  })
}

async function navigate(pageHandle, url) {
  const loaded = once(pageHandle, 'Page.loadEventFired', 30000, `load ${url}`).catch(() => null)
  await pageHandle.send('Page.navigate', { url })
  await loaded
  await waitForValue(pageHandle, `document.readyState === 'complete' ? 'ready' : ''`, 20000, `ready ${url}`)
}

async function setInput(pageHandle, selector, value) {
  const expression = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`
  const changed = await evaluate(pageHandle, expression)
  if (!changed) throw new Error(`Input not found: ${selector}`)
}

async function screenshot(pageHandle, name) {
  const shot = await pageHandle.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const path = join(outDir, name)
  writeFileSync(path, Buffer.from(shot.data, 'base64'))
  return path
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
