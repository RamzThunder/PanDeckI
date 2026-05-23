import React, { useEffect, useState } from 'react'
import { api } from '../api'

interface Props {
  currentDate: Date
  onPrev: () => void
  onNext: () => void
  onDayClick: (date: Date) => void
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
const MOOD_ICONS = ['😊', '😐', '😔', '😄', '😤', '🥱', '🤒']

function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(d); nd.setDate(d.getDate() + i); return nd
  })
}

interface DayData { weekMemo?: string; mood?: string }

export default function WeeklyView({ currentDate, onPrev, onNext, onDayClick }: Props): JSX.Element {
  const weekDays = getWeekDays(currentDate)
  const today = new Date().toISOString().slice(0, 10)
  const [dayData, setDayData] = useState<Record<string, DayData>>({})

  useEffect(() => {
    weekDays.forEach(async (day) => {
      const dateStr = day.toISOString().slice(0, 10)
      const data = await api.entry.get(dateStr).catch(() => null)
      if (data) setDayData((prev) => ({ ...prev, [dateStr]: data as DayData }))
    })
  }, [currentDate])

  const saveDay = async (dateStr: string, patch: Partial<DayData>) => {
    const updated = { ...(dayData[dateStr] ?? {}), ...patch }
    setDayData((prev) => ({ ...prev, [dateStr]: updated }))
    await api.entry.save(dateStr, updated).catch(() => {})
  }

  const startDate = weekDays[0]
  const endDate = weekDays[6]
  const weekLabel = `${startDate.getMonth() + 1}.${startDate.getDate()} — ${endDate.getMonth() + 1}.${endDate.getDate()}`

  return (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{weekLabel}</h2>
        <div className="flex items-center gap-3">
          <button onClick={onPrev} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-pink-100"
            style={{ color: 'var(--color-primary-dark)' }}>‹</button>
          <button onClick={onNext} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-pink-100"
            style={{ color: 'var(--color-primary-dark)' }}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 flex-1">
        {weekDays.map((day, i) => {
          const dateStr = day.toISOString().slice(0, 10)
          const isToday = dateStr === today
          const data = dayData[dateStr] ?? {}
          return (
            <div key={dateStr} className="flex flex-col rounded-xl p-2 overflow-hidden"
              style={{ background: isToday ? 'var(--color-primary-light)' : 'var(--color-bg)',
                border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold"
                  style={{ color: i === 0 ? 'var(--color-primary-dark)' : i === 6 ? '#8888cc' : 'var(--color-text-muted)' }}>
                  {WEEKDAYS_KO[i]}
                </span>
                <button onClick={() => onDayClick(day)} className="text-sm font-bold hover:text-pink-400 transition-colors"
                  style={{ color: 'var(--color-text)' }}>
                  {day.getDate()}
                </button>
              </div>
              <div className="flex flex-wrap gap-0.5 mb-2">
                {MOOD_ICONS.map((icon) => (
                  <button key={icon} onClick={() => saveDay(dateStr, { mood: icon })}
                    className="text-xs rounded transition-all"
                    style={{ opacity: data.mood === icon ? 1 : 0.3,
                      transform: data.mood === icon ? 'scale(1.2)' : 'scale(1)' }}>
                    {icon}
                  </button>
                ))}
              </div>
              <textarea className="flex-1 text-xs resize-none outline-none rounded p-1"
                style={{ background: 'rgba(255,255,255,0.5)', color: 'var(--color-text)',
                  border: '1px solid var(--color-border)', minHeight: '60px' }}
                placeholder="메모..." value={data.weekMemo ?? ''}
                onChange={(e) => saveDay(dateStr, { weekMemo: e.target.value })} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
