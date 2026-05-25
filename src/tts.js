const { MsEdgeTTS } = require('msedge-tts')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const VOICE = 'zh-CN-XiaoyiNeural'
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

function getCacheDir() {
  if (global.__claudio_cache_path) return global.__claudio_cache_path
  return path.join(__dirname, '../cache/tts')
}

async function synthesize(text) {
  if (!text) return null

  const cacheDir = getCacheDir()
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const hash = crypto.createHash('md5').update(text).digest('hex')
  const filePath = path.join(cacheDir, `${hash}.mp3`)
  const urlPath = `/tts/${hash}.mp3`

  if (fs.existsSync(filePath)) return urlPath

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(VOICE, FORMAT)
    const { audioFilePath } = await tts.toFile(cacheDir, text)
    // toFile always writes to audio.mp3, rename to our hash name
    if (audioFilePath !== filePath) {
      fs.renameSync(audioFilePath, filePath)
    }
    return urlPath
  } catch (err) {
    console.error('[TTS] error:', err.message)
    return null
  }
}

module.exports = { synthesize }
