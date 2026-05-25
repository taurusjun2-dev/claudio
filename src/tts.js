require('dotenv').config()
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const VOICE = process.env.TTS_VOICE || 'zh-CN-XiaoyiNeural'
const BIN = process.env.EDGE_TTS_BIN || 'edge-tts'

function getCacheDir() {
  // In Electron, use userData path; otherwise use local cache/tts
  if (global.__claudio_cache_path) return global.__claudio_cache_path
  return path.join(__dirname, '../cache/tts')
}

function synthesize(text) {
  if (!text) return Promise.resolve(null)

  const cacheDir = getCacheDir()
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const hash = crypto.createHash('md5').update(text).digest('hex')
  const filePath = path.join(cacheDir, `${hash}.mp3`)
  const urlPath = `/tts/${hash}.mp3`

  if (fs.existsSync(filePath)) return Promise.resolve(urlPath)

  return new Promise((resolve) => {
    const proc = spawn(BIN, ['--voice', VOICE, '--text', text, '--write-media', filePath])
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(filePath)) resolve(urlPath)
      else { console.error('[TTS] edge-tts failed, code:', code); resolve(null) }
    })
    proc.on('error', err => {
      console.error('[TTS] spawn error:', err.message); resolve(null)
    })
  })
}

module.exports = { synthesize }
