const { AgentLoop } = require('agent-loop')
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible')
const { z } = require('zod')
const axios = require('axios')
const ncm = require('./ncm')
const state = require('./state')
const context = require('./context')

const SIMPLE_COMMANDS = {
  '下一首': 'next', '跳过': 'next', 'skip': 'next', 'next': 'next',
  '暂停': 'pause', 'pause': 'pause',
  '继续': 'resume', 'resume': 'resume',
  '停': 'pause', '停止': 'pause'
}

const DJ_SCHEMA = z.object({
  say: z.string().describe('DJ说的话，简体中文，1-2句，只说情绪氛围'),
  play: z.array(z.string()).describe('要播放的歌曲列表，格式"歌名 歌手"，不推荐新歌时为空数组')
})

let _agent = null

function getAgent() {
  if (_agent) return _agent

  const cfg = state.getPrefs('llm_config') || {}
  const baseURL = (cfg.url || 'https://api.deepseek.com').replace(/\/$/, '')
  const apiKey = cfg.apiKey || ''
  const model = cfg.model || 'deepseek-chat'

  if (!apiKey) throw new Error('API Key 未设置，请在设置页面配置 LLM API Key')

  const openai = createOpenAICompatible({
    name: 'deepseek',
    baseURL,
    apiKey,
    fetch: async (url, init) => {
      if (init && init.body) {
        try {
          const body = JSON.parse(init.body)
          body.thinking = { type: 'disabled' }
          init = { ...init, body: JSON.stringify(body) }
        } catch {}
      }
      return fetch(url, init)
    }
  })

  _agent = new AgentLoop({
    llm: openai(model),
    systemPrompt: '',
    memory: { windowSize: 10 },
    maxSteps: 6,
    onStep: (step) => {
      if (step.toolCalls.length) {
        console.log('[Agent] tools:', step.toolCalls.map(t => t.name))
      }
    }
  })

  // Data query tools only
  _agent
    .use('get_weather', {
      description: '获取当前天气信息',
      schema: z.object({}),
      execute: async () => {
        try {
          const cfg = state.getPrefs('llm_config') || {}
          const city = cfg.weatherCity || 'Shanghai'
          const resp = await axios.get(`https://wttr.in/${city}?format=3`, { timeout: 4000 })
          return resp.data.trim()
        } catch { return '天气获取失败' }
      }
    })
    .use('get_now_playing', {
      description: '获取当前正在播放的歌曲',
      schema: z.object({}),
      execute: async () => state.getNowPlaying() || null
    })
    .use('get_play_history', {
      description: '获取最近播放记录，用于避免重复推荐',
      schema: z.object({}),
      execute: async () => state.getRecentPlays(10)
    })
    .use('get_queue', {
      description: '获取当前播放队列',
      schema: z.object({}),
      execute: async () => state.getQueue()
    })
    .use('get_recent_messages', {
      description: '获取最近的对话记录',
      schema: z.object({}),
      execute: async () => state.getRecentMessages(6)
    })

  return _agent
}

function resetAgent() {
  _agent = null
}

async function handle(input) {
  const trimmed = input.trim()
  const cmd = SIMPLE_COMMANDS[trimmed.toLowerCase()]
  if (cmd) return { type: 'command', action: cmd }
  return handleWithAgent(trimmed)
}

async function handleWithAgent(input) {
  state.addMessage('user', input)

  const { systemPrompt, userPrompt } = context.assemble(input)

  const agent = getAgent()
  const plan = await agent.run(userPrompt, {
    systemPromptOverride: systemPrompt,
    outputSchema: DJ_SCHEMA
  })

  state.addMessage('assistant', plan.say)

  // Resolve play[] via NCM → enqueue
  const songs = []
  for (const q of (plan.play || []).slice(0, 5)) {
    const results = await ncm.search(q, 1)
    if (results.length > 0) {
      const song = results[0]
      const url = await ncm.getSongUrl(song.id)
      songs.push({ ...song, url: url || null })
    }
  }
  if (songs.length > 0) {
    state.clearQueue()
    state.enqueue(songs)
  }

  return {
    type: 'dj-response',
    say: plan.say,
    songs: state.getQueue(),
    reason: '',
    segue: ''
  }
}

module.exports = { handle, resetAgent }
