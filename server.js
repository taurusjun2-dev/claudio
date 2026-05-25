require('dotenv').config()
const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')

const router = require('./src/router')
const state = require('./src/state')
const scheduler = require('./src/scheduler')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/stream' })

app.use(express.json())
app.use(express.static(path.join(__dirname, 'pwa')))
app.use('/tts', express.static(path.join(__dirname, 'cache/tts')))

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

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', now: state.getNowPlaying(), queue: state.getQueue() }))
  // 首次连接且队列为空时自动推歌
  if (!state.getNowPlaying() && state.getQueue().length === 0) {
    router.handle('根据现在的时间和心情，推荐几首歌开始播放').catch(() => {})
  }
})

scheduler.init(broadcast)

const PORT = process.env.PORT || 8080
server.listen(PORT, () => console.log(`Claudio running → http://localhost:${PORT}`))
