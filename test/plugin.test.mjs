import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const HOST = new URL('../index.js', import.meta.url)
const CLIENT = new URL('../client.js', import.meta.url)

/** Build one fake response object the handler can write to. */
function response() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

/** Mount the Host half against a fake web server and return the registered route. */
async function mountHost() {
  const { apply } = await import(HOST)
  const routes = []
  const ctx = {
    logger: { info() {} },
    inject(_dependencies, callback) {
      callback({
        webServer: {
          getOrigin: () => 'http://127.0.0.1:4321',
          register(route) {
            routes.push(route)
            return () => {}
          },
        },
        effect(register) {
          return register()
        },
      })
    },
  }
  apply(ctx)
  assert.equal(routes.length, 1)
  return routes[0]
}

/** Run one handler call with `setTimeout` disabled so no process is started. */
async function call(route, request) {
  const res = response()
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = () => 0
  try {
    await route.handler(request, res)
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
  return { res, body: res.body === undefined ? undefined : JSON.parse(res.body) }
}

test('route uses an exact, private path', async () => {
  const route = await mountHost()
  assert.equal(route.kind, 'exact')
  assert.match(route.path, /^\/_dsh_restart$/)
})

test('rejects methods other than POST', async () => {
  const route = await mountHost()
  const { res, body } = await call(route, { method: 'GET', headers: {} })
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')
  assert.match(body.error, /POST/)
})

test('requires the restart request header', async () => {
  const route = await mountHost()
  const { res } = await call(route, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })
  assert.equal(res.statusCode, 403)
})

test('rejects a cross-origin request', async () => {
  const route = await mountHost()
  const { res } = await call(route, {
    method: 'POST',
    headers: { 'x-dsh-restart': '1', origin: 'https://evil.example' },
  })
  assert.equal(res.statusCode, 403)
})

test('reports desktop-only when Electron is absent', async () => {
  const route = await mountHost()
  const { res, body } = await call(route, {
    method: 'POST',
    headers: { 'x-dsh-restart': '1', 'sec-fetch-site': 'same-origin' },
  })
  assert.equal(res.statusCode, 501)
  assert.match(body.error, /desktop/)
})

test('accepts a same-origin POST in the desktop app and answers once', async () => {
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')
  Object.defineProperty(process, 'versions', {
    configurable: true,
    value: { ...versions.value, electron: '44.7.0' },
  })
  try {
    const route = await mountHost()
    const request = {
      method: 'POST',
      headers: { 'x-dsh-restart': '1', 'sec-fetch-site': 'same-origin' },
    }
    const first = await call(route, request)
    assert.equal(first.res.statusCode, 202)
    assert.equal(first.body.ok, true)
    assert.equal(first.res.headers['cache-control'], 'no-store')
    const second = await call(route, request)
    assert.equal(second.res.statusCode, 202)
  } finally {
    Object.defineProperty(process, 'versions', versions)
  }
})

test('Client module registers a localized sidebar footer action', async () => {
  const source = await readFile(CLIENT, 'utf8')
  let definition
  const sandbox = {
    window: { __ModuleLoader__: { load(value) { definition = value } } },
  }
  // The module only touches `window.__ModuleLoader__` at load time.
  new Function('window', source)(sandbox.window)
  assert.equal(definition.id, '@qhy2333/dsh-restart')

  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
  }
  const plugin = definition.factory((id) => {
    if (id === 'react') return React
    if (id === 'react-dom') return { createPortal: (node) => node }
    throw new Error(`unexpected module ${id}`)
  })

  const injected = []
  const registered = []
  const locales = []
  plugin.apply({
    effect(register) {
      return register()
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries })
        return () => {}
      },
    },
    slots: {
      inject(key, callback) {
        injected.push(key)
        callback()
        return () => {}
      },
      register(options, component) {
        registered.push({ options, component })
        return () => {}
      },
    },
  })

  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  assert.deepEqual(injected, ['sidebar.footer.action'])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.id, 'dsh-restart')
  assert.equal(registered[0].options.locale, 'dsh-restart')
  assert.equal(locales[0].namespace, 'dsh-restart')
  assert.ok(locales[0].dictionaries.zh.button.length > 0)
  assert.ok(locales[0].dictionaries.en.button.length > 0)

  const tree = registered[0].component({ wide: true, t: (key) => key })
  const elements = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) return node.forEach(walk)
    elements.push(node)
    node.children?.forEach(walk)
  }
  walk(tree)
  const button = elements.find((element) => element.type === 'button')
  assert.equal(button.props['aria-label'], 'button')
  assert.equal(button.props['aria-haspopup'], 'dialog')
})
