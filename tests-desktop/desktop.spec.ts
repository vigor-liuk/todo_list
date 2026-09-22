import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('desktop storage, isolated renderer, import/export, hidden reminders and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'little-day-desktop-'))
  const env = { ...process.env, LITTLE_DAY_DATA_DIR: directory }
  delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ args: [resolve('.')], env, timeout: 20000 })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    await page.route('https://v1.hitokoto.cn/**', route => route.abort())
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible()
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
    await app.evaluate(({ Notification }) => {
      const original = Notification.prototype.show
      const state = globalThis as unknown as { delivered: number }
      state.delivered = 0
      Notification.prototype.show = function () { state.delivered++; original.call(this) }
    })
    expect(await app.evaluate(({ BrowserWindow }) => {
      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      return [preferences.contextIsolation, preferences.sandbox, preferences.nodeIntegration]
    })).toEqual([true, true, false])
    await page.getByRole('button', { name: '新建任务', exact: true }).click()
    await page.getByLabel('准备做点什么？').fill('桌面离线任务')
    await page.getByLabel('到期提醒时间').fill('')
    await page.getByRole('button', { name: '添加任务', exact: true }).click()
    await page.getByRole('button', { name: /全部任务/ }).click()
    await expect(page.getByRole('button', { name: '桌面离线任务', exact: true })).toBeVisible()
    const file = join(directory, 'tasks.json')
    await expect.poll(async () => JSON.parse(await readFile(file, 'utf8')).tasks.length).toBe(1)
    const before = await readFile(file, 'utf8')
    await page.getByLabel('导入任务文件').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
    await expect(page.getByRole('status')).toContainText('有效的 JSON')
    expect(await readFile(file, 'utf8')).toBe(before)
    const exported = join(directory, 'export.json')
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, exported)
    await page.getByRole('button', { name: '导出任务', exact: true }).click()
    await expect.poll(async () => { try { return JSON.parse(await readFile(exported, 'utf8')).version } catch { return 0 } }).toBe(1)
    const backup = JSON.parse(await readFile(exported, 'utf8'))
    const reminder = { ...backup.tasks[0], id: 'reminder', title: '后台提醒验证', due: '2099-01-01T09:00' }
    page.once('dialog', dialog => dialog.accept())
    await page.getByLabel('导入任务文件').setInputFiles({ name: 'tasks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([reminder])) })
    await expect(page.getByRole('status')).toContainText('任务已合并')
    expect(JSON.parse(await readFile(file, 'utf8')).tasks).toHaveLength(2)
    await page.getByRole('button', { name: '数据与备份', exact: true }).click()
    await expect(page.locator('.storage-dialog')).toContainText(directory)
    await expect(page.locator('.storage-dialog')).toContainText('tasks.json.before-import.bak')
    await app.evaluate(({ shell }) => {
      shell.openPath = async path => { (globalThis as unknown as { openedPath: string }).openedPath = path; return '' }
    })
    await page.getByRole('button', { name: '打开数据文件夹', exact: true }).click()
    expect(await app.evaluate(() => (globalThis as unknown as { openedPath: string }).openedPath)).toBe(directory)
    const exportedBackup = join(directory, 'backup-export.json')
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, exportedBackup)
    await page.getByRole('button', { name: '导出上次备份', exact: true }).click()
    await expect.poll(async () => { try { return JSON.parse(await readFile(exportedBackup, 'utf8')).tasks.length } catch { return -1 } }).toBe(1)
    await page.getByRole('button', { name: '关闭数据与备份', exact: true }).click()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
    await page.evaluate(task => window.littleDay!.command({ type: 'upsert', task }), { ...reminder, due: '2020-01-01T09:00' })
    await expect.poll(async () => JSON.parse(await readFile(file, 'utf8')).tasks.find((t: { id: string }) => t.id === 'reminder').reminded).toBe(true)
    expect(await app.evaluate(({ Notification }) => Notification.isSupported())).toBe(true)
    expect(await app.evaluate(() => (globalThis as unknown as { delivered: number }).delivered)).toBe(1)
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
    await page.getByRole('button', { name: '查看提醒', exact: true }).click()
    await expect(page.locator('.alert-entry')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/desktop-electron.png' })
    await app.close()
    app = await launch(); page = await app.firstWindow()
    await page.getByRole('button', { name: /全部任务/ }).click()
    await expect(page.getByRole('button', { name: '桌面离线任务', exact: true })).toBeVisible()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '查看提醒', exact: true }).click()
    await expect(page.locator('.alert-entry')).toHaveCount(0)
    await page.getByRole('button', { name: '完成：桌面离线任务', exact: true }).click()
    await expect(page.getByRole('button', { name: '取消完成：桌面离线任务', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '删除：桌面离线任务', exact: true }).click()
    await expect(page.getByRole('button', { name: '桌面离线任务', exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
})
