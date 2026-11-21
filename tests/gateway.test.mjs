// 入口工具（模型调的那个 stardew）的验收：get_state 要附【待记】、sleep 要拦住没记的那天。
// 用假 ctx + 假 MCP 服务器跑，不启动 DSH、不开游戏。
//   node tests/gateway.test.mjs

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-stardew-gateway-test-'))
process.env.DSH_HOME = home

const { registerGateway } = await import('../lib/index.js')

// 游戏那一侧：一条 get_state 的文字，按 Observer.cs 的格式写
const GAME_STATE = `## 基本状态
时间：第1年夏8日 06:00（周二），天气：晴，明天天气：晴
金钱：4388g  体力：270/270  生命：105/105  今日运气：-0.02
技能等级：耕种2 采矿3 采集1 钓鱼7 战斗2

## 当前界面
无（可以自由行动）

## 位置
地点：FarmHouse（农舍），室内，地图大小 12x9
你站在 (9,9)，面朝下
`

let brokenState = false

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    let msg = {}
    try { msg = JSON.parse(body || '{}') } catch {}
    const send = (result) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }))
    }
    if (msg.method === 'tools/call') {
      const name = msg.params?.name
      const text = name !== 'get_state' ? '成功：假装做完了' : brokenState ? '（读不到状态）' : GAME_STATE
      return send({ content: [{ type: 'text', text }] })
    }
    send({})
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

// 她只记到夏 3 日，游戏已经夏 8 日
const notesFile = join(home, '星露谷笔记.md')
writeFileSync(notesFile, [
  '## 心情（一天一行）',
  '',
  '| 春 20 日 | 38 | 45 | x |',
  '| 夏 1 日 | 30 | 50 | x |',
  '| 夏 3 日 | 70 | 65 | x |',
].join('\n'))

const config = { port, notesFile, playSessionId: 'session-6a9cc6e3-0000-0000-0000-000000000000', toolTimeoutMinutes: 1 }
const exec = { agent: { id: 'session-6a9cc6e3-1111-1111-1111-111111111111' } }

let tool = null
let slept = false
const ctx = {
  get(name) {
    if (name === 'tools') return { register(definition) { tool = definition; return () => {} } }
    return undefined
  },
  effect(fn) { const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {} },
}
const ops = {
  schedule: async () => ({ message: '（测试里不排期）' }),
  close: async () => ({ message: '（测试里不关游戏）' }),
  sleep: async () => { slept = true; return { message: '睡醒了' } },
}

registerGateway(ctx, config, () => {}, ops)
assert.ok(tool, '应该注册上 stardew 入口工具')
assert.equal(tool.name, 'stardew')

// 一、get_state 末尾要附【待记】和【心情】
const stateText = await tool.execute({ action: 'get_state' }, exec)
assert.match(stateText, /时间：第1年夏8日 06:00/, '游戏原文要在')
assert.match(stateText, /【待记】表还停在 夏 3 日，游戏里已是 夏 8 日（差 5 天）/)
assert.match(stateText, /【心情】最近三天 38 \/ 30 \/ 70 · 兴奋 45 \/ 50 \/ 65/)
assert.match(stateText, /【参考】不想玩 ≈ \d+%/)

// 二、sleep 要先被拦住，不能真的睡
const blocked = await tool.execute({ action: 'sleep' }, exec)
assert.equal(slept, false, '没记数就不该执行 sleep')
assert.match(blocked, /^今天（夏 8 日）的心情那行还没记/)
assert.match(blocked, /游戏里现在：第1年夏8日 06:00；表里最后一行是 夏 3 日/)
assert.match(blocked, /记完再 action="sleep" 一次/)

// 三、她补了今天那行，就放行
writeFileSync(notesFile, [
  '| 春 20 日 | 38 | 45 | x |',
  '| 夏 1 日 | 30 | 50 | x |',
  '| 夏 3 日 | 70 | 65 | x |',
  '| 夏 8 日 | 72 | 62 | 连着三天下矿，早上不想下去 |',
].join('\n'))
const passed = await tool.execute({ action: 'sleep' }, exec)
assert.equal(slept, true, '记了就该放行')
assert.match(passed, /睡醒了/)

// 四、不是玩游戏的会话，游戏动作要挡回去
const refused = await tool.execute({ action: 'water_crops' }, { agent: { id: 'session-1ee2e043-2222-2222-2222-222222222222' } })
assert.match(refused, /不是「玩游戏的会话」/)

// 五、读不到游戏日期时不拦（别拿没数据当没记），睡完补一句兜底
brokenState = true
slept = false
const blind = await tool.execute({ action: 'sleep' }, exec)
assert.equal(slept, true, '拿不到日期就该放行')
assert.match(blind, /睡醒了/)
assert.match(blind, /刚才没读到游戏里的日期，没法替你核账/)
brokenState = false

server.close()
rmSync(home, { recursive: true, force: true })
console.log('入口工具 OK: get_state 附【待记】+心情、sleep 拦没记的那天、记完放行、别处的会话被挡回、读不到日期只兜底不拦')
