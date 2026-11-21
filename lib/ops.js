// 星露谷管家的宿主半侧：面板数据、三个动作（开始 / 停止 / 关游戏）、强制回家睡觉、
// 查更新下载、定时开玩、攻略记忆、笔记回主会话，以及设置读写。
//
// 数据来源：
//   - 游戏里（在存档中）时：走 MCP 调 get_state（模组 Observer.Build 的文字），解析出时间/天气/钱/体力/背包/地点；
//     只在“行动记录变了”或者缓存超过 30 秒时才重新问，避免面板把游戏时钟一直冻着。
//   - 游戏没开：退回读 logs\transcript-*.log 的最后状态 + 笔记里的心情表。
//
// 和其他插件的界线：不依赖 dsh-stardew-blind-whale-farmer；作者那半的代码保留了（这是 fork），
// 但面板和这些动作是独立的。

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  latestMood,
  moodDayGap,
  labelOfTool,
  notWantToPlayTrend,
  parseGameState,
  parseMoodTable,
  parseTranscript,
  relativeAge,
  summarizeLive,
} from './parse.js'
import { callGameTool, gameStatus, launchGame, smapiRunning } from './game-control.js'
import { compareVersions, findGameDir, manifestVersion, BUNDLED_MOD_DIR } from './mod-install.js'

const API_PREFIX = '/dsh-stardewvalley-panel'
const REQUEST_HEADER = 'x-dsh-stardewvalley-panel'
const MOD_FOLDER = 'BlindWhaleFarmer'
const GITHUB_REPO = 'Darianliu23/dsh-stardew-blind-whale-farmer'
const MIRROR = 'https://ghfast.top/'

const win = () => process.platform === 'win32'

/** 插件自己的版本号（面板页头显示）。 */
const PKG_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version ?? ''
  } catch {
    return ''
  }
})()

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function cacheDir() {
  return join(dshHome(), 'stardewvalley-panel-cache')
}

// ───────────────────────── 定时（一次性 nextStartAt） ─────────────────────────

const pad2 = (n) => String(n).padStart(2, '0')

/** Date → 本地时区的 `YYYY-MM-DDTHH:MM`（存配置、给面板用）。 */
export function toLocalIso(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ISO → 面板上给人看的样子。 */
export function formatLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return toLocalIso(d).replace('T', ' ')
}

/**
 * 解析 schedule 动作的参数：{at} / {in} / {clear} / 空（查询）。
 * 返回 { kind: 'set'|'clear'|'query', at?, date? }；参数不对就抛错。
 */
export function parseScheduleArgs(args, now = new Date()) {
  const value = args && typeof args === 'object' ? args : {}
  if (value.clear === true) return { kind: 'clear' }
  if (typeof value.at === 'string' && value.at.trim()) {
    const date = new Date(value.at.trim())
    if (Number.isNaN(date.getTime())) throw new Error('at 要写成 2026-11-17T14:00 这样的本地时间')
    return { kind: 'set', date, at: toLocalIso(date) }
  }
  if (typeof value.in === 'string' && value.in.trim()) {
    const m = /^(\d+)\s*(h|m)$/i.exec(value.in.trim())
    if (!m) throw new Error('in 要写成 4h 或 30m 这样')
    const minutes = m[2].toLowerCase() === 'h' ? Number(m[1]) * 60 : Number(m[1])
    if (!minutes) throw new Error('in 不能是 0')
    const date = new Date(now.getTime() + minutes * 60000)
    return { kind: 'set', date, at: toLocalIso(date) }
  }
  return { kind: 'query' }
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function fail(res, status, message) {
  json(res, status, { ok: false, error: message })
}

function isLocalRequest(req) {
  const host = String(req.headers.host || '').toLowerCase()
  const name = host.replace(/:\d+$/, '')
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(name)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('请求体太大'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    return value
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

// ───────────────────────── 本机读文件 ─────────────────────────

function readText(file) {
  try {
    return readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return null
  }
}

function readTail(file, maxBytes = 128 * 1024) {
  const text = readText(file)
  if (!text) return null
  if (text.length <= maxBytes) return text
  const tail = text.slice(-maxBytes)
  const cut = tail.indexOf('\n')
  return cut >= 0 ? tail.slice(cut + 1) : tail
}

function latestTranscript(gameDir) {
  try {
    const dir = join(gameDir, 'Mods', MOD_FOLDER, 'logs')
    const files = readdirSync(dir).filter((f) => /^transcript-.*\.log$/.test(f)).sort()
    if (!files.length) return null
    const file = join(dir, files[files.length - 1])
    return { file, mtimeMs: statSync(file).mtimeMs }
  } catch {
    return null
  }
}

/** 行动记录最后一行；关游戏的存档检查用它。 */
export function lastTranscriptLine(gameDir) {
  try {
    const info = latestTranscript(gameDir)
    if (!info) return null
    const text = readText(info.file)
    if (!text) return null
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    return lines.length ? lines[lines.length - 1] : null
  } catch {
    return null
  }
}

function notesPath(settings) {
  if (settings.notesFile && String(settings.notesFile).trim()) return String(settings.notesFile).trim()
  return join(dshHome(), 'worlds', 'default', 'room', '笔记', '星露谷笔记.md')
}

function experiencePath(settings) {
  const notes = notesPath(settings)
  return join(dirname(notes), '星露谷经验.md')
}

export function readMood(settings) {
  const file = notesPath(settings)
  const { rows, lastUpdated } = parseMoodTable(readText(file) ?? '')
  const latest = latestMood(rows)
  return {
    rows,
    latest,
    lastUpdated,
    days: rows.filter((r) => r.mood !== null && r.excite !== null).length,
    notWantToPlay: notWantToPlayTrend(rows),
    file,
    exists: Boolean(readText(file)),
  }
}

/** 从最近一份行动记录里数这次玩过几个游戏日、读档的存档名、最后一个游戏日。 */
function transcriptFacts(file) {
  const text = file ? readTail(file) : ''
  if (!text) return { days: 0, saveName: '', lastStamp: '' }
  const parsed = parseTranscript(text, { limit: 4000 })
  const days = new Set()
  let lastStamp = ''
  for (const entry of parsed.entries) {
    if (entry.stamp) {
      lastStamp = entry.stampText || `${entry.stamp.label} ${entry.stamp.time}`
      // sleep 那一行的时间戳是「睡醒后的第二天」，不算玩过的一天；
      // 不排掉的话，玩一天会被数成两天天（11-17 就是这么数的）
      if (entry.tool !== 'sleep') days.add(`${entry.stamp.year}-${entry.stamp.season}-${entry.stamp.day}`)
    }
  }
  const loaded = /正在读取存档\s+([^\s（(]+)/.exec(text)
  return { days: days.size, saveName: loaded ? loaded[1] : '', lastStamp }
}

/**
 * 关游戏后推给「自启会话」的那条消息：只给数据和一个参考值，不替它决定时间。
 * 返回给人/模型看的纯文本。
 */
export function buildSchedulePush(settings, game, cache = {}) {
  const facts = transcriptFacts(cache.transcriptFile)
  const mood = readMood(settings)
  const points = (mood.rows || []).filter((row) => row.mood !== null && row.excite !== null).slice(-3)
  const moodText = points.length ? points.map((row) => row.mood).join('/') : '—'
  const exciteText = points.length ? points.map((row) => row.excite).join('/') : '—'
  const reference = notWantToPlayTrend(mood.rows)
  const gameDir = settings.gamePath || cache.gameDir
  const last = gameDir ? lastTranscriptLine(gameDir) : null
  const slept = Boolean(last && /\[MCP\]\s*sleep\(/.test(last))
  const when = game && game.stamp
    ? `${game.stamp.label} ${game.stamp.time}`
    : (game && game.stampText) || facts.lastStamp || '未知'
  const days = facts.days || (game ? 1 : 0)
  return [
    `这次玩到：${when}${slept ? '（睡过觉）' : '（没睡觉，别关）'}`,
    `玩了几个游戏日：${days}`,
    `最近三天：心情 ${moodText}，兴奋 ${exciteText}`,
    `不想玩参考值：≈ ${reference === null ? '—' : reference}%`,
    `存档：${facts.saveName || '未知'}`,
    '',
    '请决定下次什么时候开。定好用 stardew 工具调',
    '  action="schedule", args={"at":"2026-11-17T14:00"}',
    '（也可以 args={"in":"4h"}；不想定就回一句「先不定」。）',
  ].join('\n')
}

/**
 * 把设置写回 DSH：优先 configEditor（只合并改的字段），没有就退回 fiber.update。
 * 返回 { ok, message }。
 */
async function writeConfig(ctx, getConfig, patch, log) {
  try {
    const editor = ctx.get?.('configEditor')
    const entry = editor?.entries?.().find((item) => item && (item.name === 'dsh-stardewvalley-panel' || item.id === 'include:dsh-stardewvalley-panel' || item.patchId === 'dsh-stardewvalley-panel'))
    if (editor?.edit && entry) {
      await editor.edit(entry, (current) => ({ ...(current ?? {}), ...patch }))
      return { ok: true, message: '' }
    }
  } catch (error) {
    log?.('warn', 'configEditor 保存失败：' + (error?.message ?? error))
  }
  try {
    const update = ctx.fiber?.update
    if (typeof update !== 'function') throw new Error('DSH 没有提供写回设置的接口')
    update.call(ctx.fiber, { ...getConfig(), ...patch })
    return { ok: true, message: '' }
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error) }
  }
}

/** 下一次开玩排期存在这里（插件自己的文件，不依赖 DSH 配置写回）。 */
function scheduleFile() {
  return join(cacheDir(), 'schedule.json')
}

export function readSchedule() {
  try {
    const value = JSON.parse(readFileSync(scheduleFile(), 'utf8'))
    return value && typeof value.nextStartAt === 'string' ? value : { nextStartAt: '' }
  } catch {
    return { nextStartAt: '' }
  }
}

function writeSchedule(value) {
  try {
    mkdirSync(cacheDir(), { recursive: true })
    const file = scheduleFile()
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify({ nextStartAt: value.nextStartAt || '', setAt: value.setAt || Date.now() }, null, 2), 'utf8')
    rmSync(file, { force: true })
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

/** schedule 动作/面板共用：设/清/查下一次开玩时间。 */
export async function setNextStart(ctx, getConfig, args, log) {
  let parsed
  try {
    parsed = parseScheduleArgs(args)
  } catch (error) {
    return { outcome: 'failed', message: String(error?.message ?? error) }
  }
  const current = readSchedule()
  if (parsed.kind === 'query') {
    return { outcome: 'ok', message: current.nextStartAt ? `现在排的下次开玩：${formatLocal(current.nextStartAt)}` : '现在没有排下次开玩时间', nextStartAt: current.nextStartAt }
  }
  const nextStartAt = parsed.kind === 'clear' ? '' : parsed.at
  if (!writeSchedule({ nextStartAt })) return { outcome: 'failed', message: '写排期文件失败：' + scheduleFile() }
  return {
    outcome: 'ok',
    nextStartAt,
    message: nextStartAt ? `排好了：${formatLocal(nextStartAt)} 自动开游戏` : '已经取消下次开玩',
  }
}

// ───────────────────────── 会话 ─────────────────────────

export async function wakeSession(ctx, sessionId, text, log) {
  const want = String(sessionId ?? '').trim()
  if (!want) return '没叫：没有给会话 id'
  let controller
  try {
    controller = ctx.get?.('sessionController')
  } catch {}
  if (!controller?.resolveAgent) return '叫不动（第 1 步，找会话）：这个 DSH 没有 sessionController，没法按会话 id 找到 agent'

  // 拉一次 agent。返回 { agent } / { notFound } / { error }
  const resolve = async (id) => {
    try {
      const found = await controller.resolveAgent(id)
      if (found && 'agent' in found) return { agent: found.agent }
      if (found?.error?.code === 'session/not-found') return { notFound: true }
      return { error: found?.error?.message ?? found?.error?.code ?? '未知错误' }
    } catch (error) {
      return { error: String(error?.message ?? error) }
    }
  }

  // 允许只给前 8 位（或者不带 session- 前缀）：resolveAgent 只认全 id，
  // 对不上时去列表里按前缀找唯一一个。11-17 就是因为这里没做，短 id 一律「找不到会话」。
  const norm = (value) => String(value).replace(/^session-/, '')
  let id = want
  let found = await resolve(id)
  if (found.notFound) {
    let items = []
    try {
      const value = await controller.list?.({}, AbortSignal.timeout(4000))
      items = (value?.items ?? []).filter((item) => String(item.sessionId).startsWith('session-'))
    } catch {}
    const hits = items.filter((item) => norm(item.sessionId).startsWith(norm(want)))
    if (hits.length === 1) {
      id = hits[0].sessionId
      found = await resolve(id)
    } else if (hits.length > 1) {
      return `叫不动（第 1 步，找会话）：${want} 能对上 ${hits.length} 个会话，给全 id 才准（${hits.slice(0, 3).map((item) => item.sessionId).join('、')}…）`
    } else {
      return `叫不动（第 1 步，找会话）：${want} 不在会话列表里，也没有 agent 能解析出它`
    }
  }
  if (found.error) return `叫不动（第 1 步，找会话）：${want} → ${found.error}`
  const agent = found.agent
  if (!agent) return `叫不动（第 1 步，找会话）：${want} 解析出来了，但里面没有 agent`

  const message = Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(text) }],
    source: { kind: 'dsh-stardewvalley-panel', form: 'notice', summary: '星露谷管家' },
  })

  // 它在跑：用 steer 把话插进当前这一轮（不打断、不排队），插不进去才回绝。
  // 以前这里一律「不是空闲就拒绝」，结果推给主会话几乎每次都失败——主会话十有八九在干活。
  const status = String(agent.status ?? 'idle')
  if (status !== 'idle') {
    if (typeof agent.steer !== 'function')
      return `叫不动（第 3 步，投递）：${id} 现在 status=${status}，这个 DSH 又没有 steer，只能等它空闲`
    try {
      agent.steer(message)
      log?.('info', `已把话插进正在跑的会话 ${id}（status=${status}）`)
      return `叫醒了 ${id}（它正在跑，消息已插进当前这一轮）`
    } catch (error) {
      return `叫不动（第 3 步，投递）：${id} 在跑（status=${status}），steer 也失败 —— ${String(error?.message ?? error)}`
    }
  }

  if (typeof agent.followup !== 'function') return `叫不动（第 3 步，投递）：${id} 不接受 followup`
  try {
    agent.followup(message)
  } catch (error) {
    const reason = String(error?.message ?? error)
    if (/outside a SessionStore/.test(reason)) return '叫不动（第 3 步，投递）：这个会话属于别的 workspace，当前 workspace 不能往里写；请选当前 workspace 里的会话。'
    return `叫不动（第 3 步，投递）：${id} → ${reason}`
  }
  log?.('info', `已唤醒会话 ${id}`)
  return `叫醒了 ${id}`
}

async function listSessions(ctx) {
  let controller
  try {
    controller = ctx.get?.('sessionController')
  } catch {}
  if (!controller?.list) return []
  try {
    const value = await controller.list({}, AbortSignal.timeout(4000))
    return (value?.items ?? [])
      // 子代理会话的 id 是裸 UUID，resolveAgent 会报 “owned by subagent routing”，
      // 普通会话都带 session- 前缀。面板和入口工具只列普通会话。
      .filter((item) => !item.blank && String(item.sessionId).startsWith('session-'))
      .map((item) => ({
        id: item.sessionId,
        title: item.projections?.values?.title ?? item.projections?.values?.sessionTitle ?? '',
        running: Boolean(item.running),
        updatedAt: item.updatedAt ?? null,
        cwd: item.cwd ?? '',
      }))
  } catch {
    return []
  }
}

// ───────────────────────── 状态 ─────────────────────────

function makeStateCache() {
  return {
    statusAt: 0,
    status: 'off',
    gameAt: 0,
    gameText: '',
    gameParsed: null,
    transcriptMtime: 0,
    transcriptFile: '',
    gameDir: '',
    sessionsAt: 0,
    sessions: [],
    releaseAt: 0,
    release: null,
    scheduleFiredAt: '',
    scheduleLast: null,
    pushStatus: null,
  }
}

async function probeSettings(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/settings`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    await res.json().catch(() => null)
    return true
  } catch {
    return false
  }
}

/** 只在行动记录变了、缓存为空、或者手动刷新时才问 get_state（避免面板把游戏时钟一直冻着）。 */
async function getGameState(cache, port, transcriptMtime, force = false) {
  const changed = transcriptMtime && transcriptMtime !== cache.transcriptMtime
  if (!force && cache.gameParsed && !changed) return cache.gameParsed
  try {
    const text = await callGameTool(port, 'get_state', {}, AbortSignal.timeout(8000))
    cache.gameAt = Date.now()
    cache.gameText = text
    cache.gameParsed = parseGameState(text)
    cache.transcriptMtime = transcriptMtime || 0
    return cache.gameParsed
  } catch {
    return cache.gameParsed
  }
}

async function getLatestRelease(cache) {
  const now = Date.now()
  if (cache.release && now - cache.releaseAt < 10 * 60_000) return cache.release
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-stardewvalley-panel' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const release = await res.json()
    const asset = (release.assets ?? []).find((a) => /BlindWhaleFarmer.*\.zip$/i.test(a.name)) ?? (release.assets ?? [])[0]
    cache.release = {
      tag: release.tag_name ?? '',
      version: String(release.tag_name ?? '').replace(/^v/i, ''),
      name: release.name ?? '',
      publishedAt: release.published_at ?? '',
      asset: asset ? { name: asset.name, size: asset.size, url: asset.browser_download_url } : null,
    }
    cache.releaseAt = now
    return cache.release
  } catch (error) {
    return cache.release ?? { error: error?.message ?? String(error) }
  }
}

function modInfo(settings) {
  const gameDir = findGameDir(settings.gamePath)
  const installed = gameDir ? manifestVersion(join(gameDir, 'Mods', MOD_FOLDER)) : null
  const bundled = manifestVersion(BUNDLED_MOD_DIR)
  return { gameDir, installed, bundled }
}

async function collectState(ctx, getConfig, cache, force = false) {
  const settings = getConfig()
  const port = Number(settings.port) || 18080
  const running = smapiRunning()
  const listening = running ? await probeSettings(port) : false
  const info = modInfo(settings)
  cache.gameDir = info.gameDir ?? ''
  const transcript = info.gameDir ? latestTranscript(info.gameDir) : null
  const liveText = transcript ? readTail(transcript.file) : null
  const live = liveText ? summarizeLive(liveText, { mtimeMs: transcript.mtimeMs, now: Date.now() }) : null
  if (live) {
    live.ageText = relativeAge(live.lastWriteAgeSeconds)
    live.stale = Number.isFinite(live.lastWriteAgeSeconds) && live.lastWriteAgeSeconds > 300
  }

  // 只在模组连上时问 get_state；没进存档时它返回标题画面的提示，解析为空 → status=title。
  // 进存档以后缓存住，只有行动记录变了（她动过）或者手动刷新才再问一次——这样面板不会把时钟一直冻着。
  let game = null
  let status = 'off'
  if (running) {
    status = 'starting'
    if (listening) {
      game = await getGameState(cache, port, transcript?.mtimeMs ?? 0, force)
      status = game ? 'world' : 'title'
    }
  }
  const mood = readMood(settings)
  const moodGap = moodDayGap(mood.latest, game?.stamp)
  const release = await getLatestRelease(cache)
  const update = release && !release.error && info.installed && release.version
    ? { latest: release.version, installed: info.installed, available: compareVersions(release.version, info.installed) > 0, checkedAt: cache.releaseAt }
    : { latest: release?.version ?? '', installed: info.installed, available: false, checkedAt: cache.releaseAt, error: release?.error }

  const now = Date.now()
  if (now - cache.sessionsAt > 10_000) {
    cache.sessions = await listSessions(ctx)
    cache.sessionsAt = now
  }

  return {
    ok: true,
    version: PKG_VERSION,
    updatedAt: new Date().toISOString(),
    config: {
      port,
      gamePath: settings.gamePath,
      playSessionId: settings.playSessionId,
      scheduleSessionId: settings.scheduleSessionId,
      mainSessionId: settings.mainSessionId,
      windowMode: settings.windowMode,
      appendExperience: settings.appendExperience,
      notesFile: settings.notesFile,
      sessionDays: settings.sessionDays,
      sessionMinutes: settings.sessionMinutes,
      freezeTime: settings.freezeTime,
      idleSeconds: settings.idleSeconds,
      forageRadius: settings.forageRadius,
      extraInstructions: settings.extraInstructions,
      guideFile: settings.guideFile,
      autoInstallMod: settings.autoInstallMod,
      gatewayEnabled: settings.gatewayEnabled,
      autoContinue: settings.autoContinue,
      autoContinueMax: settings.autoContinueMax,
    },
    game: {
      running,
      listening,
      status,
      port,
      dir: info.gameDir ?? '',
      modInstalled: info.installed,
      modBundled: info.bundled,
      update,
    },
    state: game,
    live,
    mood: {
      rows: mood.rows.map((row) => ({ label: row.label, mood: row.mood, excite: row.excite })),
      latest: mood.latest ? { label: mood.latest.label, mood: mood.latest.mood, excite: mood.latest.excite } : null,
      notWantToPlay: mood.notWantToPlay,
      days: mood.days,
      file: mood.file,
      exists: mood.exists,
      lastUpdated: mood.lastUpdated,
      gap: moodGap,
    },
    sessions: cache.sessions,
    schedule: {
      nextStartAt: readSchedule().nextStartAt,
      last: cache.scheduleLast,
      push: cache.pushStatus,
    },
    hints: {
      liveSource: game ? 'get_state' : live ? 'transcript' : 'none',
      liveNote: game
        ? '状态来自游戏里的 get_state（只在有新动作时刷新）。'
        : live
          ? '游戏没进存档：下面是上一次游玩的最后状态。'
          : '还没有行动记录：她还没在这个存档里动过。',
    },
  }
}

// ───────────────────────── 动作 ─────────────────────────

export function closeGame(settings) {
  const gameDir = findGameDir(settings.gamePath)
  if (!gameDir) return '没关：找不到星露谷的安装目录'
  if (!smapiRunning()) return '游戏本来就没开着'
  const last = lastTranscriptLine(gameDir)
  if (last === null) return '没关：读不到行动记录（logs 里没有 transcript-*.log），没法确认存没存档'
  if (!/\[MCP\]\s*sleep\(/.test(last)) {
    return '没关：最后一条行动不是 sleep，说明还没存档。最后一行：' + last.slice(0, 160)
  }
  try {
    execFileSync('taskkill', ['/IM', 'StardewModdingAPI.exe', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 15000 })
    return '关掉了。下次要玩：重开游戏，等 SMAPI 那个黑窗口滚完，读档。'
  } catch (error) {
    const msg = String(error?.message ?? error)
    if (/not found|找不到|没有找到|没有运行/i.test(msg) || error?.status === 128) return '游戏本来就没开着'
    return '关的时候出错了：' + msg
  }
}

/** 三步走：在农舍里 → 碰床睡觉；任何一步失败就停下，绝不硬睡。 */
export async function forceSleep(port) {
  const steps = []
  let state = null
  try {
    state = parseGameState(await callGameTool(port, 'get_state', {}, AbortSignal.timeout(8000)))
  } catch {}
  if (!state) return { outcome: 'failed', message: '游戏不在存档里（没开或者在标题画面），没法睡觉。', steps }
  if (state.location !== 'FarmHouse') {
    let travel = ''
    try {
      travel = await callGameTool(port, 'travel_to', { location: 'FarmHouse' }, AbortSignal.timeout(300_000))
    } catch (error) {
      travel = '失败：' + (error?.message ?? error)
    }
    steps.push('第一步：回家 → ' + travel)
    if (!/^成功/.test(travel) || !/FarmHouse/.test(travel)) {
      return { outcome: 'failed', message: '停在第一步：没有回到农舍，不继续睡（星露谷里不在床上会晕倒丢东西）。', steps }
    }
  } else {
    steps.push('第一步：已经在农舍里')
  }
  let sleep = ''
  try {
    sleep = await callGameTool(port, 'sleep', {}, AbortSignal.timeout(480_000))
  } catch (error) {
    sleep = '失败：' + (error?.message ?? error)
  }
  steps.push('第二步：碰床睡觉 → ' + sleep)
  const ok = /睡醒|成功/.test(sleep)
  return {
    outcome: ok ? 'ok' : 'failed',
    message: ok ? '睡醒并存档了。' : '停在第二步：睡觉没有成功，别硬来，先看看游戏里现在什么情况。',
    steps,
  }
}

function powershell(command) {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    timeout: 120_000,
    stdio: 'ignore',
  })
}

async function downloadTo(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000), redirect: 'follow' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const bytes = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return bytes.length
}

/** 查更新并把新版装进 Mods（不覆盖 config.json）。游戏必须关着。 */
async function updateMod(settings, cache, log) {
  const release = await getLatestRelease(cache)
  if (!release || release.error) return { outcome: 'failed', message: '查不到最新版本：' + (release?.error ?? '没有 release') }
  const info = modInfo(settings)
  if (!info.gameDir) return { outcome: 'failed', message: '找不到星露谷的安装目录' }
  if (!info.installed) return { outcome: 'failed', message: '游戏里没装 BlindWhaleFarmer 模组' }
  if (compareVersions(release.version, info.installed) <= 0)
    return { outcome: 'ok', message: `已经是最新的（本地 ${info.installed}，GitHub ${release.version}）`, version: info.installed }
  if (!release.asset) return { outcome: 'failed', message: '最新 release 里没有可下载的 zip' }
  if (smapiRunning()) return { outcome: 'failed', message: `有新版 ${release.version}，但游戏开着，dll 被占用。先关游戏再点一次。`, latest: release.version }
  const zip = join(cacheDir(), `BlindWhaleFarmer-${release.version}.zip`)
  const urls = [`${MIRROR}${release.asset.url}`, release.asset.url]
  let downloaded = 0
  let lastError = null
  for (const url of urls) {
    try {
      downloaded = await downloadTo(url, zip)
      if (downloaded > 10_000) break
    } catch (error) {
      lastError = error
    }
  }
  if (downloaded <= 10_000) return { outcome: 'failed', message: '下载失败：' + (lastError?.message ?? '文件太小') }
  const extractDir = join(cacheDir(), `extract-${release.version}`)
  try {
    rmSync(extractDir, { recursive: true, force: true })
    mkdirSync(extractDir, { recursive: true })
    powershell(`Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`)
  } catch (error) {
    return { outcome: 'failed', message: '解压失败：' + (error?.message ?? error) }
  }
  const root = findExtracted(extractDir)
  if (!root) return { outcome: 'failed', message: '解压出来的文件里找不到 BlindWhaleFarmer.dll' }
  const target = join(info.gameDir, 'Mods', MOD_FOLDER)
  try {
    mkdirSync(join(target, 'guide'), { recursive: true })
    copyFileSync(join(root, 'BlindWhaleFarmer.dll'), join(target, 'BlindWhaleFarmer.dll'))
    for (const name of readdirSync(join(root, 'guide'))) {
      if (!name.toLowerCase().endsWith('.md')) continue
      copyFileSync(join(root, 'guide', name), join(target, 'guide', name))
    }
    copyFileSync(join(root, 'manifest.json'), join(target, 'manifest.json'))
  } catch (error) {
    return { outcome: 'failed', message: '替换文件失败：' + (error?.message ?? error) }
  }
  log?.('info', `模组已更新到 ${release.version}（${info.installed} → ${release.version}）`)
  return { outcome: 'ok', message: `装好了 ${release.version}（原 ${info.installed}）。config.json 没动。下次启动游戏生效。`, version: release.version }
}

function findExtracted(dir) {
  const queue = [dir]
  while (queue.length) {
    const current = queue.shift()
    try {
      if (existsSync(join(current, 'BlindWhaleFarmer.dll'))) return current
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) queue.push(join(current, entry.name))
      }
    } catch {}
  }
  return null
}

// ───────────────────────── 经验 / 摘要 ─────────────────────────

function buildSummary(state, live, settings) {
  const lines = []
  const stamp = state?.stampText || (live?.latest?.stampText ?? '')
  lines.push(`## ${new Date().toLocaleString('zh-CN', { hour12: false })}${stamp ? ' · ' + stamp : ''}`)
  if (state) {
    lines.push(`- 游戏：${state.locationLabel ?? state.location ?? '?'}，天气 ${state.weather || '?'}，钱 ${state.money ?? '?'}g，体力 ${state.energy ?? '?'}/${state.energyMax ?? '?'}，背包空位 ${state.freeSlots ?? '?'}`)
  }
  if (live?.latest) {
    lines.push(`- 最近动作：${live.latest.label ?? labelOfTool(live.latest.tool)} — ${live.latest.result ?? ''}`)
  }
  const mood = readMood(settings)
  if (mood.latest) lines.push(`- 心情 ${mood.latest.mood} · 兴奋 ${mood.latest.excite}（${mood.latest.label}）；不想玩参考值 ≈ ${mood.notWantToPlay}%`)
  lines.push('- 备注：')
  return lines.join('\n')
}

/**
 * 关游戏时写进「星露谷经验.md」的内容：从笔记里摘最近几个游戏日的原文。
 * 只认「## 第N年……」那种节，跳过「记着要做的」「她读过后写的」这些辅助节。
 * 末尾附一行这次停在哪（状态摘要前几行），当坐标用。
 */
export function buildExperienceText(settings, cache) {
  const summary = buildSummary(cache.gameParsed, null, settings).split('\n').filter(Boolean)
  let picked = []
  try {
    const text = readText(notesPath(settings)) ?? ''
    // 先把所有二级标题排一遍：游戏日是「## 第 N 年……」（第/年/日之间常有空格），
    // 还有「## 记着要做的」这种辅助节。切节要用「下一个标题」，不能只看下一个游戏日，
    // 否则最后一节会一路吞到文件末尾，把辅助节也当成那天的笔记。
    const headings = []
    const headingRe = /^##[^\n]*$/gm
    let m
    while ((m = headingRe.exec(text)) !== null) headings.push({ index: m.index, title: m[0] })
    const days = headings.filter((h) => /^##\s*第\s*\d+\s*年/.test(h.title))
    picked = days.slice(-3).map((day) => {
      const at = headings.indexOf(day)
      const end = at + 1 < headings.length ? headings[at + 1].index : text.length
      return text.slice(day.index, end).trim()
    })
  } catch {}
  if (!picked.length) return summary.join('\n') || '（没读到笔记，也没读到状态）'
  // 坐标行：把摘要的标题和项目符号剥掉，「备注：」那种空壳不要，只留前三条。
  const coords = summary
    .map((line) => line.replace(/^##\s*/, '').replace(/^-\s*/, '').trim())
    .filter((line) => line && !/^备注[：:]?$/.test(line))
  const tail = coords.length ? '\n\n—— 这次停在哪：' + coords.slice(0, 3).join('；') : ''
  return picked.join('\n\n') + tail
}
function appendExperience(settings, text) {
  const file = experiencePath(settings)
  try {
    mkdirSync(dirname(file), { recursive: true })
    if (!existsSync(file)) appendFileSync(file, '# 星露谷·我们的经验\n\n玩的时候撞出来的坑、算出来的账、攻略里没写的东西，玩完往上加。\n\n', 'utf8')
    appendFileSync(file, text + '\n\n', 'utf8')
    return file
  } catch (error) {
    return null
  }
}

// ───────────────────────── 路由 ─────────────────────────

export function registerOps(ctx, deps) {
  const { getConfig, log } = deps
  const cache = makeStateCache()

  /** 关游戏（面板和模型共用）：存档检查 → 杀进程 → 追加经验 / 推摘要 / 推自启会话。 */
  const closeFlow = async () => {
    const c = getConfig()
    const port = Number(c.port) || 18080
    // 一律重新定位一次：gamePath 留空（自动找 Steam 目录）时以前整段被跳过，
    // 结果推给自启会话那条写成了「没睡觉，别关」「存档：未知」「玩了 1 天」——
    // 三个数都是同一个原因：没读到这次的行动记录。
    const dir = findGameDir(c.gamePath) || cache.gameDir
    if (dir) {
      cache.gameDir = dir
      cache.transcriptFile = latestTranscript(dir)?.file || cache.transcriptFile
    }
    try {
      if (await gameStatus(port) === 'world') cache.gameParsed = await getGameState(cache, port, 0, true)
    } catch {}
    const message = closeGame(c)
    let experience = null
    let mainNote = null
    let pushNote = null
    if (/^关掉了/.test(message)) {
      if (c.appendExperience) experience = appendExperience(c, buildExperienceText(c, cache))
      if (c.mainSessionId) mainNote = await wakeSession(ctx, c.mainSessionId, '星露谷这边收工了，这是这次玩的摘要：\n' + buildSummary(cache.gameParsed, null, c), log)
      if (c.scheduleSessionId) {
        const text = buildSchedulePush(c, cache.gameParsed, cache)
        const result = await wakeSession(ctx, c.scheduleSessionId, text, log)
        const ok = /^叫醒了/.test(result)
        cache.pushStatus = { at: Date.now(), ok, skipped: false, message: result, text }
        pushNote = result
        if (!ok) log('warn', '关游戏后推给自启会话失败：' + result)
      } else {
        cache.pushStatus = { at: Date.now(), ok: false, skipped: true, message: '这次没配自启会话，下次时间没安排' }
        pushNote = cache.pushStatus.message
      }
    }
    return { message, experience, mainNote, pushNote }
  }

  const admit = (req) => {
    let connection
    try {
      connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
    } catch {}
    if (!connection || typeof connection.requestRejection !== 'function') return undefined
    try {
      return connection.requestRejection(req)
    } catch (error) {
      log?.('warn', `准入检查出错，按拒绝处理：${String(error)}`)
      return 403
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const sub = url.pathname.replace(/^\/dsh-stardewvalley-panel\/?/, '').replace(/\/+$/, '')
    const method = req.method || 'GET'
    try {
      const rejected = admit(req)
      if (rejected !== undefined) return fail(res, rejected, rejected === 403 ? '请求来源不可信' : '请求未经 DSH 认证')
      if (!isLocalRequest(req)) return fail(res, 403, '只接受本机请求')
      const settings = getConfig()
      const port = Number(settings.port) || 18080

      if (method === 'GET') {
        if (sub === '' || sub === 'state') return json(res, 200, await collectState(ctx, getConfig, cache, url.searchParams.get('refresh') === '1'))
        if (sub === 'sessions') return json(res, 200, { ok: true, sessions: await listSessions(ctx) })
        return fail(res, 404, '没有这个接口')
      }
      if (method !== 'POST') return fail(res, 405, '只支持 GET/POST')
      if (req.headers[REQUEST_HEADER] !== '1') return fail(res, 403, '缺少本插件的请求头')

      if (sub === 'config') {
        const body = await readJson(req)
        const allowed = [
          'port', 'gamePath', 'playSessionId', 'scheduleSessionId', 'mainSessionId', 'windowMode', 'gameWindowMode',
          'appendExperience', 'notesFile', 'sessionDays', 'sessionMinutes', 'freezeTime', 'idleSeconds', 'forageRadius',
          'companionMode', 'extraInstructions', 'guideFile', 'autoInstallMod', 'gatewayEnabled', 'autoContinue', 'autoContinueMax',
        ]
        const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)))
        const written = await writeConfig(ctx, getConfig, patch, log)
        if (!written.ok) return json(res, 200, { ok: true, outcome: 'failed', message: '保存失败：' + written.message })
        return json(res, 200, { ok: true, outcome: 'ok', message: '设置已保存', config: getConfig() })
      }

      if (sub === 'schedule') {
        const body = await readJson(req)
        const result = await setNextStart(ctx, getConfig, body, log)
        return json(res, 200, { ok: true, ...result })
      }

      if (sub === 'start') {
        const c = getConfig()
        let text
        try {
          text = await launchGame({ port, gamePath: c.gamePath, save: undefined, windowMode: c.windowMode, gameWindowMode: c.gameWindowMode, signal: AbortSignal.timeout(320_000) })
        } catch (error) {
          text = '失败：' + (error?.message ?? error)
        }
        let wake = null
        if (text.startsWith('成功') && c.playSessionId) {
          wake = await wakeSession(ctx, c.playSessionId, '游戏已经起来了。先 action="get_state" 看看状态，接着上次玩（长期笔记在 get_state 最前面）。', log)
        }
        return json(res, 200, { ok: true, outcome: text.startsWith('成功') ? 'ok' : 'failed', message: text + (wake ? '；' + wake : '') })
      }

      if (sub === 'stop') {
        const c = getConfig()
        const notes = []
        if (c.playSessionId) {
          let controller
          try { controller = ctx.get?.('sessionController') } catch {}
          if (controller?.cancel) {
            try {
              await controller.cancel({ sessionId: c.playSessionId })
              notes.push('已请求停下会话 ' + c.playSessionId)
            } catch (error) {
              notes.push('停会话失败：' + (error?.message ?? error))
            }
          }
        }
        try {
          notes.push(await callGameTool(port, 'toggle_ai', { on: false }, AbortSignal.timeout(8000)))
        } catch {
          notes.push('游戏没开（没什么可停的）')
        }
        return json(res, 200, { ok: true, outcome: 'ok', message: notes.join('；') })
      }
      if (sub === 'resume') {
        const notes = []
        try {
          notes.push(await callGameTool(port, 'toggle_ai', { on: true }, AbortSignal.timeout(8000)))
        } catch {
          notes.push('游戏没开（没什么可恢复的）')
        }
        return json(res, 200, { ok: true, outcome: 'ok', message: notes.join('；') })
      }

      if (sub === 'close') {
        const result = await closeFlow()
        const extras = []
        if (result.experience) extras.push('已把摘要追加到 ' + result.experience)
        if (result.pushNote) extras.push(result.pushNote)
        return json(res, 200, {
          ok: true,
          outcome: /^没关/.test(result.message) ? 'failed' : 'ok',
          message: result.message + (extras.length ? '；' + extras.join('；') : ''),
        })
      }

      if (sub === 'sleep') {
        const result = await forceSleep(port)
        return json(res, 200, { ok: true, ...result })
      }

      if (sub === 'update-check') {
        const release = await getLatestRelease(cache)
        const info = modInfo(getConfig())
        const available = Boolean(release && !release.error && info.installed && compareVersions(release.version, info.installed) > 0)
        return json(res, 200, {
          ok: true,
          outcome: release?.error ? 'failed' : 'ok',
          message: release?.error
            ? '查不到 GitHub：' + release.error
            : `本地 ${info.installed ?? '没装'}，GitHub 最新 ${release.version}${available ? '（有新版）' : '（已最新）'}`,
          release,
          installed: info.installed,
          available,
        })
      }

      if (sub === 'update-apply') {
        const result = await updateMod(getConfig(), cache, log)
        return json(res, 200, { ok: true, ...result })
      }

      if (sub === 'append-experience') {
        const c = getConfig()
        const text = buildSummary(cache.gameParsed, null, c)
        const file = appendExperience(c, text)
        return json(res, 200, { ok: true, outcome: file ? 'ok' : 'failed', message: file ? `追加到 ${file}` : '写不进去（看看笔记目录权限）' })
      }

      if (sub === 'notes') {
        const c = getConfig()
        if (!c.mainSessionId) return json(res, 200, { ok: true, outcome: 'failed', message: '设置里没填主会话 id' })
        const text = buildSummary(cache.gameParsed, null, c)
        const result = await wakeSession(ctx, c.mainSessionId, '星露谷这边给你一条摘要：\n' + text, log)
        return json(res, 200, { ok: true, outcome: /^叫醒了/.test(result) ? 'ok' : 'failed', message: result })
      }

      return fail(res, 404, '没有这个接口')
    } catch (error) {
      log?.('warn', `面板接口出错：${String(error)}`)
      if (!res.headersSent) fail(res, Number.isInteger(error?.status) ? error.status : 500, error?.message || '内部错误')
      else res.end()
    }
  }

  const mount = (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
      'dsh-stardewvalley-panel: 面板接口',
    )
  }
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mount)
  else {
    const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (webServer?.register) ctx.effect(() => webServer.register({ kind: 'prefix', path: API_PREFIX, handler }), 'dsh-stardewvalley-panel: 面板接口')
    else log?.('info', '没有 webServer，面板接口没挂上')
  }

  // 一次性的 nextStartAt：到点拉起游戏 + 叫「玩游戏的会话」；触发一次就清空。
  // 插件不判断该不该玩，只负责按时叫醒。
  ctx.effect(() => {
    const timer = setInterval(async () => {
      const c = getConfig()
      const next = readSchedule().nextStartAt
      if (!next) return
      const at = Date.parse(next)
      if (!Number.isFinite(at) || Date.now() < at) return
      if (cache.scheduleFiredAt === next) return
      // 排期文件是持久的：DSH 关了很久再开，过期的排期不要突然拉起游戏
      if (Date.now() - at > 10 * 60_000) {
        cache.scheduleFiredAt = next
        writeSchedule({ nextStartAt: '' })
        cache.scheduleLast = { at: Date.now(), ok: false, skipped: true, message: `排的 ${formatLocal(next)} 已经过了很久，跳过并清掉` }
        log('warn', cache.scheduleLast.message)
        return
      }
      cache.scheduleFiredAt = next
      if (!writeSchedule({ nextStartAt: '' })) log('warn', '清空排期文件失败：' + scheduleFile())
      if (smapiRunning()) {
        cache.scheduleLast = { at: Date.now(), ok: false, skipped: true, message: '到点时游戏已经开着，跳过' }
        log('info', '定时开玩到点，但游戏已经开着，跳过')
        return
      }
      log('info', `到 ${formatLocal(next)}，自动开游戏`)
      try {
        const text = await launchGame({ port: Number(c.port) || 18080, gamePath: c.gamePath, windowMode: c.windowMode, gameWindowMode: c.gameWindowMode, signal: AbortSignal.timeout(320_000) })
        const ok = text.startsWith('成功')
        let wake = null
        if (ok && c.playSessionId) wake = await wakeSession(ctx, c.playSessionId, '到点了，游戏已经起来，先 get_state 接着玩。', log)
        cache.scheduleLast = { at: Date.now(), ok, skipped: false, message: text + (wake ? '；' + wake : '') }
        log(ok ? 'info' : 'warn', '定时开玩：' + cache.scheduleLast.message)
      } catch (error) {
        cache.scheduleLast = { at: Date.now(), ok: false, skipped: false, message: '开游戏失败：' + (error?.message ?? error) }
        log('warn', cache.scheduleLast.message)
      }
    }, 30_000)
    return () => clearInterval(timer)
  })

  return {
    close: () => closeFlow(),
    sleep: () => forceSleep(Number(getConfig().port) || 18080),
    schedule: (args) => setNextStart(ctx, getConfig, args, log),
    state: () => collectState(ctx, getConfig, cache, true),
  }
}