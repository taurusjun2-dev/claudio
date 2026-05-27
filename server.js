const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')

const router = require('./src/router')
const state = require('./src/state')
const scheduler = require('./src/scheduler')
const { generateStory } = require('./src/story')
const { synthesize } = require('./src/tts')

function createApp() {
  const app = express()
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/stream' })

  app.use(express.json())
  app.use(express.static(path.join(__dirname, 'pwa')))
  app.use('/tts', express.static(
    global.__claudio_cache_path || path.join(__dirname, 'cache/tts')
  ))

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

  // Cached mood (refresh every 10 min)
  let _moodCache = { text: '', at: 0 }
  app.get('/api/mood', async (req, res) => {
    if (Date.now() - _moodCache.at < 600000) {
      return res.json({ mood: _moodCache.text })
    }
    try {
      const axios = require('axios')
      const cfg = state.getPrefs('llm_config') || {}
      const now = new Date()
      const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]
      const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      let weather = ''
      try {
        const city = cfg.weatherCity || 'Shanghai'
        const wr = await axios.get(`https://wttr.in/${city}?format=%C`, { timeout: 3000 })
        weather = wr.data.trim()
      } catch {}
      const prompt = `现在是${dayOfWeek} ${timeStr}，天气${weather || '未知'}。用一句中文（15字以内）描述此刻适合听歌的情绪氛围。不要加引号，不要解释。`
      const resp = await axios.post((cfg.url || 'https://api.deepseek.com') + '/chat/completions', {
        model: cfg.model || 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50, temperature: 0.9,
        thinking: { type: 'disabled' }
      }, { headers: { Authorization: 'Bearer ' + (cfg.apiKey || '') }, timeout: 8000 })
      const text = (resp.data.choices[0].message.content || '').trim()
      _moodCache = { text: text || '此刻，只需要一首好歌', at: Date.now() }
      res.json({ mood: _moodCache.text })
    } catch (e) {
      res.json({ mood: '此刻，只需要一首好歌' })
    }
  })

  app.post('/api/played', (req, res) => {
    const { song } = req.body
    if (song) state.setNowPlaying(song)
    res.json({ ok: true })
  })

  app.post('/api/dequeue', (req, res) => {
    const song = state.dequeue()
    res.json({ song })
  })

  app.post('/api/tts', async (req, res) => {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text required' })
    try {
      const cfg = state.getPrefs('llm_config') || {}
      const url = await synthesize(text, cfg.voice || '')
      res.json({ url })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/story', async (req, res) => {
    const { title, artist } = req.body
    if (!title) return res.status(400).json({ error: 'title required' })
    try {
      const nowPlaying = state.getNowPlaying()
      const songId = nowPlaying?.id || null
      const story = await generateStory(title, artist || '', songId)
      res.json({ story })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/settings', (req, res) => {
    const settings = state.getPrefs('llm_config') || {}
    res.json({
      url: settings.url || 'https://api.deepseek.com',
      model: settings.model || 'deepseek-v4-flash',
      apiKey: settings.apiKey || '',
      maxTokens: settings.maxTokens || 4000,
      weatherCity: settings.weatherCity || 'Shanghai',
      voice: settings.voice || ''
    })
  })

  app.post('/api/settings', (req, res) => {
    const { url, model, apiKey, maxTokens, weatherCity, voice } = req.body
    const current = state.getPrefs('llm_config') || {}
    const updated = {
      url: (url !== undefined && url !== null) ? url : (current.url || 'https://api.deepseek.com'),
      model: (model !== undefined && model !== null) ? model : (current.model || 'deepseek-v4-flash'),
      apiKey: apiKey !== undefined && apiKey !== null ? apiKey : (current.apiKey || ''),
      maxTokens: maxTokens || current.maxTokens || 4000,
      weatherCity: weatherCity || current.weatherCity || 'Shanghai',
      voice: voice !== undefined && voice !== null ? voice : (current.voice || '')
    }
    state.setPrefs('llm_config', updated)
    router.resetAgent()
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
      router.handle('根据现在的时间和心情，推荐几首歌开始播放').catch(err => {
        console.error('[Auto] initial recommendation failed:', err.message)
      })
    }
  })

  scheduler.init(broadcast)

  return { app, server, wss, broadcast }
}

module.exports = { createApp }
