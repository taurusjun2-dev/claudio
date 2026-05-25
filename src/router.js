const context = require('./context')
const llm = require('./llm')
const ncm = require('./ncm')
const state = require('./state')

const SIMPLE_COMMANDS = {
  '下一首': 'next', '跳过': 'next', 'skip': 'next', 'next': 'next',
  '暂停': 'pause', 'pause': 'pause',
  '继续': 'resume', 'resume': 'resume',
  '停': 'pause', '停止': 'pause'
}

async function handle(input) {
  const trimmed = input.trim()

  const cmd = SIMPLE_COMMANDS[trimmed.toLowerCase()]
  if (cmd) return { type: 'command', action: cmd }

  return handleWithLLM(trimmed)
}

async function handleWithLLM(input) {
  state.addMessage('user', input)

  const nowPlaying = state.getNowPlaying()
  // Get cached story for current song from state
  const storyText = nowPlaying ? (state.getPrefs('story_' + nowPlaying.id) || null) : null
  const { systemPrompt, userPrompt } = await context.assemble(input, nowPlaying, storyText)
  const plan = await llm.think(systemPrompt, userPrompt)

  state.addMessage('assistant', plan.say)

  // Resolve songs from NCM
  const songs = []
  for (const query of (plan.play || []).slice(0, 5)) {
    const results = await ncm.search(query, 1)
    if (results.length > 0) {
      const song = results[0]
      const url = await ncm.getSongUrl(song.id)
      songs.push({ ...song, url: url || null })
    }
  }

  if (songs.length > 0) {
    state.clearQueue()
    state.enqueue(songs)
  }



  return {
    type: 'dj-response',
    say: plan.say,
    songs,
    reason: plan.reason,
    segue: plan.segue
  }
}

module.exports = { handle }
