const { app, BrowserWindow } = require('electron')
const path = require('path')

const { createApp } = require('./server')
const scheduler = require('./src/scheduler')

let mainWindow = null
let httpServer = null

async function start() {
  // Set database path before any module loads state.js
  global.__claudio_db_path = path.join(app.getPath('userData'), 'state.db')

  const { server } = createApp()

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    })
  })
}

function createWindow(port) {
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
}

app.whenReady().then(async () => {
  const server = await start()
  httpServer = server
  createWindow(server.address().port)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(server.address().port)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (httpServer) httpServer.close()
})
