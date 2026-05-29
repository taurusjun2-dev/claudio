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

function getDefaultTaste() {
  return {
    liked: readFile(path.join(USER_DIR, 'taste.md')),
    disliked: '',
    routines: readFile(path.join(USER_DIR, 'routines.md')),
    moodRules: readFile(path.join(USER_DIR, 'mood-rules.md'))
  }
}

function getUserTaste() {
  const profile = state.getPrefs('taste_profile')
  if (profile && profile.liked) {
    const parts = []
    if (profile.liked) parts.push('## 喜欢的风格\n' + profile.liked)
    if (profile.disliked) parts.push('## 不喜欢的\n' + profile.disliked)
    if (profile.routines) parts.push('## 日常节律\n' + profile.routines)
    if (profile.moodRules) parts.push('## 情绪规则\n' + profile.moodRules)
    return parts.join('\n\n')
  }
  // Fallback to files
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

function assemble(userInput, nowPlaying = null, storyText = null) {
  const nowPlayingCtx = nowPlaying
    ? '\n\n## 当前播放\n正在播放：' + nowPlaying.title + ' — ' + nowPlaying.artist
      + (storyText ? '\n详情页介绍了：' + storyText : '')
      + '\n\n重要：如果用户的输入与当前播放的歌曲或刚才的对话内容相关（询问歌曲细节、表达感受、基于介绍提问等），play 返回空数组，只用 say 回应。只有用户明确要换歌时才推荐新歌。'
    : ''

  const systemPrompt = [
    getPersona() + nowPlayingCtx,
    '---\n## 用户语料\n' + getUserTaste(),
    '---\n## 当前时间\n' + getCurrentTime()
  ].join('\n\n')

  const recentMsgs = state.getRecentMessages(6)
  const memoryCtx = recentMsgs.length
    ? recentMsgs.map(m => (m.role === 'user' ? '用户' : 'DJ') + '：' + m.content).join('\n')
    : '无'

  const userPrompt = [
    '## 最近对话\n' + memoryCtx,
    '---\n## 用户输入\n' + userInput,
    '---\n以 JSON 格式回复：{"say":"DJ说的话（简体中文，1-2句，只说情绪氛围）","play":["歌名 歌手",...]}\nplay 为空数组表示不推荐新歌。'
  ].join('\n\n')

  return { systemPrompt, userPrompt }
}

function assembleForScheduler(task) {
  const systemPrompt = [
    getPersona(),
    '---\n## 用户语料\n' + getUserTaste(),
    '---\n## 当前时间\n' + getCurrentTime()
  ].join('\n\n')

  const userPrompt = task + '\n\n以 JSON 格式回复：{"say":"","play":["歌名 歌手",...],"reason":"选曲理由"}'

  return { systemPrompt, userPrompt }
}

module.exports = { assemble, assembleForScheduler, getDefaultTaste }
