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

async function assemble(userInput) {
  const env = await getEnvironment()

  const systemPrompt = [
    getPersona(),
    '---\n## 用户语料\n' + getUserTaste(),
    '---\n## 当前环境\n' + env
  ].join('\n\n')

  const userPrompt = [
    '## 已播记忆\n' + getMemory(),
    '---\n## 用户输入\n' + userInput,
    '---\n## 执行上下文\n' + getExecutionContext(),
    `---\n请以 JSON 格式回复：
{
  "say": "DJ 要说的话（中文，1-3句，自然有温度）",
  "play": ["歌名 - 歌手", ...],  // 每次推荐 3-5 首，构成一个连贯的小歌单
  "reason": "内部选曲理由（不展示给用户）",
  "segue": "下一首前的过渡语（可为空字符串）"
}`
  ].join('\n\n')

  return { systemPrompt, userPrompt }
}

module.exports = { assemble }
