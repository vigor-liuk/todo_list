import { test, expect } from '@playwright/test'

test('web export migrates task data; invalid import is harmless and valid import requires confirmation', async ({ page }) => {
  await page.goto('/')
  const before = await page.evaluate(() => localStorage.getItem('little-day-tasks-v1'))
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出任务', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/小日任务-.*\.json/)
  await page.getByLabel('导入任务文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') })
  await expect(page.getByRole('status')).toContainText('有效的 JSON')
  expect(await page.evaluate(() => localStorage.getItem('little-day-tasks-v1'))).toBe(before)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByLabel('导入任务文件').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"tasks":[]}') })
  expect(await page.evaluate(() => localStorage.getItem('little-day-tasks-v1'))).toBe(before)
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('导入任务文件').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"tasks":[]}') })
  await expect(page.getByRole('status')).toContainText('任务已合并')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-day-tasks-v1-before-import')!).tasks)).toEqual(JSON.parse(before!))
  await page.reload()
  await expect(page.locator('.task-row')).toHaveCount(JSON.parse(before!).length)
  await page.getByRole('button', { name: '数据与备份', exact: true }).click()
  await expect(page.locator('.storage-dialog')).toContainText('通常在“下载”文件夹')
  const backupDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出上次备份', exact: true }).click()
  expect((await backupDownload).suggestedFilename()).toMatch(/小日导入前备份-.*\.json/)
})

test('merging a browser export preserves local additions and avoids duplicates', async ({ page }) => {
  await page.goto('/')
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('little-day-tasks-v1')!))
  const incoming = { ...original[0], id: 'imported-new', title: '导入的新任务', done: false, due: '' }
  const payload = { name: 'merge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ ...original[0], title: '过时的同编号任务' }, incoming])) }
  for (let i = 0; i < 2; i++) {
    page.once('dialog', dialog => dialog.accept())
    await page.getByLabel('导入任务文件').setInputFiles(payload)
    await expect(page.getByRole('status')).toContainText('任务已合并')
  }
  await page.reload()
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('little-day-tasks-v1')!))
  expect(result).toHaveLength(original.length + 1)
  expect(result.slice(0, original.length)).toEqual(original)
})
