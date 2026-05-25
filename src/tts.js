const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CACHE_DIR = path.join(__dirname, '../cache/tts')
const VOICE = process.env.TTS_VOICE || 'zh-CN-XiaoyiNeural'

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function synthesize(text) {
  if (!text) return Promise.resolve(null)

  const hash = crypto.createHash('md5').update(text).digest('hex')
  const filePath = path.join(CACHE_DIR, `${hash}.mp3`)
  const urlPath = `/tts/${hash}.mp3`

  if (fs.existsSync(filePath)) return Promise.resolve(urlPath)

  return new Promise((resolve) => {
    const bin = process.env.EDGE_TTS_BIN || 'edge-tts'
    const proc = spawn(bin, ['--voice', VOICE, '--text', text, '--write-media', filePath])
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(filePath)) {
        resolve(urlPath)
      } else {
        console.error('[TTS] edge-tts failed, code:', code)
        resolve(null)
      }
    })
    proc.on('error', err => {
      console.error('[TTS] spawn error:', err.message)
      resolve(null)
    })
  })
}

module.exports = { synthesize }
