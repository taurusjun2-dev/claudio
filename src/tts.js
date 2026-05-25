const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DEFAULT_VOICE = 'zh-CN-XiaoyiNeural'

function getCacheDir() {
  if (global.__claudio_cache_path) return global.__claudio_cache_path
  return path.join(__dirname, '../cache/tts')
}

async function synthesize(text, voice) {
  if (!text) return null
  const v = voice || DEFAULT_VOICE

  const cacheDir = getCacheDir()
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const hash = crypto.createHash('md5').update(v + ':' + text).digest('hex')
  const filePath = path.join(cacheDir, `${hash}.mp3`)
  const urlPath = `/tts/${hash}.mp3`

  if (fs.existsSync(filePath)) return urlPath

  // Each request gets its own temp dir to avoid concurrent toFile() collisions
  const tmpDir = path.join(cacheDir, `tmp_${hash}_${process.pid}_${Date.now()}`)
  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    const tts = new MsEdgeTTS()
    await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioFilePath } = await tts.toFile(tmpDir, text)
    fs.renameSync(audioFilePath, filePath)
    return urlPath
  } catch (err) {
    console.error('[TTS] error:', err.message)
    return null
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

module.exports = { synthesize }
