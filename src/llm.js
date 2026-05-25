const axios = require('axios')
const state = require('./state')

function getConfig() {
  const saved = state.getPrefs('llm_config') || {}
  return {
    baseUrl: saved.url || 'https://api.deepseek.com',
    apiKey: saved.apiKey || '',
    model: saved.model || 'deepseek-chat',
    maxTokens: saved.maxTokens || 4000
  }
}

async function chat(messages, jsonMode = false) {
  const { baseUrl, apiKey, model, maxTokens } = getConfig()
  if (!apiKey) throw new Error('API Key 未设置，请在设置页面配置 LLM API Key')

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const resp = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
