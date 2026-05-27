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

  // Cached weather for mood (refresh every 10 min)
  let _moodWeather = ''
  let _moodWeatherAt = 0
  app.get('/api/mood', async (req, res) => {
    const now = new Date()
    const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]
    const hour = now.getHours()

    // Refresh weather cache every 10 min
    if (Date.now() - _moodWeatherAt > 600000) {
      try {
        const axios = require('axios')
        const cfg = state.getPrefs('llm_config') || {}
        const city = cfg.weatherCity || 'Shanghai'
        const resp = await axios.get(`https://wttr.in/${city}?format=%C`, { timeout: 3000 })
        _moodWeather = resp.data.trim()
        _moodWeatherAt = Date.now()
      } catch {}
    }

    const w = _moodWeather
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]

    let pool = []
    if (dayOfWeek === '周五' && hour >= 17) pool = [
      '周五的夜晚，期待释放一周的疲惫',
      'TGIF — 周末就在眼前',
      '一周的忙碌到此为止，剩下的交给音乐',
    ]
    else if (dayOfWeek === '周六') pool = [
      '周末的松弛感，不需要任何计划',
      '周六，阳光和时间都属于自己',
      '慵懒的休息日，什么都慢一点',
    ]
    else if (dayOfWeek === '周日' && hour >= 18) pool = [
      '周日傍晚，一点点淡淡的惆怅',
      '周末快要结束了，再听一首吧',
      '明天又是新的一周，今晚先放松',
    ]
    else if (dayOfWeek === '周一' && hour < 12) pool = [
      '周一早晨，咖啡和时间都慢一点',
      '新的一周，从一首好歌开始',
      '周一需要温柔的能量',
    ]
    else if (w.includes('rain') || w.includes('Rain') || w.includes('雨')) pool = [
      '窗外在下雨，世界变得安静',
      '雨天适合一个人发呆',
      '雨滴敲打窗台，音乐是最好的陪伴',
    ]
    else if (w.includes('cloud') || w.includes('Cloud') || w.includes('阴')) pool = [
      '阴天，适合沉静下来',
      '云层很厚，但心情可以轻盈',
      '灰蒙蒙的天，来点温暖的声音',
    ]
    else if (w.includes('sun') || w.includes('Sun') || w.includes('晴')) pool = [
      '阳光正好，心情也跟着明亮',
      '晴朗的日子应该有好音乐',
      '好天气，适合来点轻快的',
    ]
    else if (hour < 10) pool = [
      '清晨的宁静，属于自己和音乐',
      '早安，新的一天开始了',
      '晨光微熹，用音乐唤醒自己',
    ]
    else if (hour < 12) pool = [
      '上午的能量正在慢慢积蓄',
      '专注的上午，让音乐陪伴',
      '上午的节奏，不急不缓',
    ]
    else if (hour < 14) pool = [
      '午后慵懒，来点温柔的',
      '午间片刻，让思绪飘一会',
      '午后的阳光，需要一点旋律',
    ]
    else if (hour < 18) pool = [
      '下午的节奏，不紧不慢',
      '下午茶时间，给自己一首歌',
      '傍晚前的宁静时刻',
    ]
    else if (hour < 22) pool = [
      '夜晚降临，城市开始呼吸',
      '华灯初上，属于夜晚的音乐',
      '夜色正好，适合放松下来',
    ]
    else pool = [
      '深夜，只有音乐和星光',
      '夜深了，世界安静下来',
      '凌晨时分，和自己独处',
    ]

    res.json({ mood: pick(pool) })
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
