const { app, BrowserWindow } = require('electron')
const path = require('path')

let mainWindow = null
let httpServer = null

app.whenReady().then(async () => {
  // Must be set before any require that touches state.js or tts.js
  global.__claudio_db_path = path.join(app.getPath('userData'), 'state.db')
  global.__claudio_cache_path = path.join(app.getPath('userData'), 'cache/tts')

  const { createApp } = require('./server')

  const { server } = createApp()

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })

  httpServer = server
  const port = server.address().port

  mainWindow = new BrowserWindow({
    width: 520,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'Claudio',
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'pwa', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => { mainWindow = null })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = new BrowserWindow({
        width: 520,
        height: 800,
        minWidth: 400,
        minHeight: 600,
        title: 'Claudio',
        backgroundColor: '#0a0a0a',
        icon: path.join(__dirname, 'pwa', 'icon-512.png'),
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      mainWindow.loadURL(`http://127.0.0.1:${port}`)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (httpServer) httpServer.close()
})
