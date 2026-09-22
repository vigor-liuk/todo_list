import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, powerMonitor, shell, session, protocol, net } from 'electron'
import { join, resolve, sep, extname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { TaskStore, atomicWrite } from './store.mjs'
import { parseTasks, serializeTasks } from '../shared/tasks.mjs'

app.setName('LittleDay')
app.setAppUserModelId('cn.littleday.todo')
// A separate profile is available only for development / automated tests.
if (!app.isPackaged && process.env.LITTLE_DAY_DATA_DIR) app.setPath('userData', resolve(process.env.LITTLE_DAY_DATA_DIR))
protocol.registerSchemesAsPrivileged([{ scheme: 'little-day', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
const rootURL = 'little-day://app/index.html'
let window, tray, store, timer, quitting = false
const notifications = new Set()

function showWindow() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show(); window.focus()
}
function broadcast() {
  if (window && !window.isDestroyed()) window.webContents.send('tasks:changed', store.snapshot())
}
function tick() {
  try {
    const due = store.tick()
    if (!due.length) return
    broadcast()
    if (Notification.isSupported()) for (const task of due) {
      const notification = new Notification({ title: '小日 · 待办提醒', body: task.title, icon: join(app.getAppPath(), 'build/icon.png') })
      notifications.add(notification)
      notification.on('click', showWindow)
      notification.on('close', () => notifications.delete(notification))
      notification.on('failed', () => notifications.delete(notification))
      notification.show()
    }
  } catch {
    window?.webContents.send('tasks:error', '无法保存提醒状态，请检查磁盘空间和数据目录权限。')
  }
}
function authorized(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== rootURL) throw Error('拒绝不受信任的请求。')
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { quitting = true; clearInterval(timer) })
  app.on('window-all-closed', () => { if (quitting) app.quit() })
  app.whenReady().then(async () => {
    try { store = new TaskStore(app.getPath('userData')) } catch (error) {
      dialog.showErrorBox('小日无法读取任务', `原文件已保留，未覆盖。请检查或恢复备份后重试。\n数据目录：${app.getPath('userData')}\n${error.message}`)
      app.quit(); return
    }
    const dist = join(app.getAppPath(), 'dist')
    protocol.handle('little-day', request => {
      const url = new URL(request.url)
      const file = resolve(dist, `.${decodeURIComponent(url.pathname)}`)
      if (url.host !== 'app' || !file.startsWith(`${dist}${sep}`) || !['.html', '.js', '.css', '.svg', '.png', '.ico'].includes(extname(file))) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(file).href)
    })
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://v1.hitokoto.cn https://zh.wikipedia.org; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"],
    } }))
    ipcMain.handle('tasks:load', event => { authorized(event); return store.snapshot() })
    ipcMain.handle('tasks:command', (event, command) => { authorized(event); const result = store.command(command); broadcast(); return result })
    ipcMain.handle('tasks:storage-info', event => {
      authorized(event)
      return { dataPath: store.file, backupPath: `${store.file}.before-import.bak`, hasBackup: existsSync(`${store.file}.before-import.bak`) }
    })
    ipcMain.handle('tasks:open-data-folder', async event => {
      authorized(event)
      const error = await shell.openPath(app.getPath('userData'))
      if (error) throw Error(error)
    })
    ipcMain.handle('tasks:export', async (event, backup = false) => {
      authorized(event)
      if (typeof backup !== 'boolean') throw Error('无效的导出选项。')
      // Snapshot before opening a modal, so an intervening import cannot change this backup.
      const text = serializeTasks(backup ? parseTasks(readFileSync(`${store.file}.before-import.bak`, 'utf8')) : store.tasks)
      const now = new Date()
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const { canceled, filePath } = await dialog.showSaveDialog(window, { title: backup ? '导出上次导入前的备份' : '导出任务备份', defaultPath: join(app.getPath('downloads'), `小日${backup ? '导入前备份' : '任务'}-${day}.json`), filters: [{ name: 'JSON 任务备份', extensions: ['json'] }] })
      if (canceled || !filePath) return null
      if ([store.file, `${store.file}.before-import.bak`].some(path => resolve(path).toLowerCase() === resolve(filePath).toLowerCase())) throw Error('请选择其他位置，不能覆盖应用内部数据文件。')
      atomicWrite(filePath, text); return filePath
    })
    window = new BrowserWindow({ width: 1440, height: 960, minWidth: 820, minHeight: 620, show: false, title: '小日 · 待办事项', icon: join(app.getAppPath(), 'build/icon.png'), autoHideMenuBar: true,
      webPreferences: { preload: join(app.getAppPath(), 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    Menu.setApplicationMenu(null)
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === 'https://hitokoto.cn/' || /^https:\/\/zh\.wikipedia\.org\/wiki\/[^\s]+$/.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => { if (url !== rootURL) event.preventDefault() })
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide() } })
    window.on('session-end', () => { quitting = true })
    tray = new Tray(join(app.getAppPath(), 'build/icon.png'))
    tray.setToolTip('小日 · 待办事项（后台提醒运行中）')
    tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开小日', click: showWindow }, { type: 'separator' }, { label: '退出', click: () => app.quit() }]))
    tray.on('click', showWindow)
    window.once('ready-to-show', showWindow)
    powerMonitor.on('resume', tick)
    await window.loadURL(rootURL)
    tick(); timer = setInterval(tick, 1000)
  }).catch(error => { dialog.showErrorBox('小日启动失败', error.message); app.quit() })
}
