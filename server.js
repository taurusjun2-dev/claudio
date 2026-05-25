const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')

const router = require('./src/router')
const state = require('./src/state')
const scheduler = require('./src/scheduler')

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

  app.post('/api/dequeue', (req, res) => {
    const song = state.dequeue()
    res.json({ song })
  })

  app.get('/api/settings', (req, res) => {
    const settings = state.getPrefs('llm_config') || {}
    res.json({
      url: settings.url || 'https://api.deepseek.com',
      model: settings.model || 'deepseek-chat',
      apiKey: settings.apiKey ? settings.apiKey.slice(-4).padStart(settings.apiKey.length, '•') : '',
      maxTokens: settings.maxTokens || 4000,
      weatherCity: settings.weatherCity || 'Shanghai'
    })
  })

  app.post('/api/settings', (req, res) => {
    const { url, model, apiKey, maxTokens, weatherCity } = req.body
    const current = state.getPrefs('llm_config') || {}
    const updated = {
      url: url || current.url || 'https://api.deepseek.com',
      model: model || current.model || 'deepseek-chat',
      apiKey: apiKey || current.apiKey || '',
      maxTokens: maxTokens || current.maxTokens || 4000,
      weatherCity: weatherCity || current.weatherCity || 'Shanghai'
    }
    state.setPrefs('llm_config', updated)
    res.json({ ok: true })
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
