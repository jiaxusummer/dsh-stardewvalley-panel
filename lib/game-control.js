// 跟游戏里的模组说话（MCP JSON-RPC），以及让 AI 自己把游戏开起来、读存档。
// 游戏没开时模组的 MCP 服务器也不在，所以“开游戏”只能由 DSH 插件这边做：找到游戏目录，启动 SMAPI，
// 等模组的服务器起来，在标题画面调模组的 load_save 读档，等进了存档再返回。

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findGameDir, hasSmapi } from './mod-install.js'

/** 发一条 JSON-RPC 给游戏里的 MCP 服务器，返回 result。 */
export async function mcpCall(port, method, params, signal) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal,
  })
  // 工具调用游戏用 SSE 回复（动作期间每 15 秒一行心跳，结束时一条 message 事件），其余是普通 JSON
  const body = (res.headers.get('content-type') ?? '').includes('text/event-stream')
    ? parseSseResult(await res.text())
    : await res.json()
  if (body.error) throw new Error(body.error.message ?? `MCP 错误 ${body.error.code}`)
  return body.result
}

/** 从 SSE 文本里取出 JSON-RPC 回复（忽略 ": keep-alive" 这类注释行）。 */
export function parseSseResult(text) {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
    if (!data) continue
    const msg = JSON.parse(data)
    if ('result' in msg || 'error' in msg) return msg
  }
  throw new Error('游戏的回复里没有结果（连接可能中途断了）')
}

/** 调一个游戏工具，返回文字结果。 */
export async function callGameTool(port, name, args, signal) {
  const result = await mcpCall(port, 'tools/call', { name, arguments: args ?? {} }, signal)
  return (result?.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join('\n')
}

/**
 * 游戏现在的状态：off（连不上模组）、title（开着、还没进存档）、world（在存档里）。
 * 先用 /settings（作者插件也一直这么轮询，不写 transcript、不刷新 MCP 活动），
 * 再用 get_state 判断进没进存档——get_state 属于 InfoTools，也不写 transcript。
 * 不用 toggle_ai 探状态：它会被写进行动记录，把「最近的动作」带歪。
 */
export async function gameStatus(port, call = callGameTool) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/settings`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return 'off'
    await res.json().catch(() => null)
  } catch {
    return 'off'
  }
  try {
    const text = await call(port, 'get_state', {}, AbortSignal.timeout(8000))
    return /时间：/.test(text) ? 'world' : 'title'
  } catch {
    return 'off'
  }
}

/** SMAPI 的进程是不是已经在跑（刚启动、模组的服务器还没起来时也算）。 */
export function smapiRunning() {
  try {
    if (process.platform === 'win32')
      return execFileSync('tasklist', ['/FI', 'IMAGENAME eq StardewModdingAPI.exe', '/NH'], { encoding: 'utf8', windowsHide: true }).includes('StardewModdingAPI')
    execFileSync('pgrep', ['-f', 'StardewModdingAPI'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}


/**
 * 启动 SMAPI。windowMode：normal / minimized / hidden。
 * 返回错误说明，成功返回 null。
 */
/**
 * 设置星露谷两个窗口的显示状态。
 * target：game = 游戏窗口、smapi = SMAPI 控制台；mode：normal / minimized / hidden。
 * 两个窗口都属于 StardewModdingAPI 这一个进程，靠窗口类区分（SDL_app / ConsoleWindowClass），
 * 具体枚举和 ShowWindow 在 lib/window-set.ps1 里。
 */
export function setWindowState(target, mode) {
  if (process.platform !== 'win32') return null
  if (mode !== 'normal' && mode !== 'minimized' && mode !== 'hidden' && mode !== 'maximized') return null
  const ps1 = join(dirname(fileURLToPath(import.meta.url)), 'window-set.ps1')
  if (!existsSync(ps1)) return '找不到 window-set.ps1'
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Target', target, '-Mode', mode], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
    const text = String(out ?? '').trim()
    if (text.startsWith('NO-PROCESS') || text.startsWith('NO-WINDOW')) return text
    return null
  } catch (error) {
    return '设置窗口状态失败：' + (error?.message ?? error)
  }
}

export function startSmapi(gamePath, windowMode = 'normal') {
  const dir = findGameDir(gamePath)
  if (!dir || !existsSync(dir))
    return '找不到星露谷的安装目录：请在 DSH 插件页的设置里填“星露谷目录”（里面有 StardewModdingAPI.exe 的那个文件夹）'
  if (!hasSmapi(dir))
    return `${dir} 里没有 SMAPI：先装 SMAPI（https://smapi.io）`
  const exe = join(dir, process.platform === 'win32' ? 'StardewModdingAPI.exe' : 'StardewModdingAPI')
  try {
    if (process.platform !== 'win32') {
      const child = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' })
      child.on('error', () => {})
      child.unref()
      return null
    }
    // 只能用 `cmd start` 起：实测 VBS 的 shell.Run、node 的 windowsHide（CREATE_NO_WINDOW）
    // 在这台机器上都起不来 SMAPI——进程都没有、日志也不新增。所以控制台窗口一定会被创建，
    // 能做的只是「尽早藏掉」：launchGame 里从 0.4 秒开始一次比一次密地试（见那边的 schedule）。
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" /D "${dir}" "${exe}"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return null
  } catch (error) {
    return `启动 SMAPI 失败：${error?.message ?? error}`
  }
}

const pause = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener?.('abort', () => {
    clearTimeout(timer)
    reject(signal.reason ?? new Error('已取消'))
  }, { once: true })
})

/**
 * 把游戏开起来并读存档，返回给 AI 看的文字（“成功：”或“失败：”开头）。
 * - 游戏没开：启动 SMAPI，等模组的服务器起来（最多 startTimeoutMs）。SMAPI 已经在启动了就不再开第二个。
 * - 在标题画面：读档（save 是存档名的一部分；不传读最近玩的那个），等进了存档（最多 loadTimeoutMs）。
 * - 已经在存档里：什么都不做。
 * deps 给测试替换：status、start、running、loadSave、sleep。
 */
export async function launchGame({ port, gamePath, save, signal, windowMode = 'normal', gameWindowMode = 'normal', startTimeoutMs = 180_000, loadTimeoutMs = 120_000, deps = {} } = {}) {
  const status = deps.status ?? (() => gameStatus(port))
  const start = deps.start ?? (() => startSmapi(gamePath, windowMode))
  const running = deps.running ?? smapiRunning
  const loadSave = deps.loadSave ?? ((name) => callGameTool(port, 'load_save', name ? { save: name } : {}, AbortSignal.timeout(15000)))
  const sleep = deps.sleep ?? ((ms) => pause(ms, signal))
  const notes = []
  // 窗口设置：启动那一刻试一次，进游戏之后再来一次（SMAPI 的终端窗口可能要等游戏起来才建好）
  const setWin = deps.setWindow ?? setWindowState
  const applyWindows = () => {
    try {
      if (windowMode !== 'normal') setWin('smapi', windowMode)
      if (gameWindowMode !== 'normal') setWin('game', gameWindowMode)
    } catch {}
  }

  let state = await status()
  if (state === 'world')
    return '成功：游戏已经开着，并且已经在存档里了，直接玩就行（要换存档得先在游戏里回到标题画面）'

  if (state === 'off') {
    if (running()) {
      notes.push('游戏已经在启动了，没有再开一个')
    } else {
      const error = start()
      if (error) return '失败：' + error
      notes.push('启动了 SMAPI')
      if (windowMode !== 'normal' || gameWindowMode !== 'normal') {
        // SMAPI 的控制台窗口一启动就建出来了（实测大改 0.5 秒内就可见），所以第一次不能等 4 秒——
        // 那等于让它明晃晃挂 4 秒。按绝对时间表从 0.4 秒开始，越往后越疏：黑窗口通常只露半秒。
        const schedule = [0.4, 0.9, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 10, 14, 20, 27]
        const started = Date.now()
        let smapiDone = windowMode === 'normal'
        let gameDone = gameWindowMode === 'normal'
        for (const at of schedule) {
          const waitMs = at * 1000 - (Date.now() - started)
          if (waitMs > 0) await sleep(waitMs)
          if (!smapiDone) {
            const r = setWin('smapi', windowMode)
            if (r === null || r === undefined) smapiDone = true
          }
          if (!gameDone) {
            const r = setWin('game', gameWindowMode)
            if (r === null || r === undefined) gameDone = true
          }
          if (smapiDone && gameDone) break
        }
      }
    }
    const deadline = Date.now() + startTimeoutMs
    while (state === 'off' && Date.now() < deadline) {
      await sleep(3000)
      state = await status()
    }
    if (state === 'off')
      return `失败：${notes.join('，')}，但 ${Math.round(startTimeoutMs / 60000)} 分钟还没连上模组。可能 SMAPI 窗口里在等你确认更新提示或者报了错，`
        + '也可能没装“大肥鱼种白饭”模组。请看一下游戏和 SMAPI 的窗口'
    applyWindows()
    if (state === 'world') return `成功：${notes.join('，')}，游戏已经在存档里了`
  }

  // 在标题画面：读档。刚连上时标题画面可能还没出来（“不在标题画面”），等一会儿再试
  const deadline = Date.now() + loadTimeoutMs
  let loaded = null
  while (Date.now() < deadline) {
    const text = await loadSave(save).catch((error) => '失败：' + (error?.message ?? error))
    if (text.startsWith('成功')) {
      loaded = text
      break
    }
    if (!text.includes('不在标题画面')) return '失败：' + text.replace(/^失败：/, '') + (notes.length ? `（${notes.join('，')}）` : '')
    await sleep(3000)
  }
  if (!loaded) return `失败：${notes.length ? notes.join('，') + '，' : ''}游戏一直没到标题画面，读不了档。请看一下游戏窗口`
  const what = loaded.match(/正在读取存档 ([^（，]+)/)?.[1] ?? save ?? '最近玩的存档'
  while (Date.now() < deadline) {
    await sleep(3000)
    if (await status() === 'world') {
      applyWindows()
      return '成功：' + (notes.length ? notes.join('，') + '，' : '') + '读取了存档 ' + what + '，已经进入游戏。先 get_state 看看现在的情况'
    }
  }
  return `失败：开始读取存档 ${what} 了，但 ${Math.round(loadTimeoutMs / 1000)} 秒还没进游戏。过一会儿再 get_state 看看`
}
