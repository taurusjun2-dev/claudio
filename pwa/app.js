const audioTTS = document.getElementById('audio-tts')
const audioMusic = document.getElementById('audio-music')
const btnPlay = document.getElementById('btn-play')
const progressFill = document.getElementById('progress-fill')
const tCur = document.getElementById('t-cur')
const tDur = document.getElementById('t-dur')

let ws = null
let queue = []
let currentSong = null
let ttsQueue = []
let isPlayingTTS = false
let _userRequested = false
let _autoFetching = false  // 防止 autoNext 并发重复请求

// ── WebSocket ──
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/stream`)

  ws.onopen = () => {
    document.getElementById('status-dot').classList.add('live')
  }
  ws.onclose = () => {
    document.getElementById('status-dot').classList.remove('live')
    setTimeout(connectWS, 3000)
  }
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data)
    handleWS(msg)
  }
}

function handleWS(msg) {
  switch (msg.type) {
    case 'connected':
      if (msg.now) setNowPlaying(msg.now)
      if (msg.queue) { queue = msg.queue; renderQueue() }
      break
    case 'now-playing':
      if (msg.song) setNowPlaying(msg.song)
      break
    case 'dj-response':
    case 'response':
      if (msg.say) showDJSay(msg.say)
      if (msg.ttsUrl) enqueueTTS(msg.ttsUrl)
      if (msg.songs?.length) {
        queue = [...msg.songs]
        renderQueue()
        if (_userRequested || !currentSong) playNext()
        _userRequested = false
        _autoFetching = false
      }
      break
    case 'auto-enqueue':
      if (msg.songs?.length) { queue.push(...msg.songs); renderQueue() }
      if (!currentSong) playNext()
      break
    case 'scheduled':
      if (msg.say) showDJSay(msg.say)
      if (msg.ttsUrl) enqueueTTS(msg.ttsUrl)
      if (msg.songs?.length) { queue.push(...msg.songs); renderQueue() }
      break
    case 'command':
      if (msg.action === 'next') playNext()
      else if (msg.action === 'pause') audioMusic.pause()
      else if (msg.action === 'resume') audioMusic.play()
      break
  }
}

// ── DJ say ──
function showDJSay(text) {
  const el = document.getElementById('dj-text')
  const bubble = document.getElementById('dj-bubble')
  el.textContent = text
  bubble.classList.add('speaking')
  setTimeout(() => bubble.classList.remove('speaking'), 6000)
}

// ── TTS queue ──
function enqueueTTS(url) {
  ttsQueue.push(url)
  if (!isPlayingTTS) playNextTTS()
}

function playNextTTS() {
  if (!ttsQueue.length) { isPlayingTTS = false; return }
  isPlayingTTS = true
  audioTTS.src = ttsQueue.shift()
  audioTTS.play().catch(() => {})
}
audioTTS.onended = () => playNextTTS()

// ── Music player ──
function setNowPlaying(song) {
  currentSong = song
  document.getElementById('song-title').textContent = song.title || '—'
  document.getElementById('song-artist').textContent = song.artist || ''
  if (song.url) {
    audioMusic.pause()
    audioMusic.src = song.url
    audioMusic.load()
    audioMusic.play().then(() => {
      btnPlay.textContent = '⏸'
      btnPlay.style.color = ''
    }).catch(() => {
      btnPlay.textContent = '▶'
      btnPlay.style.color = 'var(--accent)'
      btnPlay.title = '点击开始播放'
    })
  }
}

function playNext() {
  if (!queue.length) {
    autoNext()
    return
  }
  const song = queue.shift()
  renderQueue()
  fetch('/api/played', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song })
  })
  setNowPlaying(song)
}

function togglePlay() {
  if (audioMusic.paused) {
    if (!audioMusic.src && queue.length) {
      playNext()
      return
    }
    audioMusic.play().catch(() => {})
    btnPlay.textContent = '⏸'
    btnPlay.style.color = ''
  } else {
    audioMusic.pause()
    btnPlay.textContent = '▶'
  }
}

audioMusic.ontimeupdate = () => {
  if (!audioMusic.duration) return
  const pct = (audioMusic.currentTime / audioMusic.duration) * 100
  progressFill.style.width = pct + '%'
  tCur.textContent = fmt(audioMusic.currentTime)
  tDur.textContent = fmt(audioMusic.duration)

  // 剩最后 20s 且队列为空时，提前预取下一批
  const remaining = audioMusic.duration - audioMusic.currentTime
  if (remaining < 20 && queue.length === 0) autoNext()
}

audioMusic.onended = () => {
  btnPlay.textContent = '▶'
  currentSong = null
  playNext()
}

function autoNext() {
  if (_autoFetching) return
  _autoFetching = true
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '继续，根据刚才的心情再来一首' })
  }).finally(() => { _autoFetching = false })
}

audioMusic.onerror = () => {
  // MEDIA_ERR_ABORTED (code 1) = 主动切歌，不处理
  if (audioMusic.error?.code === 1) return
  document.getElementById('song-artist').textContent = '播放失败，尝试下一首'
  setTimeout(playNext, 1500)
}

function seek(e) {
  if (!audioMusic.duration) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  audioMusic.currentTime = pct * audioMusic.duration
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── Queue render ──
function renderQueue() {
  const el = document.getElementById('queue-list')
  if (!queue.length) {
    el.innerHTML = '<div class="queue-empty">队列为空</div>'
    return
  }
  el.innerHTML = queue.map((s, i) => `
    <div class="queue-item">
      <span class="q-num">${i + 1}</span>
      <div class="q-info">
        <div class="q-title">${s.title}</div>
        <div class="q-artist">${s.artist}</div>
      </div>
    </div>`).join('')
}

// ── Chat ──
function addChatMsg(role, text) {
  if (!text) return
  const el = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = `chat-msg ${role}`
  div.textContent = text
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

function showLoading() {
  const el = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = 'chat-msg assistant loading'
  div.id = 'chat-loading'
  div.textContent = 'DJ 正在为你选歌曲...'
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

function hideLoading() {
  document.getElementById('chat-loading')?.remove()
}

async function sendChat() {
  const input = document.getElementById('chat-input')
  const msg = input.value.trim() || input.placeholder
  input.value = ''
  _userRequested = true
  addChatMsg('user', msg)
  showLoading()

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    })
    const data = await resp.json()
    hideLoading()
    if (data.say) addChatMsg('assistant', data.say)
  } catch (e) {
    hideLoading()
    addChatMsg('assistant', '连接出错，请稍后重试')
  }
}

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat()
})

// ── Commands ──
function sendCommand(cmd) {
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: cmd })
  })
}

// ── View switching ──
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  document.getElementById('view-' + name).classList.add('active')
  event.currentTarget.classList.add('active')
}

// ── Init ──
connectWS()
fetch('/api/now').then(r => r.json()).then(song => { if (song) setNowPlaying(song) })

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
