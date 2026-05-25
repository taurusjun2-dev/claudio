const audioTTS = document.getElementById('audio-tts')
const audioMusic = document.getElementById('audio-music')
const btnPlay = document.getElementById('btn-play')
const progressFill = document.getElementById('progress-fill')
const tCur = document.getElementById('t-cur')
const tDur = document.getElementById('t-dur')

let ws = null
let queue = []
let currentSong = null
let _userRequested = false
let _autoFetching = false

// ── Clock ──
function updateClock() {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  document.getElementById('clock').textContent = h + ':' + m
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const day = days[now.getDay()]
  const date = now.getDate().toString().padStart(2, '0')
  const month = months[now.getMonth()]
  const year = now.getFullYear()
  document.getElementById('clock-date').textContent = `${day} · ${date} ${month} ${year}`
}
updateClock()
setInterval(updateClock, 1000)

// ── Theme ──
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.getElementById('btn-dark').classList.toggle('active', theme === 'dark')
  document.getElementById('btn-light').classList.toggle('active', theme === 'light')
  localStorage.setItem('claudio-theme', theme)
}
const savedTheme = localStorage.getItem('claudio-theme') || 'light'
setTheme(savedTheme)

// ── WebSocket ──
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/stream`)
  ws.onopen = () => {
    document.getElementById('conn-status').textContent = 'CONNECTED'
    document.getElementById('on-air-text').textContent = 'ON AIR'
  }
  ws.onclose = () => {
    document.getElementById('conn-status').textContent = 'DISCONNECTED'
    document.getElementById('on-air-text').textContent = 'OFF AIR'
    setTimeout(connectWS, 3000)
  }
  ws.onmessage = ({ data }) => handleWS(JSON.parse(data))
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
      if (msg.songs?.length) { queue.push(...msg.songs); renderQueue() }
      break
    case 'command':
      if (msg.action === 'next') playNext()
      else if (msg.action === 'pause') audioMusic.pause()
      else if (msg.action === 'resume') audioMusic.play()
      break
  }
}

// ── TTS: Web Speech API ──
function speak(text) {
  if (!text || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const sentences = text.split(/(?<=[。？！.?!])\s*/)
  let delay = 0
  sentences.filter(s => s.trim()).forEach(s => {
    const utt = new SpeechSynthesisUtterance(s)
    utt.lang = 'zh-CN'
    utt.rate = 1.05
    utt.volume = parseFloat(document.getElementById('vol-slider').value) / 100
    setTimeout(() => speechSynthesis.speak(utt), delay)
    delay += s.length * 120
  })
}

// ── DJ say: progressive sentence display ──
function showDJSay(text) {
  if (!text) return
  const sentences = text.split(/(?<=[。？！.?!])\s*/).filter(s => s.trim())
  if (!sentences.length) sentences.push(text)
  const now = new Date()
  const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')

  const el = document.getElementById('chat-messages')
  const wrap = document.createElement('div')
  wrap.className = 'dj-msg'
  wrap.innerHTML = `<span class="dj-msg-label">CLAUDIO</span><span class="dj-msg-time">${timeStr}</span>`
  el.appendChild(wrap)

  let i = 0
  const charsPerSec = 4
  function showNext() {
    if (i >= sentences.length) { el.scrollTop = el.scrollHeight; return }
    const span = document.createElement('div')
    span.className = 'dj-msg-text'
    span.textContent = sentences[i]
    wrap.appendChild(span)
    el.scrollTop = el.scrollHeight
    i++
    if (i < sentences.length) {
      setTimeout(showNext, sentences[i-1].length / charsPerSec * 1000)
    }
  }
  showNext()
  speak(text)
}

// ── Music player ──
function setNowPlaying(song) {
  currentSong = song
  document.getElementById('song-title').textContent = song.title || '—'
  document.getElementById('song-artist').textContent = song.artist || ''
  document.getElementById('np-status').textContent = '· PLAYING'
  document.getElementById('np-bars').classList.remove('paused')
  if (song.url) {
    audioMusic.pause()
    audioMusic.src = song.url
    audioMusic.load()
    audioMusic.volume = parseFloat(document.getElementById('vol-slider').value) / 100
    audioMusic.play().then(() => {
      btnPlay.innerHTML = '&#9646;&#9646;'
      btnPlay.style.color = ''
    }).catch(() => {
      btnPlay.innerHTML = '&#9654;'
      btnPlay.style.color = 'var(--accent)'
      btnPlay.title = '点击开始播放'
    })
  }
}

function playNext() {
  if (!queue.length) { autoNext(); return }
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
    if (!audioMusic.src && queue.length) { playNext(); return }
    audioMusic.play().catch(() => {})
    btnPlay.innerHTML = '&#9646;&#9646;'
    btnPlay.style.color = ''
    document.getElementById('np-bars').classList.remove('paused')
  } else {
    audioMusic.pause()
    btnPlay.innerHTML = '&#9654;'
    document.getElementById('np-bars').classList.add('paused')
    document.getElementById('np-status').textContent = '· PAUSED'
  }
}

function setVolume(val) {
  audioMusic.volume = val / 100
}

function toggleFav() {
  const btn = document.getElementById('btn-fav')
  const active = btn.style.color === 'red'
  btn.style.color = active ? '' : 'red'
  btn.innerHTML = active ? '&#9825;' : '&#9829;'
}

audioMusic.ontimeupdate = () => {
  if (!audioMusic.duration) return
  const pct = (audioMusic.currentTime / audioMusic.duration) * 100
  progressFill.style.width = pct + '%'
  tCur.textContent = fmt(audioMusic.currentTime)
  tDur.textContent = fmt(audioMusic.duration)
  const remaining = audioMusic.duration - audioMusic.currentTime
  if (remaining < 20 && queue.length === 0) autoNext()
}

audioMusic.onended = () => {
  btnPlay.innerHTML = '&#9654;'
  document.getElementById('np-bars').classList.add('paused')
  document.getElementById('np-status').textContent = '· IDLE'
  currentSong = null
  playNext()
}

audioMusic.onerror = () => {
  if (audioMusic.error?.code === 1) return
  document.getElementById('song-artist').textContent = '播放失败，尝试下一首'
  setTimeout(playNext, 1500)
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

function seek(e) {
  if (!audioMusic.duration) return
  const rect = e.currentTarget.getBoundingClientRect()
  audioMusic.currentTime = ((e.clientX - rect.left) / rect.width) * audioMusic.duration
}

function fmt(s) {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2,'0')}`
}

// ── Queue ──
let queueOpen = false
function toggleQueue() {
  queueOpen = !queueOpen
  const items = document.getElementById('queue-items')
  const count = document.getElementById('queue-count')
  items.style.display = queueOpen ? 'block' : 'none'
  const n = queue.length
  count.textContent = `${n} TRACK${n !== 1 ? 'S' : ''} ${queueOpen ? '▲' : '▼'}`
}

function renderQueue() {
  const el = document.getElementById('queue-items')
  const count = document.getElementById('queue-count')
  const n = queue.length
  count.textContent = `${n} TRACK${n !== 1 ? 'S' : ''} ${queueOpen ? '▲' : '▼'}`
  if (!n) {
    el.innerHTML = '<div class="queue-empty-msg">队列为空</div>'
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
  if (role === 'user') {
    const div = document.createElement('div')
    div.className = 'user-msg'
    div.innerHTML = `<div class="user-msg-bubble">${text}</div>`
    el.appendChild(div)
  } else {
    const now = new Date()
    const t = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
    const div = document.createElement('div')
    div.className = 'dj-msg'
    div.innerHTML = `<span class="dj-msg-label">CLAUDIO</span><div class="dj-msg-text">${text}</div><span class="dj-msg-time">${t}</span>`
    el.appendChild(div)
  }
  el.scrollTop = el.scrollHeight
}

function showLoading() {
  const el = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = 'chat-msg loading'
  div.id = 'chat-loading'
  div.textContent = 'DJ 正在为你选歌...'
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
    if (data.error) addChatMsg('assistant', '错误：' + data.error)
    else if (data.say) addChatMsg('assistant', data.say)
  } catch (e) {
    hideLoading()
    addChatMsg('assistant', '连接出错，请稍后重试')
  }
}

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat()
})

function sendCommand(cmd) {
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: cmd })
  })
}

// ── Settings modal ──
function openSettings() {
  document.getElementById('settings-overlay').classList.add('open')
  loadSettings()
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open')
}
function closeSettingsOutside(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings()
}

async function updateSettingsBadge() {
  try {
    const resp = await fetch('/api/settings')
    const s = await resp.json()
    document.getElementById('settings-dot').classList.toggle('show', !s.apiKey)
  } catch { document.getElementById('settings-dot').classList.add('show') }
}

async function loadSettings() {
  try {
    const resp = await fetch('/api/settings')
    const s = await resp.json()
    document.getElementById('setting-url').value = s.url || ''
    document.getElementById('setting-model').value = s.model || ''
    document.getElementById('setting-weather').value = s.weatherCity || ''
    document.getElementById('setting-maxtokens').value = s.maxTokens || 4000
    const keyEl = document.getElementById('setting-apikey')
    if (s.apiKey) {
      keyEl.value = s.apiKey
      keyEl.type = 'password'
      keyEl.placeholder = '已设置，留空保持不变'
    }
  } catch { /* skip */ }
}

function toggleKeyVisibility() {
  const el = document.getElementById('setting-apikey')
  el.type = el.type === 'password' ? 'text' : 'password'
}

async function saveSettings() {
  const btn = document.querySelector('.settings-sheet .btn-primary')
  const status = document.getElementById('settings-status')
  btn.disabled = true; btn.textContent = '保存中...'
  try {
    const resp = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: document.getElementById('setting-url').value.trim(),
        model: document.getElementById('setting-model').value.trim(),
        apiKey: document.getElementById('setting-apikey').value.trim(),
        maxTokens: parseInt(document.getElementById('setting-maxtokens').value) || 4000,
        weatherCity: document.getElementById('setting-weather').value.trim()
      })
    })
    const result = await resp.json()
    if (result.ok) {
      status.textContent = '设置已保存'
      updateSettingsBadge()
      setTimeout(closeSettings, 1200)
    }
  } catch (e) {
    status.textContent = '保存失败: ' + e.message
  } finally {
    btn.disabled = false; btn.textContent = '保存设置'
    setTimeout(() => { status.textContent = '' }, 3000)
  }
}

async function testLLM() {
  const btn = document.querySelector('.settings-sheet .btn-secondary')
  const status = document.getElementById('settings-status')
  btn.disabled = true; btn.textContent = '测试中...'
  status.textContent = ''
  try {
    const resp = await fetch('/api/settings/test', { method: 'POST' })
    const result = await resp.json()
    status.textContent = result.ok ? '连接成功' : ('失败: ' + (result.error || '未知'))
    status.style.color = result.ok ? '#4caf50' : '#e55'
  } catch (e) {
    status.textContent = '请求失败: ' + e.message
    status.style.color = '#e55'
  } finally {
    btn.disabled = false; btn.textContent = '测试连接'
    setTimeout(() => { status.textContent = ''; status.style.color = '' }, 5000)
  }
}

// ── Init ──
connectWS()
updateSettingsBadge()
fetch('/api/now').then(r => r.json()).then(song => { if (song) setNowPlaying(song) })

if (!window.electron?.isElectron && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
