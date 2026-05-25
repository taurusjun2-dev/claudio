const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')

const router = require('./src/router')
const state = require('./src/state')
const scheduler = require('./src/scheduler')
const { generateStory } = require('./src/story')

function createApp() {
  const app = express()
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/stream' })

  app.use(express.json())
  app.use(express.static(path.join(__dirname, 'pwa')))

  function broadcast(data) {
    const msg = JSON.stringify(data)
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg) })
  }

  state.setBroadcast(broadcast)

  app.post('/api/chat', async (req, res) => {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })
    try {
      const result = await router.handle(message)
      res.json(result)
      broadcast({ type: 'response', ...result })
    } catch (err) {
      console.error('[API] chat error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/now', (req, res) => res.json(state.getNowPlaying()))
  app.get('/api/next', (req, res) => res.json({ queue: state.getQueue() }))
  app.get('/api/taste', (req, res) => res.json(state.getPrefs()))
  app.get('/api/plan/today', (req, res) => res.json({ plan: state.getTodayPlan() }))

  app.post('/api/played', (req, res) => {
    const { song } = req.body
    if (song) state.setNowPlaying(song)
    res.json({ ok: true })
  })

  

app.post('/api/story', async (req, res) => {
  const { title, artist } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })
  try {
    const nowPlaying = require('./src/state').getNowPlaying()
    const songId = nowPlaying?.id || null
    const story = await generateStory(title, artist || '', songId)
    res.json({ story })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/dequeue', (req, res) => {
    const song = state.dequeue()
    res.json({ song })
  })

  app.get('/api/settings', (req, res) => {
    const settings = state.getPrefs('llm_config') || {}
    res.json({
      url: settings.url || 'https://api.deepseek.com',
      model: settings.model || 'deepseek-v4-flash',
      apiKey: settings.apiKey || '',
      maxTokens: settings.maxTokens || 4000,
      weatherCity: settings.weatherCity || 'Shanghai'
    })
  })

  app.post('/api/settings', (req, res) => {
    const { url, model, apiKey, maxTokens, weatherCity } = req.body
    const current = state.getPrefs('llm_config') || {}
    const updated = {
      url: (url !== undefined && url !== null) ? url : (current.url || 'https://api.deepseek.com'),
      model: (model !== undefined && model !== null) ? model : (current.model || 'deepseek-v4-flash'),
      apiKey: apiKey !== undefined && apiKey !== null ? apiKey : (current.apiKey || ''),
      maxTokens: maxTokens || current.maxTokens || 4000,
      weatherCity: weatherCity || current.weatherCity || 'Shanghai'
    }
    state.setPrefs('llm_config', updated)
    res.json({ ok: true })
  })

  app.post('/api/settings/test', async (req, res) => {
    try {
      const axios = require('axios')
      const { url, model, apiKey } = req.body
      const cfg = state.getPrefs('llm_config') || {}
      const testUrl = (url || cfg.url || '').replace(/\/$/, '')
      const testKey = apiKey || cfg.apiKey || ''
      const testModel = model || cfg.model || 'deepseek-chat'
      if (!testUrl || !testKey) return res.json({ ok: false, error: 'URL 或 API Key 为空' })
      await axios.post(testUrl + '/chat/completions', {
        model: testModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }, { headers: { Authorization: 'Bearer ' + testKey }, timeout: 10000 })
      res.json({ ok: true })
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message
      res.json({ ok: false, error: msg })
    }
  })

  wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'connected', now: state.getNowPlaying(), queue: state.getQueue() }))
    if (!state.getNowPlaying() && state.getQueue().length === 0) {
      router.handle('根据现在的时间和心情，推荐几首歌开始播放').catch(() => {})
    }
  })

  scheduler.init(broadcast)

  return { app, server, wss, broadcast }
}

module.exports = { createApp }
