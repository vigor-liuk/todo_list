import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.route('https://v1.hitokoto.cn/**', route => route.abort())
  await page.route('https://zh.wikipedia.org/**', route => route.fulfill({ json: { query: { search: [{ title: '摄影构图' }, { title: '学习方法' }] } } }))
})

test('daily search is cached, adds once, preserves sources and skipped choices', async ({ page }) => {
  let requests = 0
  await page.route('https://zh.wikipedia.org/**', route => { requests++; return route.fulfill({ json: { query: { search: [{ title: '公开资料' }] } } }) })
  await page.goto('/')
  const panel = page.locator('.recommendations')
  await expect(panel.locator('.recommendation-summary')).toContainText('已联网')
  await expect(panel.locator('.recommendation-card')).toHaveCount(5)
  const count = requests
  expect(count).toBeGreaterThan(0)
  const first = panel.locator('.recommendation-card').first()
  const title = await first.locator('h3').innerText()
  await first.getByRole('button', { name: '选择并调整', exact: true }).click()
  await page.getByRole('button', { name: '确认加入计划' }).dblclick()
  await expect(first.getByRole('button', { name: '已在清单中' })).toBeDisabled()
  const tasks = await page.evaluate(() => JSON.parse(localStorage.getItem('little-day-tasks-v1')!))
  expect(tasks.filter((t: { title: string }) => t.title === title)).toHaveLength(1)
  expect(tasks.find((t: { title: string }) => t.title === title).note).toContain('https://zh.wikipedia.org/wiki/')
  const skipped = panel.locator('.recommendation-card').nth(1)
  const skippedTitle = await skipped.locator('h3').innerText()
  await skipped.getByRole('button', { name: /^跳过：/ }).click()
  await page.reload()
  await expect(panel.locator('.recommendation-card')).toHaveCount(4)
  await expect(panel.getByRole('heading', { name: skippedTitle, exact: true })).toHaveCount(0)
  expect(requests).toBe(count)
  await panel.getByRole('button', { name: '恢复已跳过建议' }).click()
  await expect(panel.locator('.recommendation-card')).toHaveCount(5)
})

test('preferences persist, six distinct suggestions fit budget, offline switch prevents searches', async ({ page }) => {
  let requests = 0
  await page.route('https://zh.wikipedia.org/**', route => { requests++; return route.abort() })
  await page.goto('/')
  await expect(page.locator('.recommendation-summary')).toContainText('使用本地建议')
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  await page.getByRole('group', { name: '学习成长', exact: true }).getByRole('radio', { name: '感兴趣', exact: true }).check()
  for (const name of ['运动休息', '生活整理', '人际连接', '兴趣创作', '自我回顾']) await page.getByRole('group', { name, exact: true }).getByRole('radio', { name: '不感兴趣', exact: true }).check()
  await page.getByLabel('我的兴趣', { exact: true }).fill('摄影')
  await page.getByLabel('每天候选数量').selectOption('6')
  await page.getByLabel('每日可用时间').selectOption('15')
  await page.getByLabel('每天联网寻找参考资料').uncheck()
  await page.getByRole('button', { name: '保存推荐偏好' }).click()
  const cards = page.locator('.recommendation-card')
  await expect(cards).toHaveCount(6)
  await expect(page.locator('.recommendation-summary')).toContainText('联网已关闭')
  expect(new Set(await cards.locator('h3').allTextContents()).size).toBe(6)
  await expect(cards.first()).toContainText('摄影')
  await expect(page.locator('.recommendation-summary')).toContainText('6 个候选')
  const count = requests
  await page.reload()
  await expect(cards).toHaveCount(6)
  expect(requests).toBe(count)
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  await expect(page.getByLabel('我的兴趣', { exact: true })).toHaveValue('摄影')
  await page.getByRole('group', { name: '学习成长', exact: true }).getByRole('radio', { name: '不感兴趣', exact: true }).check()
  await page.getByRole('button', { name: '保存推荐偏好' }).click()
  await expect(page.getByText('已暂停每日推荐', { exact: true })).toBeVisible()
  await expect(cards).toHaveCount(0)
})

test('midnight generates a new batch and searches again', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-22T23:59:50') })
  let requests = 0
  await page.route('https://zh.wikipedia.org/**', route => { requests++; return route.fulfill({ json: { query: { search: [{ title: `资料${requests}` }] } } }) })
  await page.goto('/')
  await expect(page.locator('.recommendation-summary')).toContainText('已联网')
  const before = requests
  await page.locator('.recommendation-actions button').nth(1).click()
  await expect(page.locator('.recommendation-card')).toHaveCount(4)
  await page.clock.fastForward(20_000)
  await expect(page.locator('.recommendation-summary')).toContainText('09/23')
  await expect(page.locator('.recommendation-summary')).toContainText('已联网')
  await expect(page.locator('.recommendation-card')).toHaveCount(5)
  expect(requests).toBeGreaterThan(before)
})

test('personalized search sends only interests and topics, and ignores a stale response', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('little-day-tasks-v1', JSON.stringify([{ id: 'private', title: '绝不上传的私人任务', note: '私人备注', category: '课内', priority: '中', due: '', done: false, reminded: false }]))
    localStorage.setItem('little-day-preferences-v1', JSON.stringify({ areas: ['学习成长'], interests: '摄影', count: 3, minutes: 30, online: true }))
  })
  const queries: string[] = []
  let finish: (() => void) | undefined
  await page.route('https://zh.wikipedia.org/**', async route => {
    queries.push(new URL(route.request().url()).searchParams.get('srsearch')!)
    await new Promise<void>(resolve => { finish = resolve })
    await route.fulfill({ json: { query: { search: [{ title: '旧资料' }] } } })
  })
  await page.goto('/')
  await expect.poll(() => queries.length).toBe(1)
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  await page.getByLabel('我的兴趣', { exact: true }).fill('文学')
  await page.getByLabel('每天联网寻找参考资料').uncheck()
  await page.getByRole('button', { name: '保存推荐偏好' }).click()
  finish!()
  await expect(page.locator('.recommendation-summary')).toContainText('联网已关闭')
  await expect(page.locator('.recommendation-card').first()).toContainText('文学')
  await expect(page.locator('.recommendation-card')).not.toContainText(['旧资料', '旧资料', '旧资料'])
  expect(queries).toEqual(['摄影'])
})

test('failed task writes do not mark recommendations as added', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.recommendation-summary')).toContainText('已联网')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key === 'little-day-tasks-v1') throw Error('存储空间不足'); original.call(this, key, value) }
  })
  const card = page.locator('.recommendation-card').first()
  await card.getByRole('button', { name: '选择并调整', exact: true }).click()
  await page.getByRole('button', { name: '确认加入计划' }).click()
  await expect(page.getByRole('alert')).toContainText('保存失败')
  await page.getByRole('button', { name: '再想想' }).click()
  await expect(page.getByRole('status')).toContainText('保存失败')
  await expect(card.getByRole('button', { name: '选择并调整', exact: true })).toBeEnabled()
  await expect(card.getByRole('button', { name: '已在清单中' })).toHaveCount(0)
})

test('malformed search data falls back and mobile settings fit', async ({ page }) => {
  await page.route('https://zh.wikipedia.org/**', route => route.fulfill({ json: { query: { search: [{ title: 12 }, { title: '' }] } } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.recommendation-summary')).toContainText('使用本地建议')
  await expect(page.locator('.recommendation-source a')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.recommendations').screenshot({ path: 'test-results/recommendations-mobile.png' })
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  expect(await page.locator('.preference-dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await page.locator('.preference-dialog').screenshot({ path: 'test-results/attitude-preferences-mobile.png' })
})

test('busy days receive a smaller budget and broken caches recover safely', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-22T12:00:00') })
  await page.addInitScript(() => {
    localStorage.setItem('little-day-tasks-v1', JSON.stringify(Array.from({ length: 5 }, (_, index) => ({ id: `busy-${index}`, title: `已有任务${index}`, note: '', category: '课内', priority: '中', due: '2026-09-22T23:59', done: false, reminded: false }))))
    localStorage.setItem('little-day-preferences-v1', JSON.stringify({ areas: ['学习成长'], interests: '', count: 3, minutes: 60, online: false }))
    localStorage.setItem('little-day-recommendations-v1', '{broken')
  })
  await page.goto('/')
  await expect(page.locator('.recommendation-summary')).toContainText('8 个候选')
  await expect(page.locator('.recommendation-reason').first()).toContainText('待办较多')
  await expect(page.locator('.task-row')).toHaveCount(5)
})

test('attitudes control the online mix, persist and allow excluding every area', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('little-day-preferences-v1')) localStorage.setItem('little-day-preferences-v1', JSON.stringify({
      areaAttitudes: { 学习成长: 'neutral', 运动休息: 'neutral', 生活整理: 'neutral', 人际连接: 'neutral', 兴趣创作: 'neutral', 自我回顾: 'neutral' },
      interests: '', count: 6, minutes: 30, online: false,
    }))
  })
  const queries: string[] = []
  await page.route('https://zh.wikipedia.org/**', route => {
    queries.push(new URL(route.request().url()).searchParams.get('srsearch')!)
    return route.fulfill({ json: { query: { search: [{ title: '参考资料' }] } } })
  })
  await page.goto('/')
  await expect(page.locator('.recommendation-card')).toHaveCount(5)
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  await page.getByRole('group', { name: '学习成长', exact: true }).getByRole('radio', { name: '感兴趣', exact: true }).check()
  await page.getByRole('group', { name: '生活整理', exact: true }).getByRole('radio', { name: '不感兴趣', exact: true }).check()
  await page.getByLabel('每天联网寻找参考资料').check()
  await page.getByRole('button', { name: '保存推荐偏好' }).click()
  await expect(page.locator('.recommendation-summary')).toContainText('已联网')
  const areaTags = page.locator('.recommendation-meta > span:first-child')
  expect((await areaTags.allTextContents()).filter(area => area === '学习成长')).toHaveLength(5)
  expect(await areaTags.allTextContents()).not.toContain('生活整理')
  expect(queries).toHaveLength(2)
  expect(queries).toContain('学习方法')
  expect(queries).not.toContain('整理收纳')
  await page.reload()
  await expect(page.locator('.recommendation-card')).toHaveCount(6)
  expect(queries).toHaveLength(2)
  expect((await areaTags.allTextContents()).filter(area => area === '学习成长')).toHaveLength(5)
  await page.getByRole('button', { name: '推荐偏好', exact: true }).click()
  await expect(page.getByRole('group', { name: '生活整理', exact: true }).getByRole('radio', { name: '不感兴趣', exact: true })).toBeChecked()
  for (const name of ['学习成长', '运动休息', '生活整理', '人际连接', '兴趣创作', '自我回顾']) await page.getByRole('group', { name, exact: true }).getByRole('radio', { name: '不感兴趣', exact: true }).check()
  await page.getByRole('button', { name: '保存推荐偏好' }).click()
  await expect(page.getByText('已暂停每日推荐', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.recommendation-card')).toHaveCount(0)
  await expect(page.getByText('已暂停每日推荐', { exact: true })).toBeVisible()
  expect(queries).toHaveLength(2)
})
