import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('desktop recommendations allow knowledge search, safe source links and persisted tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'little-day-recommendations-'))
  const env = { ...process.env, LITTLE_DAY_DATA_DIR: directory }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.')], env, timeout: 20000 })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
    await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible()
    await page.route('https://v1.hitokoto.cn/**', route => route.abort())
    let requests = 0
    await page.route('https://zh.wikipedia.org/**', route => {
      requests++
      return route.fulfill({ json: { query: { search: [{ title: '桌面参考资料' }] } } })
    })
    await page.evaluate(() => localStorage.removeItem('little-day-recommendations-v1'))
    await page.reload()
    await expect(page.locator('.recommendation-summary')).toContainText('已联网')
    expect(requests).toBeGreaterThan(0)
    await app.evaluate(({ shell }) => {
      shell.openExternal = async url => { (globalThis as unknown as { external: string }).external = url }
    })
    const card = page.locator('.recommendation-card').first()
    const url = await card.locator('a').getAttribute('href')
    await card.locator('a').click()
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { external: string }).external)).toBe(url)
    await card.getByRole('button', { name: '选择并调整', exact: true }).click()
    await page.getByRole('button', { name: '确认加入计划' }).click()
    await expect(card.getByRole('button', { name: '已在清单中' })).toBeDisabled()
    const saved = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8'))
    expect(saved.tasks).toHaveLength(1)
    expect(saved.tasks[0].note).toContain(url)
    expect(saved.tasks[0].recommendation.original.title).toBe(saved.tasks[0].title)
    expect(saved.tasks[0].recommendation.accepted.title).toBe(saved.tasks[0].title)
    await page.evaluate(task => window.littleDay!.command({ type: 'upsert', task: { ...task, note: '桌面调整后的备注' } }), saved.tasks[0])
    const edited = JSON.parse(await readFile(join(directory, 'tasks.json'), 'utf8')).tasks[0]
    expect(edited.recommendation.changes).toHaveLength(1)
    expect(edited.recommendation.changes[0].note).toBe('桌面调整后的备注')
    expect(edited.recommendation.accepted.note).toContain(url)
    await page.reload()
    await expect(page.locator('.recommendation-card').first().getByRole('button', { name: '已在清单中' })).toBeDisabled()
    await page.evaluate(() => window.open('https://zh.wikipedia.org.evil.example/wiki/test'))
    expect(await app.evaluate(() => (globalThis as unknown as { external: string }).external)).toBe(url)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
})
