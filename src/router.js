const { AgentLoop } = require('agent-loop')
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible')
const { z } = require('zod')
const axios = require('axios')
const ncm = require('./ncm')
const state = require('./state')
const context = require('./context')

const SIMPLE_COMMANDS = {
  '下一首': 'next', '跳过': 'next', 'skip': 'next', 'next': 'next',
  '上一首': 'prev', 'prev': 'prev',
  '暂停': 'pause', 'pause': 'pause',
  '继续': 'resume', 'resume': 'resume',
  '停': 'pause', '停止': 'pause'
}

// Layer 1: Intent classifier schema
const INTENT_SCHEMA = z.object({
  intent: z.enum(['chat', 'recommend']).describe('chat=闲聊表达感受，recommend=想要听歌或换歌')
})

// Layer 2a: Chat response schema (no songs)
const CHAT_SCHEMA = z.object({
  say: z.string().describe('DJ的回应')
})

// Layer 2b: Music recommendation schema
const RECOMMEND_SCHEMA = z.object({
  say: z.string().describe('DJ说的话'),
  play: z.array(z.string()).describe('搜索关键词列表，如["艺人名", "歌名 歌手"]')
})

let _agent = null
let _weatherCache = null

function getLLM() {
  const cfg = state.getPrefs('llm_config') || {}
  const baseURL = (cfg.url || 'https://api.deepseek.com').replace(/\/$/, '')
  const apiKey = cfg.apiKey || ''
  const model = cfg.model || 'deepseek-chat'
  if (!apiKey) throw new Error('API Key 未设置，请在设置页面配置 LLM API Key')
  return createOpenAICompatible({
    name: 'deepseek', baseURL, apiKey,
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
}

function getAgent() {
  if (_agent) return _agent
  const llm = getLLM()
  const cfg = state.getPrefs('llm_config') || {}
  const model = cfg.model || 'deepseek-chat'

  _agent = new AgentLoop({
    llm: llm(model),
    systemPrompt: '',
    memory: { windowSize: 10 },
    maxSteps: 6,
    onStep: (step) => {
      if (step.toolCalls.length) console.log('[Agent] tools:', step.toolCalls.map(t => t.name))
    }
  })

  _agent
    .use('get_weather', {
      description: '获取当前天气信息',
      schema: z.object({}),
      execute: async () => {
        const now = Date.now()
        if (_weatherCache && now - _weatherCache.ts < 10 * 60 * 1000) return _weatherCache.data
        try {
          const cfg = state.getPrefs('llm_config') || {}
          const city = cfg.weatherCity || 'Shanghai'
          const resp = await axios.get('https://wttr.in/' + city + '?format=3', { timeout: 4000 })
          _weatherCache = { data: resp.data.trim(), ts: now }
          return _weatherCache.data
        } catch { return '天气获取失败' }
      }
    })
    .use('get_now_playing', {
      description: '获取当前正在播放的歌曲',
      schema: z.object({}),
      execute: async () => {
        const song = state.getNowPlaying()
        if (!song) return null
        return { ...song, story: state.getPrefs('story_' + song.id) || null }
      }
    })
    .use('get_play_history', {
      description: '获取最近播放记录',
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

function resetAgent() { _agent = null }

async function handle(input) {
  const trimmed = input.trim()
  const cmd = SIMPLE_COMMANDS[trimmed.toLowerCase()]
  if (cmd) return { type: 'command', action: cmd }
  return handleWithAgent(trimmed)
}

// Layer 1: Classify intent
async function classifyIntent(input, systemPrompt) {
  const llm = getLLM()
  const cfg = state.getPrefs('llm_config') || {}
  const agent = new AgentLoop({
    llm: llm(cfg.model || 'deepseek-chat'),
    systemPrompt,
    memory: { windowSize: 3 },
    maxSteps: 1
  })
  const result = await agent.run(
    '用户说：' + input + '\n判断意图：chat（闲聊/表达感受）还是 recommend（想听歌/换歌）？',
    { outputSchema: INTENT_SCHEMA }
  )
  return result.intent
}

async function resolveSongs(queries) {
  const songs = []
  for (const q of (queries || []).slice(0, 5)) {
    console.log('[Router] searching:', q)
    let results = await ncm.search(q, 1)
    if (results.length === 0) {
      const fb = q.replace(/[《》「」『』【】]/g, ' ').replace(/\s+/g, ' ').trim()
      if (fb !== q) results = await ncm.search(fb, 1)
    }
    if (results.length > 0) {
      const song = results[0]
      const url = await ncm.getSongUrl(song.id)
      songs.push({ ...song, url: url || null })
      console.log('[Router] found:', song.title, '—', song.artist)
    } else {
      console.log('[Router] not found:', q)
    }
  }
  console.log('[Router] total songs resolved:', songs.length)
  return songs
}

// Layer 2: Route based on intent
async function handleWithAgent(input) {
  state.addMessage('user', input)

  const nowPlaying = state.getNowPlaying()
  const storyText = nowPlaying ? (state.getPrefs('story_' + nowPlaying.id) || null) : null
  const { systemPrompt } = context.assemble(input, nowPlaying, storyText)

  // Layer 1: Intent classification
  const intent = await classifyIntent(input, systemPrompt)
  console.log('[Router] intent:', intent)

  if (intent === 'chat') {
    // Layer 2a: Chat — just respond, no songs
    const cfg = state.getPrefs('llm_config') || {}
    const llm = getLLM()
    const chatAgent = new AgentLoop({
      llm: llm(cfg.model || 'deepseek-chat'),
      systemPrompt,
      memory: { windowSize: 3 },
      maxSteps: 1
    })
    const result = await chatAgent.run('用户说：' + input + '\n闲聊回应，不推荐歌曲。', { outputSchema: CHAT_SCHEMA })
    state.addMessage('assistant', result.say)
    return { type: 'dj-response', say: result.say, songs: [], reason: '', segue: '' }
  }

  // Layer 2b: Recommend — full agent with tools + song resolution
  const agent = getAgent()
  const plan = await agent.run(input, {
    systemPromptOverride: systemPrompt,
    outputSchema: RECOMMEND_SCHEMA
  })

  state.addMessage('assistant', plan.say)

  const songs = await resolveSongs(plan.play)
  if (songs.length > 0) {
    state.clearQueue()
    state.enqueue(songs)
  }

  return { type: 'dj-response', say: plan.say, songs, reason: '', segue: '' }
}

module.exports = { handle, resetAgent }
