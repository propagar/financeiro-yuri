import { useState, useRef, useEffect } from 'react'
import './DateRangeFilter.css'

function toIso(date) {
  return date.toISOString().slice(0, 10)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay() // 0 = domingo
  d.setDate(d.getDate() - day)
  return d
}

function endOfWeek(date) {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return d
}

function buildPresets() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const last7 = new Date(today)
  last7.setDate(last7.getDate() - 6)
  const last30 = new Date(today)
  last30.setDate(last30.getDate() - 29)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  return [
    { label: 'Hoje', from: toIso(today), to: toIso(today) },
    { label: 'Ontem', from: toIso(yesterday), to: toIso(yesterday) },
    { label: 'Esta semana', from: toIso(startOfWeek(today)), to: toIso(endOfWeek(today)) },
    { label: 'Últimos 7 dias', from: toIso(last7), to: toIso(today) },
    { label: 'Este mês', from: toIso(startOfMonth(today)), to: toIso(endOfMonth(today)) },
    { label: 'Últimos 30 dias', from: toIso(last30), to: toIso(today) },
    { label: 'Mês passado', from: toIso(startOfMonth(lastMonthDate)), to: toIso(endOfMonth(lastMonthDate)) },
    { label: 'Este ano', from: toIso(new Date(now.getFullYear(), 0, 1)), to: toIso(new Date(now.getFullYear(), 11, 31)) },
  ]
}

function formatRangeLabel(range) {
  const fromDate = new Date(range.from + 'T00:00:00')
  const toDate = new Date(range.to + 'T00:00:00')
  const sameDay = range.from === range.to
  const sameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear()
  const isFullMonth = fromDate.getDate() === 1 && toDate.getTime() === endOfMonth(fromDate).getTime()

  if (sameDay) {
    return fromDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (isFullMonth) {
    return fromDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  if (sameMonth) {
    return `${fromDate.getDate()}–${toDate.getDate()} ${toDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`
  }
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${fmt(fromDate)} – ${fmt(toDate)}, ${toDate.getFullYear()}`
}

/**
 * Filtro de período avançado: navegação rápida por mês (‹ ›), atalhos de período
 * (hoje, semana, mês, ano, últimos N dias) e seleção de intervalo de datas customizado.
 */
export default function DateRangeFilter({ range, onChange }) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(range.from)
  const [customTo, setCustomTo] = useState(range.to)
  const containerRef = useRef(null)

  useEffect(() => {
    setCustomFrom(range.from)
    setCustomTo(range.to)
  }, [range.from, range.to])

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const shiftMonth = (deltaMonths) => {
    const base = new Date(range.from + 'T00:00:00')
    const next = new Date(base.getFullYear(), base.getMonth() + deltaMonths, 1)
    onChange({ from: toIso(next), to: toIso(endOfMonth(next)) })
  }

  const applyPreset = (preset) => {
    onChange({ from: preset.from, to: preset.to })
    setOpen(false)
  }

  const applyCustom = (e) => {
    e.preventDefault()
    if (!customFrom || !customTo) return
    const from = customFrom <= customTo ? customFrom : customTo
    const to = customFrom <= customTo ? customTo : customFrom
    onChange({ from, to })
    setOpen(false)
  }

  return (
    <div className="date-range-filter" ref={containerRef}>
      <button className="drf-nav-btn" onClick={() => shiftMonth(-1)} type="button" aria-label="Período anterior">‹</button>

      <button className="drf-trigger" onClick={() => setOpen((v) => !v)} type="button">
        <span aria-hidden="true">📅</span>
        <span className="drf-trigger-label">{formatRangeLabel(range)}</span>
        <span className="drf-trigger-caret">▾</span>
      </button>

      <button className="drf-nav-btn" onClick={() => shiftMonth(1)} type="button" aria-label="Próximo período">›</button>

      {open && (
        <div className="drf-popover">
          <div className="drf-presets">
            {buildPresets().map((p) => (
              <button
                key={p.label}
                type="button"
                className={'drf-preset' + (p.from === range.from && p.to === range.to ? ' drf-preset-active' : '')}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <form className="drf-custom" onSubmit={applyCustom}>
            <span className="drf-custom-label">Período personalizado</span>
            <div className="drf-custom-row">
              <label>
                De
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                Até
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn-primary drf-apply-btn">Aplicar período</button>
          </form>
        </div>
      )}
    </div>
  )
}
