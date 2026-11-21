// 面板用到的纯函数：解析行动记录（transcript）、解析心情表、算「不想玩」的参考值。
//
// 这里不读文件、不发请求、不碰 Cordis——输入是字符串，输出是普通对象，
// 所以能直接用 `node --test tests/panel-state.test.mjs` 跑，不用开游戏。
//
// 为什么要从 transcript 里读：模组只把「动作和结果」写进 logs/transcript-*.log，
// 不写状态文件；而通过 MCP 反复调 get_state 会让游戏时钟一直冻着（模组按
// "最近 N 秒有没有请求" 判断客户端在不在想，最小 10 秒、默认 120 秒）。
// 所以面板先读这份日志，能在她玩的时候给出时间、体力、钱、背包空位和最近动作。
// 要精确的实时钱数，得等模组那半加一个只读状态文件（见 README 的「下一步」）。

const SEASON_NAMES = ['春', '夏', '秋', '冬']

/** 行动记录里每行开头的时间戳：[第1年春23日 06:00]。 */
const STAMP_RE = /第(\d+)年(春|夏|秋|冬)(\d+)日\s+(\d{1,2}):(\d{2})/

/** 一行行动记录：`[第1年春23日 06:00] [MCP] water_crops({}) → 成功：…`。 */
const LINE_RE = /^\[([^\]]*)\]\s*\[MCP\]\s*([A-Za-z_][\w]*)\s*\(([\s\S]*)\)\s*→\s*([\s\S]*)$/

/** 心情表的行：`| 春 1 日 | 65 | 70 | 拐点… |`。 */
const MOOD_ROW_RE = /^\|\s*(春|夏|秋|冬)\s*(\d+)\s*日\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/

/** 把文本截短，面板上不铺满整段结果。 */
export function clip(text, max = 160) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}

/** 解析 `第1年春23日 06:00`；解析不了返回 null。 */
export function parseStamp(text) {
  const m = STAMP_RE.exec(String(text ?? ''))
  if (!m) return null
  const [, year, season, day, hour, minute] = m
  return {
    year: Number(year),
    season: SEASON_NAMES.indexOf(season),
    seasonName: season,
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    label: `第${year}年 ${season}${day}日`,
    time: `${String(Number(hour)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`,
  }
}

/**
 * 把整份行动记录解析成条目。
 * @param {string} text
 * @param {{ limit?: number }} [options]
 * @returns {{ entries: Array<object>, total: number, latest: object | null }}
 */
export function parseTranscript(text, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20
  const entries = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = LINE_RE.exec(line)
    if (!m) continue
    const [, stampText, tool, args, result] = m
    const trimmed = result.trim()
    const ok = /^(成功|已|正在)/.test(trimmed) ? true : /^(失败|没有|不)/.test(trimmed) ? false : null
    entries.push({
      stamp: parseStamp(stampText),
      stampText: stampText.trim(),
      tool,
      label: labelOfTool(tool),
      args: clip(args, 120),
      result: clip(trimmed, 240),
      ok,
    })
  }
  return {
    entries: entries.slice(-limit),
    total: entries.length,
    latest: entries.length ? entries[entries.length - 1] : null,
  }
}

/**
 * 从条目里抽出面板要显示的量。每项记下「哪个动作给的」，界面据此标明时间。
 * 日志里不是每个动作都带这些数，所以取最近一次出现的那条。
 */
export function extractMetrics(entries) {
  const metrics = {
    energy: null,
    energyMax: null,
    money: null,
    freeSlots: null,
    health: null,
    location: null,
  }
  const put = (key, value, entry) => {
    if (value === null || value === undefined || value === '') return
    if (typeof value === 'number' && !Number.isFinite(value)) return
    metrics[key] = { value, stamp: entry.stamp, stampText: entry.stampText, tool: entry.tool }
  }
  for (const entry of entries ?? []) {
    const r = entry.result ?? ''
    let m
    // 吃东西会写「体力 45 → 113」，直接跳到后一个数
    if ((m = /体力\s*(\d+)\s*→\s*(\d+)/.exec(r))) {
      put('energy', Number(m[2]), entry)
    } else if ((m = /剩余体力\s*(\d+)/.exec(r)) || (m = /^体力\s*(\d+)(?:\s|$)/.exec(r))) {
      put('energy', Number(m[1]), entry)
    }
    if ((m = /体力\s*(\d+)\s*\/\s*(\d+)/.exec(r))) {
      put('energy', Number(m[1]), entry)
      put('energyMax', Number(m[2]), entry)
    }
    if ((m = /生命\s*(\d+)\s*\/\s*(\d+)/.exec(r))) {
      put('health', Number(m[1]), entry)
    }
    if ((m = /剩余\s*(\d+)\s*g/.exec(r)) || (m = /现在有\s*(\d+)\s*g/.exec(r)) || (m = /得到\s*(\d+)\s*g/.exec(r))) {
      put('money', Number(m[1]), entry)
    }
    if ((m = /背包空位只剩\s*(\d+)\s*个/.exec(r))) {
      put('freeSlots', Number(m[1]), entry)
    }
    if ((m = /已到达\s*([A-Za-z][A-Za-z0-9_]*)/.exec(r))) {
      put('location', m[1], entry)
    }
  }
  return metrics
}

/** 把日志文本汇总成面板要的 live 段。 */
export function summarizeLive(text, { mtimeMs = null, now = Date.now(), limit = 20 } = {}) {
  const parsed = parseTranscript(text, { limit })
  const metrics = extractMetrics(parsed.entries)
  const latest = parsed.latest
  return {
    entries: parsed.entries,
    totalActions: parsed.total,
    latest: latest
      ? {
          tool: latest.tool,
          label: labelOfTool(latest.tool),
          ok: latest.ok,
          result: latest.result,
          stampText: latest.stampText,
          stamp: latest.stamp,
          ageSeconds: mtimeMs === null ? null : Math.max(0, Math.round((now - mtimeMs) / 1000)),
        }
      : null,
    metrics,
    lastWriteAgeSeconds: mtimeMs === null ? null : Math.max(0, Math.round((now - mtimeMs) / 1000)),
  }
}

/**
 * 解析 `笔记\星露谷笔记.md` 里「## 心情（一天一行）」那张表。
 * 返回按文件顺序（= 时间顺序）的行；没记数的日子（—）保留标签、数值为 null。
 */
export function parseMoodTable(text) {
  const rows = []
  let lastUpdated = ''
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    const updated = /^最后更新[：:]\s*(.+)$/.exec(line)
    if (updated) lastUpdated = updated[1].trim()
    const m = MOOD_ROW_RE.exec(line)
    if (!m) continue
    const [, season, dayText, moodText, exciteText] = m
    const toNumber = (value) => {
      const t = String(value).trim()
      if (!/^\d+$/.test(t)) return null
      const n = Number(t)
      return n >= 0 && n <= 100 ? n : null
    }
    rows.push({
      label: `${season} ${dayText} 日`,
      season: SEASON_NAMES.indexOf(season),
      seasonName: season,
      day: Number(dayText),
      mood: toNumber(moodText),
      excite: toNumber(exciteText),
    })
  }
  return { rows, lastUpdated }
}

/** 取最近一条两个数都有的心情记录。 */
export function latestMood(rows) {
  for (let i = (rows?.length ?? 0) - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row && row.mood !== null && row.excite !== null) return row
  }
  return null
}
/**
 * 心情表最后记的那天，跟游戏里现在这天差几天。
 * 差 0 = 今天的数已经记了；差 1 = 昨天记的，今天还没记。
 * 拿 season（0春 1夏 2秋 3冬）× 28 + day - 1 比，跨年不管（一次玩不到一整年）。
 * 没有数据或解析不出时返回 null。
 */
export function moodDayGap(moodLatest, stamp) {
  if (!moodLatest || !stamp) return null
  if (typeof moodLatest.season !== 'number' || typeof moodLatest.day !== 'number') return null
  if (typeof stamp.season !== 'number' || typeof stamp.day !== 'number') return null
  if (moodLatest.season < 0 || stamp.season < 0) return null
  const a = moodLatest.season * 28 + (moodLatest.day - 1)
  const b = stamp.season * 28 + (stamp.day - 1)
  const diff = b - a
  if (diff < 0) return null
  return diff
}

/**
 * 「此刻有多不想玩」的参考值（0–100，越大越想收工）。
 * 兴奋（还想不想接着干）权重高一点，心情（顺不顺）其次。
 *
 * 只显示，不执行：停不停是她自己定的事，这个数只摆出来给她和爸爸看。
 */
export function notWantToPlay(mood, excite) {
  if (!Number.isFinite(mood) || !Number.isFinite(excite)) return null
  const m = Math.min(100, Math.max(0, mood)) / 100
  const e = Math.min(100, Math.max(0, excite)) / 100
  return Math.round(Math.min(1, Math.max(0, 0.55 * (1 - e) + 0.45 * (1 - m))) * 100)
}

const TOOL_LABELS = {
  load_save: '读档',
  travel_to: '去别的地图',
  move_to: '走过去',
  use_tool: '用工具',
  interact: '交互',
  water_crops: '浇水',
  till_area: '开地',
  plant_seeds: '播种',
  harvest_crops: '收获',
  clear_area: '清理',
  fish: '钓鱼',
  eat: '吃东西',
  sleep: '睡觉',
  wait: '等时间',
  buy: '买东西',
  sell: '卖东西',
  ship_items: '出货',
  store_items: '存进箱子',
  take_items: '从箱子拿',
  tidy_backpack: '整理背包',
  list_chests: '看箱子',
  trash_item: '扔东西',
  explore_mine: '下矿',
  fight: '打怪',
  care_animals: '照顾动物',
  give_gift: '送礼',
  gift_info: '查送礼喜好',
  festival: '节日',
  open_shop: '逛店',
  close_menu: '关界面',
  dialogue: '对话',
  cook: '做饭',
  craft: '制作',
  build: '建造',
  upgrade_house: '升级房子',
  upgrade_tool: '升级工具',
  buy_animal: '买动物',
  crack_geodes: '砸晶球',
  donate_bundles: '交收集包',
  bundle_info: '查收集包',
  donate_museum: '捐博物馆',
  quest_board: '看告示板',
  check_crab_pots: '收蟹笼',
  choose_profession: '选职业',
  skip_event: '跳过剧情',
  leave_festival: '离开节日',
  menu_click: '点菜单',
  set_mode: '换联机模式',
  say: '说话',
  update_notes: '记笔记',
  set_name: '起名字',
  follow: '跟随',
  wait_chat: '等人说话',
  propose: '求婚',
  toggle_ai: '开关内置 AI',
  get_guide: '读攻略',
}

/** 工具名 → 中文动作；认不出就原样显示。 */
export function labelOfTool(tool) {
  return TOOL_LABELS[tool] ?? String(tool ?? '')
}

/** 地图 id → 中文地名（面板上更顺眼）。 */
const PLACE_LABELS = {
  Farm: '农场',
  FarmHouse: '农舍',
  Town: '镇上',
  SeedShop: '杂货店',
  Beach: '海边',
  FishShop: '鱼店',
  Forest: '森林',
  Mountain: '山上',
  Mine: '矿洞',
  BusStop: '巴士站',
  AnimalShop: '牧场',
  Blacksmith: '铁匠铺',
  Saloon: '酒吧',
  CommunityCenter: '社区中心',
  Desert: '沙漠',
}
export function labelOfPlace(place) {
  return PLACE_LABELS[place] ?? String(place ?? '')
}

/** 「3 分钟前」这样的相对时间。 */
export function relativeAge(seconds) {
  if (!Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}

/**
 * 解析模组 get_state 返回的文字（Observer.Build 的格式，见 BlindWhaleFarmer/Observer.cs）。
 * 认不出来时返回 null，调用方退回行动记录。
 */
export function parseGameState(text) {
  const source = String(text ?? '')
  if (!source) return null
  const time = /时间：(.+?)（[^）]*），天气：([^，\n]+)，明天天气：([^\n]+)/.exec(source)
  const money = /金钱：(\d+)g\s+体力：(\d+)\/(\d+)(?:（[^）]*）)?\s+生命：(\d+)\/(\d+)\s+今日运气：([+-]?[\d.]+)/.exec(source)
  if (!time && !money) return null
  const state = {
    stamp: time ? parseStamp(time[1]) : null,
    stampText: time ? time[1].trim() : '',
    weather: time ? time[2].trim() : '',
    tomorrowWeather: time ? time[3].trim() : '',
    money: money ? Number(money[1]) : null,
    energy: money ? Number(money[2]) : null,
    energyMax: money ? Number(money[3]) : null,
    health: money ? Number(money[4]) : null,
    healthMax: money ? Number(money[5]) : null,
    luck: money ? money[6] : '',
  }
  const place = /地点：([^（\n]+)（([^）]+)）/.exec(source)
  if (place) {
    state.location = place[1].trim()
    state.locationName = place[2].trim()
    state.locationLabel = labelOfPlace(state.location) || state.locationName
  }
  const pos = /你站在 \((\d+),(\d+)\)/.exec(source)
  if (pos) {
    state.x = Number(pos[1])
    state.y = Number(pos[2])
  }
  const bag = /背包空位：(\d+) 个（共 (\d+) 格）/.exec(source)
  if (bag) {
    state.freeSlots = Number(bag[1])
    state.slotTotal = Number(bag[2])
    state.usedSlots = state.slotTotal - state.freeSlots
  }
  const menu = /## 当前界面\r?\n([^\n]+)/.exec(source)
  if (menu) state.menu = menu[1].trim().replace(/^-\s*/, '')
  return state
}

/**
 * 「她此刻有多不想玩」的参考值（0–100）。只看最近三天，越近权重越大；
 * 兴奋（还想不想接着干）比心情重，另外算一点兴奋的趋势。
 * 只显示，不执行——停不停是她自己定的事。
 */
export function notWantToPlayTrend(rows, window = 3) {
  const pts = (rows ?? []).filter((r) => r && r.mood !== null && r.excite !== null).slice(-window)
  if (pts.length === 0) return null
  const weights = pts.length === 3 ? [0.1, 0.25, 0.65] : pts.length === 2 ? [0.3, 0.7] : [1]
  let score = 0
  pts.forEach((row, i) => {
    const mood = Math.min(100, Math.max(0, row.mood)) / 100
    const excite = Math.min(100, Math.max(0, row.excite)) / 100
    score += weights[i] * (0.45 * (1 - mood) + 0.55 * (1 - excite))
  })
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  if (prev) score += (prev.excite - last.excite) / 100 * 0.3
  return Math.round(Math.min(1, Math.max(0, score)) * 100)
}

/**
 * 表落在游戏后面时，两处共用的判断：差几天、今天哪一天、表里最后一行是哪天。
 * 差 0 天、负数（表超前，比如她提前记了明天）或没有基线时返回 null —— 不提醒。
 */
function moodGapParts(mood, stamp) {
  const gap = moodDayGap(mood?.latest, stamp)
  if (!stamp || !gap || gap <= 0) return null
  return {
    gap,
    today: `${stamp.seasonName} ${stamp.day} 日`,
    latest: mood?.latest?.label ?? '空',
    file: mood?.file ?? '',
  }
}

/**
 * get_state 末尾那句【待记】：表落在游戏后面时提醒补数。
 * 差 0 天不出现，不天天念；没基线也不念（表里一条数都没有时先让她自己起头）。
 */
export function moodStateNotice(mood, stamp) {
  const g = moodGapParts(mood, stamp)
  if (!g) return ''
  return [
    `【待记】表还停在 ${g.latest}，游戏里已是 ${g.today}（差 ${g.gap} 天）。补上再接着玩：`,
    `| ${g.today} | 心情 | 兴奋 | 拐点（哪一刻最想停 / 哪一刻又想接着） |`,
    `那天就算什么都没干，两个数也得给——写「—」不算记。表在 ${g.file}`,
    '今天这行必须写（不写 sleep 会被拦住）；中间漏掉那几天还记得就补，记不清就算了，别倒着编。',
  ].join('\n')
}

/**
 * sleep 前拦人的那段话：今天这行没记就不让睡。
 * stampText 传游戏自己那串日期原文（`第1年夏8日 06:00`），让人一眼看出是哪天，不用信我的换算。
 */
export function moodSleepBlock(mood, stamp, stampText = '') {
  const g = moodGapParts(mood, stamp)
  if (!g) return ''
  const now = stampText || `${stamp.label} ${stamp.time}`
  return [
    `今天（${g.today}）的心情那行还没记。补上再睡：`,
    '',
    `游戏里现在：${now}；表里最后一行是 ${g.latest}。`,
    '',
    `| ${g.today} | 心情 | 兴奋 | 拐点（哪一刻最想停 / 哪一刻又想接着） |`,
    '',
    `那天就算什么都没干，两个数也得给——反正总有个心情。写「—」不算记，表在 ${g.file}`,
    '记完再 action="sleep" 一次。',
  ].join('\n')
}

/**
 * 给 get_state 末尾附的那段：最近几天心情/兴奋 + 不想玩参考值 + 收工路。
 * 没有数据时返回空串；只有一天就照实写一天；趋势往下只给事实，不替她决定。
 */
export function moodAdvice(rows) {
  const pts = (rows ?? []).filter((r) => r && r.mood !== null && r.excite !== null)
  if (pts.length === 0) return ''
  const recent = pts.slice(-3)
  const label = recent.length === 1 ? '最近一天' : recent.length === 2 ? '最近两天' : '最近三天'
  const reference = notWantToPlayTrend(pts)
  const lines = [
    `【心情】${label} ${recent.map((row) => row.mood).join(' / ')} · 兴奋 ${recent.map((row) => row.excite).join(' / ')}`,
    `【参考】不想玩 ≈ ${reference === null ? '—' : reference}%（只显示，不执行）`,
  ]
  const earlier = pts.slice(0, Math.max(0, pts.length - 3))
  const earlierReference = earlier.length ? notWantToPlayTrend(earlier) : null
  const referenceRising = reference !== null && earlierReference !== null && reference - earlierReference >= 15
  const moodFalling = recent.length >= 3 && recent[0].mood > recent[1].mood && recent[1].mood > recent[2].mood
  if (referenceRising || moodFalling) lines.push('这几天在往下走。停不停你自己定 —— 想停就 sleep 再 close。')
  lines.push('想收工：action="sleep" 睡完再 action="close"。')
  return lines.join('\n')
}
