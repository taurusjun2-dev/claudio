const fs = require('fs')
const path = require('path')
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

function getCurrentTime() {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
  return `当前时间：${dayOfWeek} ${timeStr}`
}

function assemble(userInput) {
  const systemPrompt = [
    getPersona(),
    '---\n## 用户语料\n' + getUserTaste(),
    '---\n## 当前时间\n' + getCurrentTime()
  ].join('\n\n')

  const userPrompt = [
    '## 用户输入\n' + userInput,
    '---\n以 JSON 格式回复：{"say":"DJ说的话（简体中文，1-2句，只说情绪氛围）","play":["歌名 歌手",...]}\nplay 为空数组表示不推荐新歌。'
  ].join('\n\n')

  return { systemPrompt, userPrompt }
}

module.exports = { assemble }
