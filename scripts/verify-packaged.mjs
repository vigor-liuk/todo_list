import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const directory = await mkdtemp(join(tmpdir(), 'little-day-packaged-'))
const expectedVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version
const env = { ...process.env, PATH: process.env.SystemRoot + '\\System32' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: resolve(process.argv[2] || 'release/win-unpacked/LittleDay.exe'), args: [`--user-data-dir=${directory}`], env, timeout: 20000 })
try {
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData'), version: app.getVersion() }))
  assert.equal(info.packaged, true)
  assert.equal(info.version, expectedVersion, 'Packaged version must match the current release')
  assert.equal(info.data.toLowerCase(), directory.toLowerCase(), 'Must use an isolated test profile')
  const page = await app.firstWindow()
  await page.route('https://v1.hitokoto.cn/**', route => route.abort())
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await expect(page.locator('.recommendation-card').first()).toBeVisible()
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('准备做点什么？').fill('安装版离线验证')
  await page.getByLabel('到期提醒时间').fill('')
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  await page.getByRole('button', { name: /全部任务/ }).click()
  await page.getByRole('button', { name: '安装版离线验证', exact: true }).waitFor()
  const data = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8'))
  assert.equal(data.tasks[0].title, '安装版离线验证')
  await page.getByRole('button', { name: '开始：安装版离线验证', exact: true }).click()
  await expect(page.locator('.task-timing')).toContainText('进行中')
  await page.getByRole('button', { name: /^时间回顾/ }).click()
  await expect(page.locator('.chart-row')).toContainText('安装版离线验证')
  await page.getByRole('button', { name: '查看记录：安装版离线验证', exact: true }).click()
  await page.getByRole('button', { name: '结束并完成', exact: true }).click()
  await expect(page.locator('.chart-task')).toContainText('已完成')
  const completed = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8')).tasks[0]
  assert.ok(Number.isFinite(Date.parse(completed.startedAt)))
  assert.ok(Date.parse(completed.completedAt) >= Date.parse(completed.startedAt))
  await page.getByRole('button', { name: /全部任务/ }).click()
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('准备做点什么？').fill('安装版周期任务')
  await page.getByLabel('重复周期').selectOption('daily')
  await page.getByLabel('每次提醒时间').fill('20:00')
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  await expect(page.locator('.task-row').filter({ hasText: '安装版周期任务' })).toContainText('每天 20:00')
  const recurring = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8')).tasks.find(task => task.title === '安装版周期任务')
  assert.equal(recurring.recurrence.frequency, 'daily')
  await page.screenshot({ path: 'test-results/packaged-app.png' })
  console.log(`Packaged EXE ${info.version} passed: bundled runtime, isolated profile, local assets, recommendations, task timing, recurring tasks, daily review and disk persistence.`)
} finally {
  await app.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
