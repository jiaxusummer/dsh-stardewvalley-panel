// 浏览器模块冒烟：模块 id、settings.section 注册、UTF-8/无 BOM、面板组件在。
//   node tests/client.test.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const bytes = readFileSync(join(here, '..', 'lib', 'client.js'))
assert.equal(bytes[0], 0x2f, 'client.js 不应带 BOM（应以 // 开头）')
const decoder = new TextDecoder('utf-8', { fatal: true })
let text = ''
assert.doesNotThrow(() => { text = decoder.decode(bytes) }, 'client.js 必须是合法 UTF-8')
assert.ok(!text.includes('\uFFFD'), 'client.js 里不应有替换字符')
assert.ok(text.includes('function PanelPage'), '面板组件不能丢：PanelPage')
assert.ok(text.includes('settings.section'), '必须注册到 settings.section')
// 卡片都包在 tabpanel 里；这层没有 gap 的话，.ops 的 gap 进不去（2026-11-17 踩过）
assert.match(text, /\.ops-tabpanel\{[^}]*gap:10px/, 'tabpanel 这一层必须自己带 10px 间距')
assert.match(text, /role: "tabpanel", className: "ops-tabpanel"/, 'tabpanel 容器要挂上类名')

let definition = null
const window = { __ModuleLoader__: { load(value) { definition = value } } }
const React = {
  createElement: () => null,
  Fragment: 'Fragment',
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
}
const context = vm.createContext({
  window,
  console,
  fetch: () => Promise.reject(new Error('no network')),
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
})
vm.runInContext(text, context, { filename: 'client.js' })

assert.ok(definition, '应该调用 window.__ModuleLoader__.load')
assert.equal(definition.id, 'dsh-stardewvalley-panel')
const exports_ = definition.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
assert.equal(typeof exports_.apply, 'function')
assert.deepEqual(Array.from(exports_.inject), ['slots'])

const registered = []
exports_.apply({
  slots: {
    inject(name, factory) {
      assert.equal(name, 'settings.section')
      factory()
      return () => {}
    },
    register(options, component) {
      registered.push({ options, component })
      return () => {}
    },
  },
})
assert.equal(registered.length, 1)
assert.equal(registered[0].options.name, 'settings.section')
assert.equal(registered[0].options.id, 'dsh-stardewvalley-panel')
assert.equal(registered[0].options.label(), '星露谷管家')
assert.equal(typeof registered[0].component, 'function')

console.log('client OK:', registered[0].options.id, '· 设置 → 星露谷管家')
