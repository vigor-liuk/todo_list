import { _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const directory = await mkdtemp(join(tmpdir(), 'little-day-packaged-'))
const env = { ...process.env, PATH: process.env.SystemRoot + '\\System32' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: resolve(process.argv[2] || 'release/win-unpacked/LittleDay.exe'), args: [`--user-data-dir=${directory}`], env, timeout: 20000 })
try {
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData') }))
  assert.equal(info.packaged, true)
  assert.equal(info.data.toLowerCase(), directory.toLowerCase(), 'Must use an isolated test profile')
  const page = await app.firstWindow()
  await page.route('https://v1.hitokoto.cn/**', route => route.abort())
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('准备做点什么？').fill('安装版离线验证')
  await page.getByLabel('到期提醒时间').fill('')
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  await page.getByRole('button', { name: /全部任务/ }).click()
  await page.getByRole('button', { name: '安装版离线验证', exact: true }).waitFor()
  const data = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8'))
  assert.equal(data.tasks[0].title, '安装版离线验证')
  await page.screenshot({ path: 'test-results/packaged-app.png' })
  console.log('Packaged EXE passed: bundled runtime, isolated profile, local assets, offline CRUD and disk persistence.')
} finally {
  await app.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
