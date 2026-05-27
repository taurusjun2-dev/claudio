const audioTTS = document.getElementById('audio-tts')
const audioMusic = document.getElementById('audio-music')
const progressFill = document.getElementById('progress-fill')

let ws = null
let queue = []
let currentSong = null
let _userRequested = false
let _autoFetching = false
let _queueOpen = false
let _ttsStart = 0

// ── Audio ducking ──
let _duckTimer = null
function duckMusic() {
  if (_duckTimer) clearTimeout(_duckTimer)
  const target = 0.15
  let v = audioMusic.volume
  if (v <= target) return
  const step = () => {
    v = Math.max(target, v - 0.05)
    audioMusic.volume = v
    if (v > target) _duckTimer = setTimeout(step, 40)
  }
  step()
}
function unduckMusic() {
  if (_duckTimer) clearTimeout(_duckTimer)
  const userVol = document.getElementById('vol-slider').value / 100
  let v = audioMusic.volume
  const step = () => {
    v = Math.min(userVol, v + 0.03)
    audioMusic.volume = v
    if (v < userVol) _duckTimer = setTimeout(step, 50)
  }
  step()
}


// ── Clock ──
function updateClock() {
  const now = new Date()
  const h = now.getHours().toString().padStart(2,'0')
  const m = now.getMinutes().toString().padStart(2,'0')
  document.getElementById('clock').textContent = h + ':' + m
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  document.getElementById('clock-date').textContent =
    `${days[now.getDay()]} · ${now.getDate().toString().padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`
}
updateClock()
setInterval(updateClock, 1000)

// ── Theme ──
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  document.getElementById('btn-dark-t').classList.toggle('active', t === 'dark')
  document.getElementById('btn-light-t').classList.toggle('active', t === 'light')
  localStorage.setItem('claudio-theme', t)
}
setTheme(localStorage.getItem('claudio-theme') || 'dark')

// ── WebSocket ──
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/stream`)
  ws.onopen = () => { document.getElementById('conn-text').textContent = 'CONNECTED' }
  ws.onclose = () => { document.getElementById('conn-text').textContent = 'CONNECTING'; setTimeout(connectWS, 3000) }
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
      if (msg.say) showDJSay(msg.say, msg.session_title)
      if (msg.songs?.length) {
        queue = [...msg.songs]
        renderQueue()
        if (_userRequested || !currentSong) playNext()
      }
      _userRequested = false
      _autoFetching = false
      break
    case 'auto-enqueue':
      if (msg.songs?.length) { queue.push(...msg.songs); renderQueue() }
      if (!currentSong) playNext()
      break
    case 'scheduled':
      if (msg.say) showDJSay(msg.say, msg.session_title)
      if (msg.songs?.length) { queue.push(...msg.songs); renderQueue() }
      break
    case 'command':
      if (msg.action === 'next') playNext()
      else if (msg.action === 'prev') { audioMusic.currentTime = 0; audioMusic.play().catch(() => {}) }
      else if (msg.action === 'pause') audioMusic.pause()
      else if (msg.action === 'resume') audioMusic.play()
      break
  }
}

// ── TTS ──
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

function splitSentences(text) {
  return text.split(/(?<=[。？！.?!\n])\s*/).filter(s => s.trim())
}

function speak(text) {
  if (!text) return
  audioTTS.pause()
  audioTTS.onended = null
  audioTTS.onerror = null
  _ttsStart = Date.now()
  setNPSpeaking(true)
  duckMusic()
  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  }).then(r => r.json()).then(data => {
    if (data.url) {
      audioTTS.onended = () => { unduckMusic(); setNPSpeaking(false) }
      audioTTS.onerror = () => { unduckMusic(); setNPSpeaking(false) }
      audioTTS.src = data.url
      audioTTS.volume = 1.0
      audioTTS.play().catch(() => { unduckMusic(); setNPSpeaking(false) })
    } else {
      unduckMusic(); setNPSpeaking(false)
    }
  }).catch(() => {
    unduckMusic(); setNPSpeaking(false)
  })
}

let _activeSentenceEl = null


// ── Now Playing overlay ──
let _npSentences = []
let _npCurrentIdx = -1
let _sessionTitle = ''
const NP_BB_BARS = 36

function initNPViz() {
  const el = document.getElementById('np-bb-viz')
  if (!el || el.children.length) return
  for (let i = 0; i < NP_BB_BARS; i++) {
    const b = document.createElement('div')
    b.className = 'np-bb-bar'
    el.appendChild(b)
  }
}

let _wfRaf = null
let _wfBaseHeights = []
let _wfSeed = 42

function seededRand(s) { let x=Math.sin(s+1)*43758.5453; return x-Math.floor(x) }

function drawNPWaveform(seed) {
  _wfSeed = seed
  const canvas = document.getElementById('np-wf-canvas')
  if (!canvas) return
  const W = canvas.parentElement.clientWidth
  const H = 140
  canvas.width = W; canvas.height = H
  const bw = 2.5, gap = 1.5
  const n = Math.floor(W / (bw+gap))
  // Pre-compute base heights
  _wfBaseHeights = []
  for (let i=0;i<n;i++) {
    const h = 8 + (seededRand(seed*0.01+i*0.17)*0.6 + seededRand(seed*0.02+i*0.31)*0.4) * (H-16)
    _wfBaseHeights.push(h)
  }
  if (_wfRaf) cancelAnimationFrame(_wfRaf)
  animateWaveform()
}

function animateWaveform() {
  const canvas = document.getElementById('np-wf-canvas')
  if (!canvas || !document.getElementById('np-overlay').classList.contains('open')) {
    _wfRaf = null; return
  }
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0,0,W,H)
  const bw = 2.5, gap = 1.5
  const t = Date.now() / 800
  const isPlaying = !audioMusic.paused
  const grad = ctx.createLinearGradient(0,0,0,H)
  grad.addColorStop(0,'rgba(255,255,255,0.7)')
  grad.addColorStop(1,'rgba(255,255,255,0.06)')
  ctx.fillStyle = grad
  _wfBaseHeights.forEach((base, i) => {
    let h = base
    if (isPlaying) {
      // Animate: each bar oscillates at its own frequency
      const osc = Math.sin(t + i*0.4) * 0.18 + Math.sin(t*1.7 + i*0.23) * 0.10
      h = Math.max(4, base * (1 + osc))
    }
    ctx.fillRect(i*(bw+gap), H-h, bw, h)
  })
  _wfRaf = requestAnimationFrame(animateWaveform)
}

function updateNPViz() {
  if (!audioMusic.duration) return
  const pct = audioMusic.currentTime / audioMusic.duration
  const active = Math.floor(pct * NP_BB_BARS)
  const bars = document.getElementById('np-bb-viz')?.children
  if (!bars) return
  const t = Date.now() / 600
  const isPlaying = !audioMusic.paused
  Array.from(bars).forEach((b,i) => {
    b.classList.toggle('on', i <= active)
    // Animate height
    const baseH = 4 + seededRand(i * 0.37 + _wfSeed * 0.001) * 18
    const osc = isPlaying ? Math.sin(t + i*0.5)*0.3 + Math.sin(t*1.3+i*0.3)*0.15 : 0
    b.style.height = Math.max(3, baseH * (1+osc)) + 'px'
  })
  document.getElementById('np-cur').textContent = fmt(audioMusic.currentTime)
  document.getElementById('np-elapsed').textContent = fmt(audioMusic.currentTime)
  document.getElementById('np-progress-fill').style.width =
    (pct*100) + '%'
  document.getElementById('np-time').textContent =
    fmt(audioMusic.currentTime) + ' / ' + fmt(audioMusic.duration)
  const playIcon = audioMusic.paused ? '&#9654;' : '&#9646;&#9646;'
  const npP = document.getElementById('np-btn-play')
  const npPB = document.getElementById('np-btn-play-bottom')
  if (npP) npP.innerHTML = playIcon
  if (npPB) npPB.innerHTML = playIcon
}

function openNowPlaying() {
  initNPViz()
  document.getElementById('np-overlay').classList.add('open')
  if (_wfRaf) cancelAnimationFrame(_wfRaf)
  animateWaveform()
  // Fetch mood for detail page header
  fetch('/api/mood').then(r => r.json()).then(d => {
    if (d.mood) document.getElementById('np-session-title').textContent = d.mood
  }).catch(() => {})
  if (currentSong) {
    drawNPWaveform(currentSong.id ? parseInt(currentSong.id)%1000 : 42)
    document.getElementById('np-song-info').textContent =
      (currentSong.artist || '') + (currentSong.title ? ' — ' + currentSong.title : '')
    // Fetch story if not already loaded for this song
    const cached = _storyCache.get(currentSong.id)
    if (cached) {
      showStory(cached, false, true)
    } else if (!_storyLoaded || _storyLoadedFor !== currentSong.id) {
      fetchAndPlayStory(currentSong.title, currentSong.artist, currentSong.id)
    }
  }
  renderNPSentences()
}

let _storyLoaded = false
let _storyLoadedFor = null
const _storyCache = new Map()

async function fetchAndPlayStory(title, artist, songId) {
  _storyLoaded = false
  _storyLoadedFor = null
  clearNPSentences()
  setNPSpeaking(true)

  try {
    const resp = await fetch('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist })
    })
    const data = await resp.json()
    if (data.story && document.getElementById('np-overlay').classList.contains('open')) {
      _storyLoaded = true
      _storyLoadedFor = songId
      if (data.session_title || _sessionTitle) {
        const t = data.session_title || _sessionTitle
        const npTitle = document.getElementById('np-session-title')
        if (npTitle) npTitle.textContent = t
      }
      _storyCache.set(songId, data.story)
      showStory(data.story, true, false)
      speak(data.story)
    } else {
      setNPSpeaking(false)
    }
  } catch (e) {
    setNPSpeaking(false)
    console.error('[Story] fetch error:', e)
  }
}

function closeNowPlaying() {
  document.getElementById('np-overlay').classList.remove('open')
  if (_wfRaf) { cancelAnimationFrame(_wfRaf); _wfRaf = null }
}

function npSeek(e) {
  if (!audioMusic.duration) return
  const r = e.currentTarget.getBoundingClientRect()
  audioMusic.currentTime = ((e.clientX-r.left)/r.width) * audioMusic.duration
}

function setNPSpeaking(active) {
  document.getElementById('np-speaking')?.classList.toggle('active', active)
}

// Add sentence to NP overlay with state (past/current/future)
function addNPSentence(text, relMs, idx) {
  const el = document.getElementById('np-sentences')
  if (!el) return
  const m = Math.floor(relMs/60000)
  const s = Math.floor((relMs%60000)/1000)
  const ts = m + ':' + s.toString().padStart(2,'0')
  const words = text.split(/(\s+)/).map(t =>
    /\s+/.test(t) ? t : `<span class="w">${t}</span>`
  ).join('')
  const div = document.createElement('div')
  div.className = 'np-sentence future'
  div.dataset.idx = idx
  div.innerHTML = `<span class="np-sentence-meta">Claudio &bull; ${ts}</span><div class="np-sentence-text">${words}</div>`
  el.appendChild(div)
  _npSentences.push({ el: div, textEl: div.querySelector('.np-sentence-text') })
}

function activateNPSentence(idx) {
  _npCurrentIdx = idx
  _npSentences.forEach((s, i) => {
    s.el.className = 'np-sentence ' + (i < idx ? 'past' : i === idx ? 'current' : 'future')
  })
  const cur = _npSentences[idx]
  if (cur) {
    cur.el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    _activeSentenceEl = cur.textEl
  }
}

function renderNPSentences() {
  // Re-apply current/past/future classes based on _npCurrentIdx
  _npSentences.forEach((s, i) => {
    s.el.className = 'np-sentence ' + (i < _npCurrentIdx ? 'past' : i === _npCurrentIdx ? 'current' : 'future')
  })
}

function clearNPSentences() {
  const el = document.getElementById('np-sentences')
  if (el) el.innerHTML = ''
  _npSentences = []
  _npCurrentIdx = -1
}


// ── Show story in NP overlay ──
// immediate=false: NP overlay animates sentence by sentence (first entry)
// immediate=true:  NP overlay shows all at once (re-entry from cache)
// chat is always immediate regardless of immediate flag
function showStory(text, addToChat = true, immediate = false) {
  if (!text) return
  text = stripMarkdown(text)
  clearNPSentences()
  const el = document.getElementById('np-sentences')
  if (!el) return

  const sentences = splitSentences(text)
  if (!sentences.length) { setNPSpeaking(false); return }

  // Chat: always add all sentences immediately
  if (addToChat) {
    const chatEl = document.getElementById('chat-messages')
    sentences.forEach(s => {
      const now = new Date()
      const chatTs = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
      const wrap = document.createElement('div')
      wrap.className = 'dj-msg'
      wrap.innerHTML = '<div class="msg-avatar">C</div>' +
        '<div class="dj-msg-body">' +
        '<div class="dj-msg-label">CLAUDIO</div>' +
        '<div class="dj-msg-text">' + s + '</div>' +
        '<div class="dj-msg-meta"><span class="dj-msg-time">' + chatTs + '</span></div>' +
        '</div>'
      chatEl.appendChild(wrap)
      chatEl.scrollTop = chatEl.scrollHeight
    })
  }

  const renderSentence = (s, i) => {
    const words = s.split(/(\s+)/).map(t =>
      /\s+/.test(t) ? t : '<span class="w">' + t + '</span>'
    ).join('')
    const div = document.createElement('div')
    div.className = 'np-sentence future'
    div.innerHTML = '<span class="np-sentence-meta">Claudio</span><div class="np-sentence-text">' + words + '</div>'
    el.appendChild(div)
    _npSentences.push({ el: div, textEl: div.querySelector('.np-sentence-text') })
    activateNPSentence(_npSentences.length - 1)
    el.scrollTop = el.scrollHeight
    if (i === sentences.length - 1 && immediate) setNPSpeaking(false)
  }

  if (immediate) {

    sentences.forEach((s, i) => renderSentence(s, i))
  } else {
    setNPSpeaking(true)
    const CPS = 4.5
    let charOffset = 0
    sentences.forEach((s, i) => {
    s = stripMarkdown(s)
      const delay = charOffset * 1000 / CPS
      charOffset += s.length
      setTimeout(() => renderSentence(s, i), delay)
    })
  }
}

// ── DJ say: progressive sentences ──
function showDJSay(text, sessionTitle) {
  if (!text) return
  text = stripMarkdown(text)
  speak(text)
  if (sessionTitle) {
    _sessionTitle = sessionTitle
    const npTitle = document.getElementById('np-session-title')
    if (npTitle) npTitle.textContent = sessionTitle
  }
  clearNPSentences()
  setNPSpeaking(true)
  const chatEl = document.getElementById('chat-messages')
  const sentences = splitSentences(text)
  if (!sentences.length) { unduckMusic(); setNPSpeaking(false); return }
  const CPS = 4.5
  let delay = 0

  sentences.forEach(s => {
    const d = delay
    setTimeout(() => {
      const relSec = Math.floor((Date.now() - _ttsStart) / 1000)
      const ts = Math.floor(relSec/60) + ':' + (relSec%60).toString().padStart(2,'0')

      // Add to NP overlay
      addNPSentence(s, d * 1000 / CPS)

      const words = s.split(/(\s+)/).map(t =>
        /\s+/.test(t) ? t : `<span class="w">${t}</span>`
      ).join('')

      const wrap = document.createElement('div')
      wrap.className = 'dj-msg'
      wrap.innerHTML = `
        <div class="msg-avatar">C</div>
        <div class="dj-msg-body">
          <div class="dj-msg-label">CLAUDIO</div>
          <div class="dj-msg-text">${words}</div>
          <div class="dj-msg-meta">
            <span class="dj-msg-time">${ts}</span>
            <button class="replay-btn" onclick="replayDJ(this)">&#9654; REPLAY</button>
          </div>
        </div>`
      _activeSentenceEl = wrap.querySelector('.dj-msg-text')
      activateNPSentence(_npSentences.length - 1)
      chatEl.appendChild(wrap)
      chatEl.scrollTop = chatEl.scrollHeight
    }, d * 1000 / CPS)
    delay += s.length
  })

}

function replayDJ(btn) {
  const textEl = btn.closest('.dj-msg-body')?.querySelector('.dj-msg-text')
  if (textEl) speak(textEl.textContent)
}

// ── Music player ──
function setNowPlaying(song) {
  currentSong = song
  _storyLoaded = false
  _storyLoadedFor = null
  const titleEl = document.getElementById('song-title')
  titleEl.textContent = song.title || '—'
  titleEl.style.cursor = 'pointer'
  titleEl.onclick = openNowPlaying
  document.getElementById('song-artist').textContent = song.artist || ''
  updateFavIcon()
  document.getElementById('np-status').textContent = '· PLAYING'
  document.getElementById('np-bars').classList.remove('paused')
  if (document.getElementById('np-overlay').classList.contains('open')) {
    drawNPWaveform(song.id ? parseInt(song.id)%1000 : 42)
    const moodEl = document.getElementById('np-session-title')
    if (!moodEl.textContent || moodEl.textContent === '—') {
      moodEl.textContent = _sessionTitle || song.title || '—'
    }
    document.getElementById('np-song-info').textContent = (song.artist||'') + ' — ' + (song.title||'')
  }
  if (song.url) {
    audioMusic.pause()
    audioMusic.src = song.url
    audioMusic.load()
    audioMusic.volume = document.getElementById('vol-slider').value / 100
    audioMusic.play().then(() => setPlayState(true)).catch(() => setPlayState(false))
  }
}

function setPlayState(playing) {
  const icon = playing ? '&#9646;&#9646;' : '&#9654;'
  document.getElementById('btn-play').innerHTML = icon
  document.getElementById('np-bars').classList.toggle('paused', !playing)
  document.getElementById('np-status').textContent = playing ? '· PLAYING' : '· PAUSED'
}

function playNext() {
  if (!queue.length) { autoNext(); return }
  const song = queue.shift()
  renderQueue()
  fetch('/api/played', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song })
  })
  addSystemMsg('Now playing: ' + song.title + ' — ' + song.artist)
  setNowPlaying(song)
}

function togglePlay() {
  if (audioMusic.paused) {
    if (!audioMusic.src && queue.length) { playNext(); return }
    audioMusic.play().catch(() => {})
    setPlayState(true)
  } else {
    audioMusic.pause()
    setPlayState(false)
  }
}

function setVolume(v) { audioMusic.volume = v / 100 }

function toggleFav() {
  if (!currentSong) return
  const key = 'fav_' + (currentSong.id || currentSong.title)
  const isFav = localStorage.getItem(key)
  if (isFav) {
    localStorage.removeItem(key)
    setFavIcon(false)
  } else {
    localStorage.setItem(key, JSON.stringify({
      id: currentSong.id, title: currentSong.title, artist: currentSong.artist
    }))
    setFavIcon(true)
  }
}

function setFavIcon(on) {
  const btn = document.getElementById('btn-fav')
  if (!btn) return
  btn.innerHTML = on ? '&#9829;' : '&#9825;'
  btn.style.color = on ? '#e55' : ''
}

function updateFavIcon() {
  if (!currentSong) return
  const key = 'fav_' + (currentSong.id || currentSong.title)
  setFavIcon(!!localStorage.getItem(key))
}

audioMusic.ontimeupdate = () => {
  if (!audioMusic.duration) return
  const pct = (audioMusic.currentTime / audioMusic.duration) * 100
  progressFill.style.width = pct + '%'
  document.getElementById('t-cur').textContent = fmt(audioMusic.currentTime)
  document.getElementById('t-dur').textContent = fmt(audioMusic.duration)
  updateNPViz()
  if (audioMusic.duration - audioMusic.currentTime < 20 && !queue.length) autoNext()
}

audioMusic.onended = () => {
  setPlayState(false)
  document.getElementById('np-status').textContent = '· IDLE'
  currentSong = null
  playNext()
}

audioMusic.onerror = () => {
  if (audioMusic.error?.code === 1) return
  setTimeout(playNext, 1500)
}

function autoNext() {
  if (_autoFetching) return
  _autoFetching = true
  fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '继续，根据刚才的心情再来一首' })
  }).finally(() => { _autoFetching = false })
}

function seek(e) {
  if (!audioMusic.duration) return
  const r = e.currentTarget.getBoundingClientRect()
  audioMusic.currentTime = ((e.clientX - r.left) / r.width) * audioMusic.duration
}

function fmt(s) {
  return Math.floor(s/60) + ':' + Math.floor(s%60).toString().padStart(2,'0')
}

// ── Queue ──
function toggleQueueList() {
  _queueOpen = !_queueOpen
  document.getElementById('queue-list').style.display = _queueOpen ? 'block' : 'none'
  renderQueue()
}

function renderQueue() {
  const el = document.getElementById('queue-list')
  const count = document.getElementById('queue-count')
  const n = queue.length
  count.textContent = `${n} TRACK${n !== 1 ? 'S' : ''}`
  if (!n) {
    el.innerHTML = '<div class="queue-empty">队列为空</div>'
    return
  }
  el.innerHTML = queue.map((s, i) => `
    <div class="queue-item${i===0?' active':''}">
      <span class="q-icon">${i===0 ? '&#9733;' : '&#9654;'}</span>
      <div style="flex:1">
        <div class="q-title">${s.title}</div>
        <div class="q-artist">${s.artist}</div>
      </div>
    </div>`).join('')
}

// ── Chat ──
function addSystemMsg(text) {
  const el = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = 'system-msg'
  div.textContent = text
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

function addUserMsg(text) {
  const el = document.getElementById('chat-messages')
  const now = new Date()
  const ts = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
  const div = document.createElement('div')
  div.className = 'user-msg'
  div.innerHTML = `
    <div class="user-msg-body">
      <span class="user-label">ME</span>
      <div class="user-bubble">${text}</div>
      <span class="user-msg-time">${ts}</span>
    </div>
    <div class="user-avatar">M</div>`
  el.appendChild(div)
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

function hideLoading() { document.getElementById('chat-loading')?.remove() }

async function sendChat() {
  const input = document.getElementById('chat-input')
  const msg = input.value.trim() || input.placeholder
  input.value = ''
  _userRequested = true
  addUserMsg(msg)
  showLoading()
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    })
    const data = await resp.json()
    hideLoading()
    if (data.error) addSystemMsg('错误：' + data.error)
  } catch {
    hideLoading()
    addSystemMsg('连接出错，请稍后重试')
  }
}

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat()
})

function sendCommand(cmd) {
  fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: cmd })
  })
}

// ── Settings ──

function setSettingsDot(show) {
  const btn = document.querySelector('.hbtn-settings')
  if (!btn) return
  let dot = btn.querySelector('.s-dot')
  if (!dot) {
    dot = document.createElement('span')
    dot.className = 's-dot'
    dot.style.cssText = 'display:inline-block;width:7px;height:7px;background:#e55;border-radius:50%;margin-left:4px;vertical-align:2px'
    btn.appendChild(dot)
  }
  dot.style.display = show ? 'inline-block' : 'none'
}

async function checkSettingsDot() {
  try {
    const s = await fetch('/api/settings').then(r => r.json())
    const incomplete = !s.url || !s.apiKey || !s.model
    setSettingsDot(incomplete)
  } catch {
    setSettingsDot(true)
  }
}

function loadVoices() {
  const sel = document.getElementById('setting-voice')
  if (!sel || sel.options.length > 1) return
  const voices = [
    { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声·活泼)' },
    { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声·温柔)' },
    { value: 'zh-CN-YunxiNeural', label: '云希 (男声·阳光)' },
    { value: 'zh-CN-YunjianNeural', label: '云健 (男声·浑厉)' },
    { value: 'zh-CN-XiaohanNeural', label: '晓涵 (女声·稳重)' },
  ]
  sel.innerHTML = voices.map(function(v) {
    return '<option value="' + v.value + '">' + v.label + '</option>'
  }).join('')
}

function openSettings() {
  document.getElementById('settings-overlay').classList.add('open')
  loadSettings()
  loadVoices()
}
function closeSettings() { document.getElementById('settings-overlay').classList.remove('open') }
function closeSettingsOutside(e) { if (e.target.id === 'settings-overlay') closeSettings() }

async function loadSettings() {
  try {
    const s = await fetch('/api/settings').then(r => r.json())
    document.getElementById('setting-url').value = s.url || ''
    document.getElementById('setting-model').value = s.model || ''
    document.getElementById('setting-weather').value = s.weatherCity || ''
    document.getElementById('setting-maxtokens').value = s.maxTokens || 4000
    const sel = document.getElementById('setting-voice')
    if (s.voice) sel.value = s.voice
    const k = document.getElementById('setting-apikey')
    k.type = 'password'
    if (s.apiKey) {
      k.value = s.apiKey  // shows as ••••••
      k.placeholder = ''
    } else {
      k.value = ''
      k.placeholder = '输入 API Key'
    }
  } catch {}
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
    const r = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: document.getElementById('setting-url').value.trim(),
        model: document.getElementById('setting-model').value.trim(),
        apiKey: document.getElementById('setting-apikey').value.trim(),
        maxTokens: parseInt(document.getElementById('setting-maxtokens').value) || 4000,
        weatherCity: document.getElementById('setting-weather').value.trim(),
        voice: document.getElementById('setting-voice').value
      })
    }).then(r => r.json())
    if (r.ok) { status.textContent = '已保存'; checkSettingsDot(); setTimeout(closeSettings, 1000) }
  } catch (e) { status.textContent = '失败: ' + e.message }
  finally { btn.disabled = false; btn.textContent = '保存设置'; setTimeout(() => status.textContent = '', 3000) }
}

async function testLLM() {
  const btn = document.querySelector('.settings-sheet .btn-secondary')
  const status = document.getElementById('settings-status')
  btn.disabled = true; btn.textContent = '测试中...'
  try {
    const r = await fetch('/api/settings/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: document.getElementById('setting-url').value.trim(),
        model: document.getElementById('setting-model').value.trim(),
        apiKey: document.getElementById('setting-apikey').value.trim()
      })
    }).then(r => r.json())
    status.textContent = r.ok ? '连接成功' : ('失败: ' + r.error)
    status.style.color = r.ok ? '#00c875' : '#e55'
    if (!r.ok) setSettingsDot(true)
  } catch (e) { status.textContent = '失败: ' + e.message; status.style.color = '#e55' }
  finally { btn.disabled = false; btn.textContent = '测试连接'; setTimeout(() => { status.textContent = ''; status.style.color = '' }, 5000) }
}

// ── Init ──
checkSettingsDot()
connectWS()
fetch('/api/now').then(r => r.json()).then(s => { if (s) setNowPlaying(s) })

if (!window.electron?.isElectron && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
