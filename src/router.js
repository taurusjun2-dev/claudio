const { AgentLoop } = require('agent-loop')
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible')
const { z } = require('zod')
const ncm = require('./ncm')
const state = require('./state')
const context = require('./context')

const SIMPLE_COMMANDS = {
  '\u4e0b\u4e00\u9996': 'next', '\u8df3\u8fc7': 'next', 'skip': 'next', 'next': 'next',
  '\u6682\u505c': 'pause', 'pause': 'pause',
  '\u7ee7\u7eed': 'resume', 'resume': 'resume',
  '\u505c': 'pause', '\u505c\u6b62': 'pause'
}

let _agent = null
let _queueCleared = false

function getAgent() {
  if (_agent) return _agent

  const cfg = state.getPrefs('llm_config') || {}
  const baseURL = (cfg.url || 'https://api.deepseek.com').replace(/\/$/, '')
  const apiKey = cfg.apiKey || ''
  const model = cfg.model || 'deepseek-chat'

  if (!apiKey) throw new Error('API Key \u672a\u8bbe\u7f6e\uff0c\u8bf7\u5728\u8bbe\u7f6e\u9875\u9762\u914d\u7f6e LLM API Key')

  const openai = createOpenAICompatible({
    name: 'deepseek',
    baseURL,
    apiKey,
    fetch: async (url, init) => {
      console.log('[Router] calling:', url)
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
    memory: { windowSize: 1 },
    maxSteps: 8,
    onStep: (step) => {
      if (step.toolCalls.length) {
        console.log('[Agent] tools:', step.toolCalls.map(t => t.name))
      }
    }
  })

  _agent
    .use('search_and_enqueue', {
      description: '\u641c\u7d22\u97f3\u4e50\u5e76\u52a0\u5165\u64ad\u653e\u961f\u5217\uff0c\u4f20\u5165\u6b4c\u540d\u6216\u201c\u6b4c\u540d \u6b4c\u624b\u201d\u5217\u8868',
      schema: z.object({
        queries: z.array(z.string()).describe('\u641c\u7d22\u5173\u952e\u8bcd\u5217\u8868')
      }),
      execute: async ({ queries }) => {
        const songs = []
        for (const q of queries.slice(0, 5)) {
          const results = await ncm.search(q, 1)
          if (results.length > 0) {
            const song = results[0]
            const url = await ncm.getSongUrl(song.id)
            songs.push({ ...song, url: url || null })
          }
        }
        if (songs.length > 0) {
          if (!_queueCleared) { state.clearQueue(); _queueCleared = true }
          state.enqueue(songs)
        }
        return { queued: songs.map(s => s.title + ' \u2014 ' + s.artist) }
      }
    })
    .use('get_now_playing', {
      description: '\u83b7\u53d6\u5f53\u524d\u6b63\u5728\u64ad\u653e\u7684\u6b4c\u66f2\u4fe1\u606f',
      schema: z.object({}),
      execute: async () => state.getNowPlaying() || null
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
  _queueCleared = false
  state.addMessage('user', input)

  const nowPlaying = state.getNowPlaying()
  const storyText = nowPlaying ? (state.getPrefs('story_' + nowPlaying.id) || null) : null
  const { systemPrompt, userPrompt } = await context.assemble(input, nowPlaying, storyText)

  const agent = getAgent()
  const say = await agent.run(userPrompt, systemPrompt)

  state.addMessage('assistant', say)

  return {
    type: 'dj-response',
    say,
    songs: state.getQueue(),
    reason: '',
    segue: ''
  }
}

module.exports = { handle, resetAgent }
