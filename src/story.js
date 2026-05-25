require('dotenv').config()
const { chat } = require('./llm')

async function generateStory(title, artist) {
  const prompt = `You are Claudio, a personal DJ with deep music knowledge.
You're now playing "${title}" by "${artist}".
Tell the story of this song in 4-6 sentences: its background, creation story, emotional meaning, or a fascinating detail.
Speak warmly, like a late-night radio host sharing something you genuinely love.
Use the listener's language naturally (mix of Chinese and English is fine).
Output JSON only: { "story": "full story text, sentences separated by periods/。" }`

  try {
    const content = await chat([{ role: 'user', content: prompt }], true)
    const parsed = JSON.parse(content)
    return parsed.story || ''
  } catch (e) {
    console.error('[Story] error:', e.message)
    return ''
  }
}

module.exports = { generateStory }
