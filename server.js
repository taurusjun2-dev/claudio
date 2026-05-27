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

  app.get('/api/mood', async (req, res) => {
    const now = new Date()
    const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]
    const hour = now.getHours()
    const month = now.getMonth() + 1

    let weather = ''
    try {
      const axios = require('axios')
      const cfg = state.getPrefs('llm_config') || {}
      const city = cfg.weatherCity || 'Shanghai'
      const resp = await axios.get(`https://wttr.in/${city}?format=%C`, { timeout: 3000 })
      weather = resp.data.trim()
    } catch {}

    let mood = ''
    if (dayOfWeek === '周五' && hour >= 17) mood = '周五的夜晚，期待释放一周的疲惫'
    else if (dayOfWeek === '周六') mood = '周末的松弛感，不需要任何计划'
    else if (dayOfWeek === '周日' && hour >= 18) mood = '周日傍晚，一点点淡淡的惆怅'
    else if (dayOfWeek === '周一' && hour < 12) mood = '周一早晨，咖啡和时间都慢一点'
    else if (weather.includes('rain') || weather.includes('Rain') || weather.includes('雨')) mood = '窗外在下雨，世界变得安静'
    else if (weather.includes('cloud') || weather.includes('Cloud') || weather.includes('阴')) mood = '阴天，适合沉静下来'
    else if (weather.includes('sun') || weather.includes('Sun') || weather.includes('晴')) mood = '阳光正好，心情也跟着明亮'
    else if (hour < 10) mood = '清晨的宁静，属于自己和音乐'
    else if (hour < 12) mood = '上午的能量正在慢慢积蓄'
    else if (hour < 14) mood = '午后慵懒，来点温柔的'
    else if (hour < 18) mood = '下午的节奏，不紧不慢'
    else if (hour < 22) mood = '夜晚降临，城市开始呼吸'
    else mood = '深夜，只有音乐和星光'

    res.json({ mood })
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
