require('dotenv').config()
const axios = require('axios')

const BASE_URL = process.env.LITELLM_URL
const API_KEY = process.env.LITELLM_API_KEY
const MODEL = process.env.LITELLM_MODEL || 'deepseek-v4-flash'
const MAX_TOKENS = parseInt(process.env.LITELLM_MAX_TOKENS || '4000')

async function chat(messages, jsonMode = false) {
  const body = {
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.7
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const resp = await axios.post(`${BASE_URL}/chat/completions`, body, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  return resp.data.choices[0].message.content
}

// Returns structured {say, play[], reason, segue}
async function think(systemPrompt, userPrompt) {
  const content = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], true)

  try {
    const parsed = JSON.parse(content)
    return {
      say: parsed.say || '',
      play: Array.isArray(parsed.play) ? parsed.play : [],
      reason: parsed.reason || '',
      segue: parsed.segue || ''
    }
  } catch (e) {
    console.error('[LLM] JSON parse failed, raw:', content.slice(0, 200))
    return { say: content, play: [], reason: '', segue: '' }
  }
}

module.exports = { think, chat }
