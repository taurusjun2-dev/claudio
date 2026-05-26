const cron = require('node-cron')
const { assemble, assembleForScheduler } = require('./context')
const llm = require('./llm')
const ncm = require('./ncm')
const state = require('./state')

let _broadcast = null

function init(broadcast) {
  _broadcast = broadcast

  // 07:00 规划今天
  cron.schedule('0 7 * * *', planDay, { timezone: 'Asia/Shanghai' })
  // 09:00 早间播报
  cron.schedule('0 9 * * *', morningBrief, { timezone: 'Asia/Shanghai' })
  // 每小时情绪检查（09:00-22:00）
  cron.schedule('0 9-22 * * *', hourlyMoodCheck, { timezone: 'Asia/Shanghai' })

  console.log('[Scheduler] initialized')
}

async function planDay() {
  console.log('[Scheduler] planning day...')
  const { systemPrompt, userPrompt } = assembleForScheduler('请为今天规划音乐日程，包含早晨、工作、下午、晚间风格建议，以及今天推荐歌单（5-10首）。say 字段留空。')
  const result = await llm.think(systemPrompt, userPrompt)
  state.savePlan(new Date().toISOString().slice(0, 10), JSON.stringify(result))
  if (_broadcast) _broadcast({ type: 'plan-updated', plan: result })
}

async function morningBrief() {
  console.log('[Scheduler] morning brief...')
  const { systemPrompt, userPrompt } = assembleForScheduler('请进行早安播报，DJ 风格问候，推荐3首适合早晨的歌。')
  const result = await llm.think(systemPrompt, userPrompt)
  // TTS handled by frontend
  if (_broadcast) _broadcast({ type: 'scheduled', event: 'morning-brief', ...result })
}

async function hourlyMoodCheck() {
  const hour = new Date().getHours()
  if (hour < 9 || hour > 22) return

  console.log('[Scheduler] hourly mood check...')
  const { systemPrompt, userPrompt } = assembleForScheduler('根据当前时间和天气，推荐1-2首合适的歌。say 字段留空，只填 play 和 reason。')
  const result = await llm.think(systemPrompt, userPrompt)

  const songs = []
  for (const query of (result.play || []).slice(0, 2)) {
    const results = await ncm.search(query, 1)
    if (results.length > 0) {
      const url = await ncm.getSongUrl(results[0].id)
      songs.push({ ...results[0], url: url || null })
    }
  }

  if (songs.length > 0) {
    state.enqueue(songs)
    if (_broadcast) _broadcast({ type: 'auto-enqueue', songs, reason: result.reason })
  }
}

module.exports = { init, planDay, morningBrief, hourlyMoodCheck }
