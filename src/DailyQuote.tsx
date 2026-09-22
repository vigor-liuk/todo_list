import { useEffect, useState } from 'react'

type Quote = { date: string; text: string; source: string; online: boolean }
const storageKey = 'little-day-quote-v1'
const fallbackQuotes = [
  '每一小步，都算数。把注意力放在今天能完成的一件事上。',
  '不必等到准备完美，开始就是向前的一步。',
  '慢一点也没关系，持续前行就是进步。',
  '给努力一点时间，也给自己一点耐心。',
  '今天多懂一点点，明天就会多一分底气。',
  '大目标从小行动开始，先完成眼前这一件。',
  '休息也是计划的一部分，蓄好力再出发。',
  '不和别人比速度，只和昨天的自己比进步。',
  '把困难拆小，把行动落实，答案会越来越清晰。',
  '认真对待每一次尝试，你正在一点点成长。',
  '允许自己暂时不会，也相信自己能够学会。',
]
function fallback(date: string): Quote {
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
  return { date, text: fallbackQuotes[dayNumber % fallbackQuotes.length], source: '小日精选', online: false }
}
function readCache(date: string): Quote | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null')
    return value?.date === date && typeof value.text === 'string' && value.text.length <= 120 && typeof value.source === 'string' && typeof value.online === 'boolean' ? value : null
  } catch { return null }
}
const requests = new Map<string, Promise<Quote>>()
function loadQuote(date: string) {
  const cached = readCache(date)
  if (cached) return Promise.resolve(cached)
  const pending = requests.get(date)
  if (pending) return pending
  const request = (async () => {
    let quote = fallback(date)
    try {
      const response = await fetch('https://v1.hitokoto.cn/?c=k&min_length=8&max_length=55', { signal: AbortSignal.timeout(7000), credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw Error('Quote service unavailable')
      const data = await response.json()
      // Keep the card encouraging even when the philosophy feed returns a different theme.
      if (typeof data.hitokoto === 'string' && data.hitokoto.length <= 80 && /努力|坚持|希望|梦想|勇|成长|行动|积累|进步|成功|学习|相信|前行|出发|奋斗|不放弃|超越|热爱/.test(data.hitokoto)) {
        quote = { date, text: data.hitokoto, source: typeof data.from === 'string' ? data.from.slice(0, 60) : '一言', online: true }
      }
    } catch { /* A different local quote is available every day without a connection. */ }
    try {
      const previous = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (previous?.date !== date && previous?.text === quote.text) {
        quote = fallback(date)
        if (previous.text === quote.text) quote.text = fallbackQuotes[(fallbackQuotes.indexOf(quote.text) + 1) % fallbackQuotes.length]
      }
      localStorage.setItem(storageKey, JSON.stringify(quote))
    } catch { /* Session cache still works. */ }
    return quote
  })()
  requests.clear()
  requests.set(date, request)
  return request
}
export function DailyQuote({ date }: { date: string }) {
  const [quote, setQuote] = useState(() => readCache(date) || fallback(date))
  useEffect(() => {
    let active = true
    loadQuote(date).then(result => { if (active) setQuote(result) })
    return () => { active = false }
  }, [date])
  const current = quote.date === date ? quote : fallback(date)
  return <div className="little-note daily-quote"><div className="daily-quote-heading"><span>✦</span><small>每日激励 · {date.slice(5).replace('-', '/')}</small></div><strong>{current.text}</strong><p>{current.online ? <a href="https://hitokoto.cn/" target="_blank" rel="noreferrer">一言 · {current.source}</a> : '小日精选 · 每天一句'}</p></div>
}
