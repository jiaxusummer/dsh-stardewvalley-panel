// 渲染冒烟：用最小 React 桩跑 PanelPage，分别渲染三个 tab，确认不会抛错、关键文案在。
// 不是视觉验证（没有 DOM），只防“一打开就白屏 / 切 tab 报错”这类运行时错误。
//   node tests/client-render.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const baseConfig = {
  playSessionId: 'session-6a9cc6e3-cc15-471d-ac67-70760999e62f',
  scheduleSessionId: 'session-6a9cc6e3-cc15-471d-ac67-70760999e62f',
  mainSessionId: '',
  windowMode: 'minimized',
  nextStartAt: '2026-11-17T14:00',
  appendExperience: true,
  gamePath: '',
  notesFile: '',
  port: 18080,
  sessionDays: 0,
  sessionMinutes: 0,
  idleSeconds: 120,
  forageRadius: 1,
  guideFile: 'guide/攻略.md',
  extraInstructions: '',
  autoInstallMod: true,
  gatewayEnabled: true,
  autoContinue: true,
}

const gameState = {
  stampText: '第1年夏2日 06:00',
  weather: '晴',
  money: 2072,
  energy: 270,
  energyMax: 270,
  location: 'FarmHouse',
  locationLabel: '农舍',
  freeSlots: 12,
  slotTotal: 24,
  menu: '无（可以自由行动）',
}

function makeData({ status = 'world' } = {}) {
  return {
    ok: true,
    version: '0.1.0',
    updatedAt: new Date().toISOString(),
    config: { ...baseConfig },
    game: { running: status !== 'off', status, port: 18080, modInstalled: '1.1.13', update: { installed: '1.1.13', latest: '1.1.13', available: false } },
    state: status === 'world' ? gameState : null,
    live: {
      latest: { tool: 'sleep', label: '睡觉', result: '睡醒了，第1年夏2日 06:00', stampText: '第1年夏2日 06:00', ageSeconds: 120 },
      entries: [
        { tool: 'water_crops', label: '浇水', ok: true, result: '浇了 34 株', stamp: { time: '05:50' } },
        { tool: 'sleep', label: '睡觉', ok: true, result: '睡醒了', stamp: { time: '06:00' } },
      ],
      file: 'E:\\x\\logs\\transcript-1.log',
      ageText: '2 分钟前',
      locationLabel: '农舍',
    },
    mood: {
      rows: [{ label: '春 1 日', mood: 65, excite: 70 }, { label: '夏 1 日', mood: 30, excite: 50 }],
      latest: { label: '夏 1 日', mood: 30, excite: 50 },
      notWantToPlay: 56,
      days: 2,
      file: 'G:\\notes\\星露谷.md',
      exists: true,
    },
    sessions: [{ id: 'session-6a9cc6e3-cc15-471d-ac67-70760999e62f', title: '兮兮玩星露谷', running: false }],
    schedule: { nextStartAt: '2026-11-17T14:00', last: { ok: true, skipped: false, message: '上次定时成功' }, push: { ok: false, skipped: true, message: '这次没配自启会话，下次时间没安排' } },
    hints: { liveSource: 'get_state', liveNote: '状态来自游戏里的 get_state。' },
  }
}

function renderWith(data, { tab = 'play', dirty = false } = {}) {
  let definition = null
  const window = { __ModuleLoader__: { load(value) { definition = value } } }
  const queue = [data, null, '', null, { ...baseConfig }, dirty, tab, '']
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useState: () => [queue.length ? queue.shift() : undefined, () => {}],
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
  vm.runInContext(source, context, { filename: 'client.js' })
  const exports_ = definition.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  let component = null
  exports_.apply({
    slots: {
      inject(name, factory) { factory(); return () => {} },
      register(options, value) { component = value; return () => {} },
    },
  })
  assert.equal(typeof component, 'function')
  const tree = component({})
  assert.ok(tree && tree.type)

  const texts = []
  const walk = (node, depth = 0) => {
    if (node === null || node === undefined || depth > 40) return
    if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
    if (Array.isArray(node)) { node.forEach((item) => walk(item, depth)); return }
    if (typeof node.type === 'function') {
      walk(node.type({ ...(node.props || {}), children: node.children }), depth + 1)
      return
    }
    if (node.type === 'Fragment' || typeof node.type === 'string') (node.children || []).forEach((child) => walk(child, depth))
  }
  walk(tree)
  return texts.join('|')
}

const world = renderWith(makeData({ status: 'world' }), { tab: 'play' })
for (const needle of ['星露谷管家', '游玩管理', '设置', '说明', '当前状态', '上次在干什么', '心情曲线', '操作', '不想玩参考值', '2,072', '270/270', '背包 12 格']) {
  assert.ok(world.includes(needle), '玩页应该有：' + needle)
}

const settings = renderWith(makeData(), { tab: 'settings', dirty: true })
for (const needle of ['会话', '启动与定时', '游戏与模组', '玩游戏的会话', '自启会话', '主会话', '下次开玩', '保存', '清除', '有改动，还没保存', '保存设置', '撤销']) {
  assert.ok(settings.includes(needle), '设置页应该有：' + needle)
}

const about = renderWith(makeData(), { tab: 'about' })
for (const needle of ['说明', '插件版本', '0.1.0', 'Darian', 'MIT']) {
  assert.ok(about.includes(needle), '说明页应该有：' + needle)
}

const off = renderWith(makeData({ status: 'off' }), { tab: 'play' })
assert.ok(off.includes('游戏没开'))

// 心情曲线只画最近 30 天
const many = makeData()
many.mood.rows = Array.from({ length: 35 }, (_, index) => ({ label: '第' + (index + 1) + '天', mood: 50, excite: 60 }))
many.mood.latest = many.mood.rows[34]
const longChart = renderWith(many, { tab: 'play' })
assert.ok(longChart.includes('最近 30 天（共记了 35 天）'), '超过 30 天时图例要说明只画最近 30 天')
assert.ok(longChart.includes('从 第6天'), '应该从第 6 天开始画（35 天里的后 30 天）')
assert.ok(!longChart.includes('从 第5天'), '第 5 天应该被截掉')

console.log('client render OK: 玩 / 设置 / 说明 三个 tab 都能渲染，心情曲线只画最近 30 天')
