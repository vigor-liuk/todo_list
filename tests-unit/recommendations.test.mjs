import test from 'node:test'
import assert from 'node:assert/strict'
import { areas, defaults, generateBatch, parsePreferences, validPreferences } from '../src/recommendations.ts'

test('all attitude combinations respect quotas, exclusions, uniqueness and time budget', () => {
  const values = ['interested', 'neutral', 'excluded']
  for (let combination = 0; combination < 3 ** areas.length; combination++) {
    const areaAttitudes = Object.fromEntries(areas.map((area, index) => [area, values[Math.floor(combination / 3 ** index) % 3]]))
    const hasInterested = Object.values(areaAttitudes).includes('interested')
    const hasNeutral = Object.values(areaAttitudes).includes('neutral')
    for (const count of [5, 6, 7, 8, 9, 10]) {
      const preferences = { ...defaults, areaAttitudes, count, interests: '摄影、编程', minutes: 15 }
      const { items } = generateBatch('2026-09-22', preferences, [{ category: '个人', done: false, due: '' }])
      assert.equal(items.length, hasInterested ? count : hasNeutral ? 5 : 0)
      assert.equal(items.filter(item => areaAttitudes[item.area] === 'neutral').length, hasNeutral ? hasInterested ? Math.max(1, Math.round(count * 0.2)) : 5 : 0)
      assert.ok(items.every(item => areaAttitudes[item.area] !== 'excluded'))
      assert.equal(new Set(items.map(item => item.id)).size, items.length)
      assert.equal(new Set(items.map(item => item.title)).size, items.length)
      assert.ok(items.every(item => item.minutes > 0 && item.minutes <= 240))
    }
  }
})

test('neutral exploration rotates daily while a single interested area gets the majority', () => {
  const areaAttitudes = { ...defaults.areaAttitudes, '学习成长': 'interested', '生活整理': 'excluded' }
  const seen = new Set()
  for (let day = 1; day <= 12; day++) {
    const { items } = generateBatch(`2026-09-${String(day).padStart(2, '0')}`, { ...defaults, areaAttitudes }, [])
    assert.equal(items.filter(item => item.area === '学习成长').length, 6)
    assert.ok(items.every(item => item.area !== '生活整理'))
    seen.add(items.find(item => item.area !== '学习成长').area)
  }
  assert.equal(seen.size, 4)
})

test('legacy settings preserve exclusions and valid new settings permit opting out completely', () => {
  const legacy = { areas: ['学习成长'], interests: '摄影', count: 6, minutes: 15, online: false }
  const result = parsePreferences(legacy)
  assert.equal(result.areaAttitudes['学习成长'], 'interested')
  assert.ok(areas.filter(area => area !== '学习成长').every(area => result.areaAttitudes[area] === 'excluded'))
  assert.equal(result.interests, legacy.interests)
  assert.equal(result.count, 6)
  assert.equal(result.online, false)
  assert.deepEqual(legacy.areas, ['学习成长'])
  assert.equal(parsePreferences({ ...legacy, areaAttitudes: { '学习成长': 'unknown' } }), null)
  assert.equal(parsePreferences({ ...legacy, areas: ['未知领域'] }), null)
  assert.equal(parsePreferences({ ...legacy, areas: ['学习成长', '学习成长'] }), null)
  assert.equal(validPreferences({ ...defaults, areaAttitudes: Object.fromEntries(areas.map(area => [area, 'excluded'])) }), true)
})
