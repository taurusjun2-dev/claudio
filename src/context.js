const fs = require('fs')
const path = require('path')
const axios = require('axios')
const state = require('./state')

const USER_DIR = path.join(__dirname, '../user')
const PROMPTS_DIR = path.join(__dirname, '../prompts')

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return '' }
}

function getPersona() {
  return readFile(path.join(PROMPTS_DIR, 'dj-persona.md'))
}

function getUserTaste() {
  return ['taste.md', 'routines.md', 'mood-rules.md']
    .map(f => {
      const c = readFile(path.join(USER_DIR, f))
      return c ? `### ${f}\n${c}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

async function getEnvironment() {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]

  let weather = '未知'
  try {
    const settings = state.getPrefs('llm_config') || {}
    const city = settings.weatherCity || 'Shanghai'
    const resp = await axios.get(`https://wttr.in/${city}?format=3`, { timeout: 4000 })
    weather = resp.data.trim()
  } catch { /* skip */ }

  return `时间：${dayOfWeek} ${timeStr}\n天气：${weather}`
}

function getMemory() {
  const plays = state.getRecentPlays(10)
  const msgs = state.getRecentMessages(6)

  const parts = []
  if (plays.length) {
    parts.push('最近播放：\n' + plays.map(p => `- ${p.artist} 《${p.title}》`).join('\n'))
  }
  if (msgs.length) {
    parts.push('最近对话：\n' + msgs.map(m => `${m.role === 'user' ? '用户' : 'DJ'}：${m.content}`).join('\n'))
  }
  return parts.join('\n\n') || '暂无记录'
}

function getExecutionContext() {
  const plan = state.getTodayPlan()
  const queue = state.getQueue()
  const parts = []
  if (plan) parts.push(`今日规划：${plan.reason || ''}`)
  if (queue.length) parts.push(`队列中：${queue.slice(0, 3).map(s => s.title).join('、')}`)
  return parts.join('\n') || '无'
}

async function assemble(userInput, nowPlaying = null, storyText = null) {
  const env = await getEnvironment()

  // Inject nowPlaying context into system prompt so LLM always knows what's playing
  const nowPlayingCtx = nowPlaying
    ? '\n\n## 当前播放\n正在播放：' + nowPlaying.title + ' — ' + nowPlaying.artist
      + (storyText ? '\n刚才介绍了：' + storyText : '')
      + '\n\n**重要规则**：如果用户是在对当前这首歌表达感受或感想（如"真好听"、"好喜欢"、"感动"、"太棒了"等），不要换歌，play 数组保持为空，只用 say 回应他的情绪。只有用户明确要求听其他歌时才推荐新歌。'
    : ''

  const systemPrompt = [
    getPersona() + nowPlayingCtx,
    '---\n## 用户语料\n' + getUserTaste(),
    '---\n## 当前环境\n' + env
  ].join('\n\n')

  const userPrompt = [
    '## 已播记忆\n' + getMemory(),
    '---\n## 用户输入\n' + userInput,
    '---\n## 执行上下文\n' + getExecutionContext(),
    '---\n用简体中文回复，一两句话，说此刻的情绪和氛围。不要介绍歌曲、不要描述歌词、不要解释选曲理由。不要用"选了X首"等开场白，不要汇报操作结果。'
  ].join('\n\n')

  return { systemPrompt, userPrompt }
}

module.exports = { assemble }
