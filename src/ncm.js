let api = null

async function getApi() {
  if (!api) {
    try {
      api = require('NeteaseCloudMusicApi')
    } catch {
      console.warn('[NCM] NeteaseCloudMusicApi not installed')
      api = {}
    }
  }
  return api
}

async function search(keyword, limit = 5) {
  try {
    const { search: ncmSearch } = await getApi()
    if (!ncmSearch) return []
    const result = await ncmSearch({ keywords: keyword, limit })
    const songs = result.body?.result?.songs || []
    return songs.map(s => ({
      id: String(s.id),
      title: s.name,
      artist: (s.artists || s.ar || []).map(a => a.name).join(', '),
      album: (s.album || s.al || {}).name || ''
    }))
  } catch (err) {
    console.error('[NCM] search error:', err.message)
    return []
  }
}

async function getSongUrl(songId) {
  try {
    const { song_url } = await getApi()
    if (!song_url) return null
    const result = await song_url({ id: songId })
    return result.body?.data?.[0]?.url || null
  } catch (err) {
    console.error('[NCM] song_url error:', err.message)
    return null
  }
}

async function getLyric(songId) {
  try {
    const { lyric } = await getApi()
    if (!lyric) return null
    const result = await lyric({ id: songId })
    return result.body?.lrc?.lyric || null
  } catch (err) {
    console.error('[NCM] lyric error:', err.message)
    return null
  }
}

module.exports = { search, getSongUrl, getLyric }
