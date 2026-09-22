import { useImperativeHandle, useState } from 'react'
import type { Ref } from 'react'

export type ReminderTimeHandle = { commit: () => string | null }
const fields = ['年', '月', '日', '时', '分']
const split = (value: string) => value ? value.split(/[-T:]/).slice(0, 5) : ['', '', '', '', '']

export function ReminderTime({ value, onChange, ref }: { value: string; onChange: (value: string) => void; ref: Ref<ReminderTimeHandle> }) {
  const [manual, setManual] = useState(false)
  const [parts, setParts] = useState(() => split(value))
  const [error, setError] = useState('')

  function commit() {
    if (!manual) return value
    if (parts.every(part => !part)) { onChange(''); setError(''); return '' }
    if (!/^\d{4}$/.test(parts[0]) || parts.slice(1).some(part => !/^\d{1,2}$/.test(part))) {
      setError('请完整填写时间：年份为 4 位，月、日、时、分各为 1–2 位。')
      return null
    }
    const [year, month, day, hour, minute] = parts.map(Number)
    const date = new Date(0)
    date.setFullYear(year, month - 1, day)
    date.setHours(hour, minute, 0, 0)
    if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
      setError('这个日期或时间不存在，请检查月份、天数及 24 小时时间。')
      return null
    }
    const normalized = parts.map((part, index) => part.padStart(index === 0 ? 4 : 2, '0'))
    const result = `${normalized[0]}-${normalized[1]}-${normalized[2]}T${normalized[3]}:${normalized[4]}`
    setParts(normalized); setError(''); onChange(result)
    return result
  }
  useImperativeHandle(ref, () => ({ commit }))

  return <div className="reminder-time">
    <div className="time-heading"><span id="reminder-time-title">到期提醒时间</span><button type="button" className="clear-time" onClick={() => { setParts(split('')); onChange(''); setError('') }}>不设提醒</button></div>
    <div className="time-modes" role="group" aria-label="时间输入方式">
      <button type="button" aria-pressed={!manual} onClick={() => { if (commit() !== null) setManual(false) }}>▦ 日历选择</button>
      <button type="button" aria-pressed={manual} onClick={() => { if (!manual) { setParts(split(value)); setError(''); setManual(true) } }}>✎ 手动输入</button>
    </div>
    {manual ? <>
      <p className="manual-help">直接输入数字，无需补零；确认后自动整理格式。</p>
      <div className="date-parts" role="group" aria-labelledby="reminder-time-title" aria-describedby={error ? 'time-error' : undefined}>
        {fields.map((field, index) => <label key={field}>{field}<input aria-label={`提醒${field}`} inputMode="numeric" autoComplete="off" placeholder={index === 0 ? 'YYYY' : ['MM', 'DD', 'hh', 'mm'][index - 1]} maxLength={index === 0 ? 4 : 2} value={parts[index]} aria-invalid={Boolean(error)} onChange={event => { const raw = event.target.value.replace(/\D/g, '').slice(0, index === 0 ? 4 : 2); setParts(previous => previous.map((part, i) => i === index ? raw : part)); setError('') }}/></label>)}
      </div>
      <button type="button" className="confirm-time" onClick={commit}>确认时间</button>
    </> : <label className="calendar-time-label"><span className="sr-only">到期提醒时间</span><input type="datetime-local" min="0001-01-01T00:00" max="9999-12-31T23:59" value={value} onChange={event => onChange(event.target.value)}/></label>}
    {error && <p id="time-error" className="time-error" role="alert">{error}</p>}
    <p className="time-summary">{manual && parts.join('|') !== split(value).join('|') ? '时间尚未确认，点击“确认时间”或保存任务即可。' : value ? `提醒时间：${value.replace('T', ' ')}` : '未设置提醒时间'}</p>
  </div>
}
