// 宿主路由测试：假 ctx + 临时 DSH_HOME，不启动 DSH。
//   node tests/ops.test.mjs

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-stardew-ops-test-'))
process.env.DSH_HOME = home
// 不要让测试去问 GitHub
globalThis.fetch = () => Promise.reject(new Error('测试里不联网'))

const { registerOps, parseScheduleArgs, toLocalIso, formatLocal, buildSchedulePush, buildExperienceText, wakeSession } = await import('../lib/ops.js')

const settings = {
  port: 18089,
  gamePath: tmpdir(),
  notesFile: '',
  playSessionId: '',
  scheduleSessionId: '',
  mainSessionId: '',
  windowMode: 'minimized',
  nextStartAt: '',
  appendExperience: false,
  sessionDays: 0,
  sessionMinutes: 0,
  freezeTime: true,
  idleSeconds: 120,
  forageRadius: 1,
  extraInstructions: '',
  guideFile: 'guide/攻略.md',
  autoInstallMod: true,
  gatewayEnabled: true,
  autoContinue: true,
  autoContinueMax: 3,
}

let handler = null
let patched = null
const ctx = {
  get(name) {
    if (name === 'connection') return undefined
    if (name === 'sessionController') return undefined
    return undefined
  },
  logger() {},
  effect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanup()
    return () => {}
  },
  fiber: { update(patch) { patched = patch; Object.assign(settings, patch) } },
  inject(names, mount) {
    assert.deepEqual(names, ['webServer'])
    mount({
      webServer: {
        register(route) {
          assert.equal(route.kind, 'prefix')
          assert.equal(route.path, '/dsh-stardewvalley-panel')
          handler = route.handler
          return () => {}
        },
      },
      effect(fn) {
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanup()
        return () => {}
      },
    })
  },
}

registerOps(ctx, { getConfig: () => settings, log: () => {} })
assert.equal(typeof handler, 'function', '应该挂上 /dsh-stardewvalley-panel 路由')

function request({ method = 'GET', path = '/dsh-stardewvalley-panel/state', headers = {}, body = '' }) {
  const req = new EventEmitter()
  req.method = method
  req.url = path
  req.headers = { host: '127.0.0.1:4811', ...headers }
  const res = {
    status: 0,
    body: '',
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(chunk) { this.body = String(chunk ?? ''); resolveDone(this) },
  }
  let resolveDone = () => {}
  const done = new Promise((resolve) => { resolveDone = resolve })
  if (body) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body, 'utf8'))
      req.emit('end')
    })
  } else process.nextTick(() => req.emit('end'))
  Promise.resolve(handler(req, res)).catch((error) => {
    res.error = error
    resolveDone(res)
  })
  return done
}

let res = await request({})
assert.equal(res.status, 200)
const state = JSON.parse(res.body)
assert.equal(state.ok, true)
// running 是真去查 SMAPI 进程的，这台机器上开没开游戏都能跑这个测试：
// 开不了游戏的时候才等于「off」，所以只断言类型和两者的关系，不断言 false。
assert.equal(typeof state.game.running, 'boolean')
if (!state.game.running) assert.equal(state.game.status, 'off', '没跑 SMAPI 时状态应该是 off')
assert.ok(Array.isArray(state.mood.rows))
assert.ok(state.mood.notWantToPlay === null || typeof state.mood.notWantToPlay === 'number')
assert.equal(state.config.port, 18089)

res = await request({ headers: { host: 'evil.example:4811' } })
assert.equal(res.status, 403)

res = await request({ method: 'POST', path: '/dsh-stardewvalley-panel/close' })
assert.equal(res.status, 403)

res = await request({
  method: 'POST',
  path: '/dsh-stardewvalley-panel/config',
  headers: { 'x-dsh-stardewvalley-panel': '1', 'content-type': 'application/json' },
  body: JSON.stringify({ port: 18089, windowMode: 'hidden', playSessionId: 'abc12345' }),
})
assert.equal(res.status, 200)
assert.equal(JSON.parse(res.body).outcome, 'ok')
assert.equal(patched.port, 18089)
assert.equal(patched.windowMode, 'hidden')
assert.equal(patched.playSessionId, 'abc12345')
assert.equal(patched.gatewayEnabled, true, '没传的字段从当前设置合并进来')

res = await request({ method: 'POST', path: '/dsh-stardewvalley-panel/sleep', headers: { 'x-dsh-stardewvalley-panel': '1' } })
assert.equal(res.status, 200)
assert.equal(JSON.parse(res.body).outcome, 'failed', '游戏没开时强制睡觉应该拒绝')

res = await request({ method: 'POST', path: '/dsh-stardewvalley-panel/close', headers: { 'x-dsh-stardewvalley-panel': '1' } })
assert.equal(res.status, 200)
// 这条只验路由通、回话是「没关」；具体哪一句取决于机器上 SMAPI 跑没跑
// （没跑 → 「本来就没开着」；在跑但找不到行动记录 → 「读不到行动记录」）
assert.match(JSON.parse(res.body).message, /本来就没开着|读不到行动记录/)

res = await request({ path: '/dsh-stardewvalley-panel/nope' })
assert.equal(res.status, 404)

// 一次性定时：in / at / clear / 查询
const in30 = parseScheduleArgs({ in: '30m' }, new Date(2026, 10, 17, 14, 0, 0))
assert.equal(in30.kind, 'set')
assert.equal(in30.at, '2026-11-17T14:30')
assert.equal(parseScheduleArgs({ at: '2026-11-17T14:00' }).at, '2026-11-17T14:00')
assert.equal(parseScheduleArgs({ clear: true }).kind, 'clear')
assert.equal(parseScheduleArgs({}).kind, 'query')
assert.throws(() => parseScheduleArgs({ in: 'soon' }))
assert.throws(() => parseScheduleArgs({ at: '不是时间' }))
assert.equal(formatLocal('2026-11-17T14:30'), '2026-11-17 14:30')
assert.equal(toLocalIso(new Date(2026, 10, 17, 14, 30)), '2026-11-17T14:30')

patched = null
res = await request({
  method: 'POST',
  path: '/dsh-stardewvalley-panel/schedule',
  headers: { 'x-dsh-stardewvalley-panel': '1', 'content-type': 'application/json' },
  body: JSON.stringify({ in: '30m' }),
})
assert.equal(res.status, 200)
const scheduled = JSON.parse(res.body)
assert.equal(scheduled.outcome, 'ok')
assert.match(scheduled.nextStartAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

res = await request({
  method: 'POST',
  path: '/dsh-stardewvalley-panel/schedule',
  headers: { 'x-dsh-stardewvalley-panel': '1', 'content-type': 'application/json' },
  body: JSON.stringify({}),
})
assert.equal(JSON.parse(res.body).nextStartAt, scheduled.nextStartAt, '查询要读回文件里的排期')

res = await request({
  method: 'POST',
  path: '/dsh-stardewvalley-panel/schedule',
  headers: { 'x-dsh-stardewvalley-panel': '1', 'content-type': 'application/json' },
  body: JSON.stringify({ clear: true }),
})
assert.equal(JSON.parse(res.body).nextStartAt, '')

// 关游戏后推给自启会话的内容：只要数据 + 参考值，不替它定时间
const notesFile = join(home, 'notes.md')
writeFileSync(notesFile, '| 春 20 日 | 45 | 50 | x |\n| 春 21 日 | 38 | 45 | x |\n| 夏 1 日 | 30 | 40 | x |\n')
const gameDir = join(home, 'game')
const logDir = join(gameDir, 'Mods', 'BlindWhaleFarmer', 'logs')
const { mkdirSync } = await import('node:fs')
mkdirSync(logDir, { recursive: true })
const transcriptFile = join(logDir, 'transcript-test.log')
writeFileSync(transcriptFile, [
  '[第1年夏1日 06:00] [MCP] load_save({}) → 成功：正在读取存档 窗台_454456457（上次游玩 11-15），要十几秒',
  '[第1年夏2日 06:00] [MCP] sleep({}) → 成功：睡醒了，第1年夏2日 06:00',
].join('\n'))
const push = buildSchedulePush(
  { ...settings, notesFile, gamePath: gameDir },
  { stamp: { label: '第1年 夏2日', time: '06:00' }, stampText: '第1年夏2日 06:00' },
  { transcriptFile },
)
for (const needle of ['这次玩到：第1年 夏2日 06:00', '睡过觉', '心情 45/38/30', '兴奋 50/45/40', '不想玩参考值：≈', '存档：窗台_454456457', 'action="schedule"']) {
  assert.ok(push.includes(needle), '推送里应该有：' + needle)
}
// sleep 那一行的时间戳是「睡醒后的第二天」，不算玩过的一天：这份记录玩的是夏 1，一天
assert.ok(push.includes('玩了几个游戏日：1'), '玩一天就数一天：\n' + push)

// 玩两天再睡进第三天：数 2，不数 3
writeFileSync(transcriptFile, [
  '[第1年夏1日 06:00] [MCP] load_save({}) → 成功：正在读取存档 窗台_454456457（上次游玩 11-15），要十几秒',
  '[第1年夏1日 09:00] [MCP] water_crops({}) → 成功：浇了 34 株',
  '[第1年夏2日 09:00] [MCP] fish({}) → 成功：钓到 罗非鱼',
  '[第1年夏3日 06:00] [MCP] sleep({}) → 成功：睡醒了，第1年夏3日 06:00',
].join('\n'))
const push3 = buildSchedulePush({ ...settings, notesFile, gamePath: gameDir }, { stamp: null }, { transcriptFile })
assert.ok(push3.includes('玩了几个游戏日：2'), '玩两天（夏1、夏2）数 2，睡醒那天（夏3）不数：\n' + push3)

console.log('ops route OK: 状态、403、设置、睡觉拒绝、关游戏、404、schedule、推送内容')

// 关游戏时写的「星露谷经验」：要从笔记里摘她的原文，不是拿机器摘要顶替。
// 她写的标题是「## 第 1 年 夏 2 日 · …」，第 / 1 / 年 之间有空格——11-17 就是这里一个都没匹配上。
const expNotes = join(home, 'exp-notes.md')
writeFileSync(expNotes, [
  '## 第 1 年 春 20 日 · 一整天在找韭葱',
  '',
  '找了七个坐标，全是水。',
  '',
  '## 第 1 年 夏 2 日 · 下矿前没检查背包，两次白跑',
  '',
  '以后先看背包再下去。',
  '',
  '## 第 1 年 夏 3 日 · 带不带吃的，是两个矿洞',
  '',
  '- 昨天血掉到 7，今天下来还剩 56。',
  '',
  '## 第 1 年 夏 4 日 · 一把新剑，一个生日',
  '',
  '30 层开箱拿到森林剑；给格斯送了防风草，好感 +360。',
  '',
  '## 记着要做的',
  '',
  '不是游戏日，不该被摘。',
  '',
  '## 她读过后写的',
  '',
  '也不是。',
].join('\n'))

const exp = buildExperienceText({ ...settings, notesFile: expNotes }, { gameParsed: null })
assert.match(exp, /30 层开箱拿到森林剑/, '最近一天要在里面')
assert.match(exp, /带不带吃的/, '倒数第二天要在里面')
assert.match(exp, /下矿前没检查背包/, '倒数第三天要在里面')
assert.ok(!exp.includes('一整天在找韭葱'), '只摘最近三节')
assert.ok(!exp.includes('不是游戏日，不该被摘'), '辅助节不能摘进来')
assert.match(exp, /—— 这次停在哪：/, '末尾留一行坐标')

const noSections = buildExperienceText({ ...settings, notesFile: join(home, 'empty.md') }, { gameParsed: null })
assert.ok(!/##\s*第/.test(noSections), '笔记里没有游戏日小节时，不能拿节标题冒充')

console.log('经验文件 OK: 摘得到她的原文（标题带空格）、只取最近三节、跳过辅助节')

// wake：短 id 要认；对方在跑时要 steer 插进去，不能一律回绝；失败要说清是第几步。
// 11-17 她拿"读好了"试了两次：短 id 回「找不到」、全 id 回「不是空闲」——两条都卡死。
const A = 'session-aaaa1111-2222-3333-4444-555555555555'
const B = 'session-bbbb1111-2222-3333-4444-555555555555'
const C1 = 'session-cccc1111-2222-3333-4444-555555555555'
const C2 = 'session-cccc2222-2222-3333-4444-555555555555'
const delivered = []
const fakeAgent = (status) => ({
  status,
  followup(message) { delivered.push(['followup', message.content[0].text]) },
  steer(message) { delivered.push(['steer', message.content[0].text]) },
})
const wakeCtx = (agents) => ({
  get(name) {
    if (name !== 'sessionController') return undefined
    return {
      async resolveAgent(id) {
        if (agents[id]) return { agent: agents[id] }
        return { error: { code: 'session/not-found' } }
      },
      async list() { return { items: [A, B, C1, C2].map((sessionId) => ({ sessionId })) } },
    }
  },
})

// 短 id（8 位，不带 session- 前缀）要按前缀对到唯一一个会话
let said = await wakeSession(wakeCtx({ [A]: fakeAgent('idle') }), 'aaaa1111', '读好了', () => {})
assert.match(said, /^叫醒了 session-aaaa1111/, '短 id 该能叫：' + said)
assert.deepEqual(delivered.pop(), ['followup', '读好了'], '空闲会话走 followup')

// 在跑：该 steer 插进当前这一轮，而且结果仍以「叫醒了」开头（close 靠这个判断推送成功）
said = await wakeSession(wakeCtx({ [A]: fakeAgent('running') }), A, '收工了', () => {})
assert.match(said, /^叫醒了 .*插进当前这一轮/, '在跑该 steer 而不是回绝：' + said)
assert.deepEqual(delivered.pop(), ['steer', '收工了'])

// 前缀对上多个：要说不清，不瞎猜
said = await wakeSession(wakeCtx({}), 'cccc', 'x', () => {})
assert.match(said, /叫不动（第 1 步，找会话）：cccc 能对上 2 个会话/)

// 完全找不到：要说清是哪一步
said = await wakeSession(wakeCtx({}), 'zzzz9999', 'x', () => {})
assert.match(said, /叫不动（第 1 步，找会话）/)

// 在跑又没有 steer：说清是第 3 步、什么状态
const noSteer = { status: 'running', followup() { delivered.push(['followup', '不该走这条']) } }
said = await wakeSession(wakeCtx({ [B]: noSteer }), B, 'x', () => {})
assert.match(said, /叫不动（第 3 步，投递）：.*status=running/)
assert.equal(delivered.length, 0, '不该悄悄退回 followup')

console.log('wake OK: 短 id 认、在跑用 steer、歧义不瞎猜、失败说到第几步')

rmSync(home, { recursive: true, force: true })
