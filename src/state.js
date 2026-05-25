require('dotenv').config()
const { DatabaseSync } = require('node:sqlite')
const path = require('path')

const db = new DatabaseSync(path.join(__dirname, '../state.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT,
    title TEXT,
    artist TEXT,
    played_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT,
    title TEXT,
    artist TEXT,
    url TEXT,
    added_at INTEGER DEFAULT (unixepoch())
  );
`)

let _broadcast = null
let _nowPlaying = null

module.exports = {
  setBroadcast(fn) { _broadcast = fn },
  broadcast(data) { if (_broadcast) _broadcast(data) },

  addMessage(role, content) {
    db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run(role, content)
  },

  getRecentMessages(limit = 10) {
    return db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT ?').all(limit).reverse()
  },

  addPlay(song) {
    db.prepare('INSERT INTO plays (song_id, title, artist) VALUES (?, ?, ?)').run(song.id || '', song.title, song.artist)
  },

  getRecentPlays(limit = 10) {
    return db.prepare('SELECT title, artist, played_at FROM plays ORDER BY id DESC LIMIT ?').all(limit)
  },

  savePlan(date, content) {
    db.prepare('INSERT INTO plans (date, content) VALUES (?, ?)').run(date, content)
  },

  getTodayPlan() {
    const today = new Date().toISOString().slice(0, 10)
    const row = db.prepare('SELECT content FROM plans WHERE date = ? ORDER BY id DESC LIMIT 1').get(today)
    return row ? JSON.parse(row.content) : null
  },

  setPrefs(key, value) {
    db.prepare('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  },

  getPrefs(key) {
    if (key) {
      const row = db.prepare('SELECT value FROM prefs WHERE key = ?').get(key)
      return row ? JSON.parse(row.value) : null
    }
    const rows = db.prepare('SELECT key, value FROM prefs').all()
    return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
  },

  enqueue(songs) {
    const insert = db.prepare('INSERT INTO queue (song_id, title, artist, url) VALUES (?, ?, ?, ?)')
    songs.forEach(s => insert.run(s.id || '', s.title, s.artist, s.url || ''))
  },

  getQueue() {
    return db.prepare('SELECT * FROM queue ORDER BY id ASC LIMIT 20').all()
  },

  dequeue() {
    const song = db.prepare('SELECT * FROM queue ORDER BY id ASC LIMIT 1').get()
    if (song) db.prepare('DELETE FROM queue WHERE id = ?').run(song.id)
    return song
  },

  clearQueue() {
    db.prepare('DELETE FROM queue').run()
  },

  getNowPlaying() { return _nowPlaying },

  setNowPlaying(song) {
    _nowPlaying = song
    if (song) this.addPlay(song)
    if (_broadcast) _broadcast({ type: 'now-playing', song })
  }
}
