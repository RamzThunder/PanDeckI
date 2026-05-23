import { useState, useEffect, useCallback } from 'react'

export type ViewMode = 'monthly' | 'daily'

export function useDiaryNav() {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')

  const goToDate = useCallback((date: Date) => setCurrentDate(date), [])

  const goToPrev = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev)
      if (viewMode === 'monthly') d.setMonth(d.getMonth() - 1)
      else d.setDate(d.getDate() - 1)
      return d
    })
  }, [viewMode])

  const goToNext = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev)
      if (viewMode === 'monthly') d.setMonth(d.getMonth() + 1)
      else d.setDate(d.getDate() + 1)
      return d
    })
  }, [viewMode])

  return { currentDate, viewMode, setViewMode, goToDate, goToPrev, goToNext }
}

export function toLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function toYearMonth(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
