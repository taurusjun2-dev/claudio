const { chat } = require('./llm')
const state = require('./state')

async function generateStory(title, artist, songId = null) {
  const prompt = `你是 Claudio，私人 DJ。正在播放「${title}」by ${artist}。
用1-3句中文，轻声说一个关于这首歌的细节或感受——语气缓慢，像是随口说给在旁边听音乐的朋友。
不抢戏，不打扰，点到即止。
仅输出 JSON：{ "story": "1-3句话，句子以。结尾" }`

  try {
    const content = await chat([{ role: 'user', content: prompt }], true)
    const parsed = JSON.parse(content)
    const s = parsed.story || ''
    if (s && songId) state.setPrefs('story_' + songId, s)
    return s
  } catch (e) {
    console.error('[Story] error:', e.message)
    return ''
  }
}

module.exports = { generateStory }
