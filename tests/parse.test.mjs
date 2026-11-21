// 解析测试：get_state 文字、心情表、概率、行动记录。
//   node tests/parse.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  labelOfPlace,
  latestMood,
  moodAdvice,
  moodSleepBlock,
  moodStateNotice,
  notWantToPlayTrend,
  parseGameState,
  parseMoodTable,
  parseTranscript,
  parseStamp,
  relativeAge,
} from '../lib/parse.js'

const GAME_STATE = `## 基本状态
时间：第1年夏2日 06:00（周一），天气：晴，明天天气：下雨
金钱：2072g  体力：203/270  生命：97/105  今日运气：+0.05
技能等级：耕种2 采矿1 采集1 钓鱼1 战斗0

## 当前界面
无（可以自由行动）

## 位置
地点：Farm（农场），室外，地图大小 80x65
你站在 (78,17)，面朝南

## 背包（序号: 物品）
1: 锄头
背包空位：12 个（共 24 格）
`

test('parseGameState 解析时间/天气/钱/体力/地点/背包/界面', () => {
  const state = parseGameState(GAME_STATE)
  assert.equal(state.stampText, '第1年夏2日 06:00')
  assert.equal(state.stamp.seasonName, '夏')
  assert.equal(state.stamp.day, 2)
  assert.equal(state.stamp.time, '06:00')
  assert.equal(state.weather, '晴')
  assert.equal(state.tomorrowWeather, '下雨')
  assert.equal(state.money, 2072)
  assert.equal(state.energy, 203)
  assert.equal(state.energyMax, 270)
  assert.equal(state.health, 97)
  assert.equal(state.luck, '+0.05')
  assert.equal(state.location, 'Farm')
  assert.equal(state.locationName, '农场')
  assert.equal(state.locationLabel, '农场')
  assert.equal(state.x, 78)
  assert.equal(state.y, 17)
  assert.equal(state.freeSlots, 12)
  assert.equal(state.slotTotal, 24)
  assert.equal(state.usedSlots, 12)
  assert.equal(state.menu, '无（可以自由行动）')
})

test('parseGameState 对不认识的文字返回 null', () => {
  assert.equal(parseGameState('随便什么文字'), null)
  assert.equal(parseGameState(''), null)
})

test('精力耗尽时体力行也认', () => {
  const state = parseGameState('时间：第1年春1日 06:00（周一），天气：晴，明天天气：晴\n金钱：500g  体力：0/270（筋疲力尽：体力≤0 时跑不动）  生命：100/100  今日运气：0.00')
  assert.equal(state.energy, 0)
  assert.equal(state.energyMax, 270)
})

const NOTES = [
  '最后更新：2026-11-15 · 第 1 年 夏 1 日 11:50',
  '| 春 1 日 | 65 | 70 | 种下 15 株 |',
  '| 春 20 日 | 38 | 35 | 最想停的一天 |',
  '| 春 22 日 | — | — | 没玩 |',
  '| 夏 1 日 | 30 | 50 | 枯苗最闷 |',
].join('\n')

test('parseMoodTable + latestMood 跳过没记数的日子', () => {
  const { rows, lastUpdated } = parseMoodTable(NOTES)
  assert.equal(rows.length, 4)
  assert.equal(rows[2].mood, null)
  assert.match(lastUpdated, /2026-11-15/)
  assert.equal(latestMood(rows).label, '夏 1 日')
  assert.equal(latestMood([]), null)
})

test('notWantToPlayTrend 用最近三天，越近权重越大', () => {
  const rows = [
    { mood: 85, excite: 88 },
    { mood: 30, excite: 35 },
    { mood: 35, excite: 40 },
  ]
  const score = notWantToPlayTrend(rows)
  assert.ok(score >= 55 && score <= 75, '分数应该在偏不想玩的区间：' + score)
  assert.equal(notWantToPlayTrend([{ mood: 100, excite: 100 }]), 0)
  assert.equal(notWantToPlayTrend([]), null)
})

test('行动记录解析（退回用）', () => {
  const text = [
    '[第1年夏1日 10:10] [MCP] buy({"count":34}) → 成功：买了 34 个 蓝莓种子，剩余 2072g',
    '[第1年夏1日 11:50] [MCP] water_crops({}) → 成功：浇了 34 株，剩余体力 203',
  ].join('\n')
  const parsed = parseTranscript(text)
  assert.equal(parsed.total, 2)
  assert.equal(parsed.latest.tool, 'water_crops')
  assert.equal(parsed.entries[0].stamp.time, '10:10')
  assert.equal(parsed.entries[0].label, '买东西')
})

test('地点和相对时间', () => {
  assert.equal(labelOfPlace('FarmHouse'), '农舍')
  assert.equal(labelOfPlace('Weird'), 'Weird')
  assert.equal(relativeAge(90), '1 分钟前')
  assert.equal(relativeAge(null), '')
})

test('get_state 末尾的心情摘要', () => {
  const row = (mood, excite) => ({ mood, excite })
  assert.equal(moodAdvice([]), '', '没数据就整段不出现')
  assert.equal(moodAdvice(undefined), '')

  const one = moodAdvice([row(30, 40)])
  assert.match(one, /【心情】最近一天 30 · 兴奋 40/)
  assert.match(one, /【参考】不想玩 ≈ 65%/)
  assert.match(one, /想收工：action="sleep" 睡完再 action="close"/)
  assert.ok(!one.includes('这几天在往下走'), '一天数据不判趋势')

  const falling = moodAdvice([row(80, 50), row(60, 50), row(40, 50)])
  assert.match(falling, /这几天在往下走。停不停你自己定/)
  assert.ok(!falling.includes('建议'), '不能替她拿主意')

  const stable = moodAdvice([row(50, 50), row(50, 50), row(50, 50)])
  assert.ok(!stable.includes('这几天在往下走'))

  // 心情没连跌，但参考值比前一段高 15 以上
  const rising = moodAdvice([row(90, 90), row(90, 90), row(90, 90), row(40, 40), row(40, 40), row(40, 40)])
  assert.match(rising, /这几天在往下走/)
})

// 心情表落后游戏时的那两句提醒：差几天、提不提、说不说清是哪天。
// 11-17 出过一次「报夏 4 日、实际夏 8 日」，所以这里专门盯日子。
// 形状照 readMood() 的返回值来（latest 里带 season / day 数字，label 给人看）。
const moodAt = (seasonName, season, day) => ({
  latest: { label: `${seasonName} ${day} 日`, seasonName, season, day },
  file: '笔记\\星露谷笔记.md',
})

test('【待记】：差 0 天不出现，差几天说几天，说清表停在哪', () => {
  const mood = moodAt('夏', 1, 3)
  assert.equal(moodStateNotice(mood, parseStamp('第1年夏3日 06:00')), '', '当天记过就不念')
  assert.equal(moodStateNotice(mood, null), '', '没游戏时间不念')
  assert.equal(moodStateNotice({ latest: null }, parseStamp('第1年夏8日 06:00')), '', '没基线不念')

  const notice = moodStateNotice(mood, parseStamp('第1年夏8日 06:00'))
  assert.match(notice, /^【待记】表还停在 夏 3 日，游戏里已是 夏 8 日（差 5 天）/)
  assert.match(notice, /\| 夏 8 日 \| 心情 \| 兴奋 \|/)
  assert.match(notice, /写「—」不算记/)
  assert.match(notice, /别倒着编/)

  // 表记到了未来那天（她提前写），不提醒也不报错
  assert.equal(moodStateNotice(moodAt('夏', 1, 8), parseStamp('第1年夏4日 06:00')), '')
})

test('sleep 拦人：日子取「时间：」那一行，不用整段里的第一个日期', () => {
  const mood = moodAt('夏', 1, 3)
  // 正文前面混进一条旧记录（11-17 就是这么咬到夏 4 的）
  const dirty = '（上一轮：[第1年夏4日 06:00] 出门）\n' + GAME_STATE.replace('夏2日', '夏8日')
  const state = parseGameState(dirty)
  assert.equal(state.stamp.day, 8, '锚定「时间：」那行，不受前面旧记录影响')

  const block = moodSleepBlock(mood, state.stamp, state.stampText)
  assert.match(block, /^今天（夏 8 日）的心情那行还没记/)
  assert.match(block, /游戏里现在：第1年夏8日 06:00；表里最后一行是 夏 3 日/)
  assert.match(block, /记完再 action="sleep" 一次/)
  assert.ok(!/夏 4 日/.test(block), '不能报成前面那条旧记录的日子')

  assert.equal(moodSleepBlock(moodAt('夏', 1, 8), state.stamp), '', '记过就放行')
  assert.equal(moodSleepBlock(mood, null), '', '拿不到日期就放行，别拿没数据当没记')
})
