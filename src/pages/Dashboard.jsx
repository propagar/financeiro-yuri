import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { useTransactions } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { formatCurrency, currentMonthRange, formatMonthLabel } from '../lib/format'
import './Dashboard.css'

export default function Dashboard() {
  const [range, setRange] = useState(currentMonthRange())
  const { transactions, loading } = useTransactions(range)
  const { isConsolidated, profiles, selectProfile } = useProfiles()
  const navigate = useNavigate()

  const summary = useMemo(() => summarize(transactions), [transactions])

  const goToFluxo = (profileId) => {
    selectProfile(profileId)
    navigate('/lancamentos')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Painel</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Consolidado de todos os perfis' : 'Resumo do perfil selecionado'}
          </p>
        </div>
        <MonthPicker range={range} onChange={setRange} />
      </div>

      <ShortcutsBar
        profiles={profiles}
        isConsolidated={isConsolidated}
        onGoToFluxo={goToFluxo}
        onGoToRecorrencias={() => navigate('/recorrencias')}
      />

      <div className="summary-grid">
        <SummaryCard label="Receitas no período" value={summary.income} tone="income" />
        <SummaryCard label="Despesas no período" value={summary.expense} tone="expense" />
        <SummaryCard
          label="Saldo do período"
          value={summary.income - summary.expense}
          tone={summary.income - summary.expense >= 0 ? 'income' : 'expense'}
        />
        <SummaryCard label="Lançamentos" value={transactions.length} tone="neutral" isCount />
      </div>

      {isConsolidated && (
        <ProfileBreakdown transactions={transactions} />
      )}

      <div className="dashboard-grid">
        <div className="panel">
          <h2>Despesas por categoria</h2>
          {summary.byCategory.length === 0 ? (
            <EmptyState loading={loading} />
          ) : (
            <CategoryPie data={summary.byCategory} />
          )}
        </div>

        <div className="panel">
          <h2>Últimos lançamentos</h2>
          <RecentList transactions={transactions.slice(0, 8)} loading={loading} />
        </div>
      </div>
    </div>
  )
}

function ShortcutsBar({ profiles, isConsolidated, onGoToFluxo, onGoToRecorrencias }) {
  return (
    <div className="shortcuts-bar">
      <span className="shortcuts-label">Fluxo de caixa:</span>

      <button
        className={'shortcut-chip' + (isConsolidated ? ' shortcut-chip-active' : '')}
        onClick={() => onGoToFluxo(null)}
        type="button"
      >
        🌐 Geral
      </button>

      {profiles.map((p) => (
        <button
          key={p.id}
          className="shortcut-chip"
          onClick={() => onGoToFluxo(p.id)}
          type="button"
        >
          {p.icon} {p.name}
        </button>
      ))}

      <button className="shortcut-chip shortcut-chip-recurring" onClick={onGoToRecorrencias} type="button">
        🔁 Recorrências
      </button>
    </div>
  )
}

function summarize(transactions) {
  let income = 0
  let expense = 0
  const categoryMap = new Map()
  const profileMap = new Map()

  for (const t of transactions) {
    const amount = Number(t.amount)
    if (t.kind === 'receita') income += amount
    else expense += amount

    if (t.kind === 'despesa') {
      const key = t.categories?.name || 'Sem categoria'
      const prev = categoryMap.get(key) || { name: key, value: 0, color: t.categories?.color || '#94a3b8' }
      prev.value += amount
      categoryMap.set(key, prev)
    }

    const pKey = t.profiles?.name || '—'
    const pPrev = profileMap.get(pKey) || {
      name: pKey,
      icon: t.profiles?.icon,
      color: t.profiles?.color,
      type: t.profiles?.type,
      income: 0,
      expense: 0,
    }
    if (t.kind === 'receita') pPrev.income += amount
    else pPrev.expense += amount
    profileMap.set(pKey, pPrev)
  }

  return {
    income,
    expense,
    byCategory: [...categoryMap.values()].sort((a, b) => b.value - a.value),
    byProfile: [...profileMap.values()],
  }
}

function SummaryCard({ label, value, tone, isCount }) {
  return (
    <div className="summary-card">
      <span className="summary-label">{label}</span>
      <span className={`summary-value summary-value-${tone}`}>
        {isCount ? value : formatCurrency(value)}
      </span>
    </div>
  )
}

function MonthPicker({ range, onChange }) {
  const shift = (deltaMonths) => {
    const base = new Date(range.from + 'T00:00:00')
    const next = new Date(base.getFullYear(), base.getMonth() + deltaMonths, 1)
    const to = new Date(next.getFullYear(), next.getMonth() + 1, 0)
    onChange({
      from: next.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    })
  }

  const label = new Date(range.from + 'T00:00:00').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="month-picker">
      <button onClick={() => shift(-1)} aria-label="Mês anterior" type="button">‹</button>
      <span>{label}</span>
      <button onClick={() => shift(1)} aria-label="Próximo mês" type="button">›</button>
    </div>
  )
}

function ProfileBreakdown({ transactions }) {
  const { profiles, selectProfile } = useProfiles()
  const summary = summarize(transactions)

  if (profiles.length === 0) return null

  return (
    <div className="profile-breakdown">
      {summary.byProfile.map((p) => (
        <button
          key={p.name}
          className="profile-breakdown-card"
          onClick={() => {
            const match = profiles.find((pr) => pr.name === p.name)
            if (match) selectProfile(match.id)
          }}
          type="button"
          style={{ borderColor: p.color }}
        >
          <span className="profile-breakdown-title">
            <span>{p.icon}</span> {p.name}
            <span className="profile-breakdown-type">{p.type}</span>
          </span>
          <span className="profile-breakdown-numbers">
            <span className="pb-income">+{formatCurrency(p.income)}</span>
            <span className="pb-expense">-{formatCurrency(p.expense)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

const PIE_COLORS = ['#0f5e56', '#5b4ccb', '#a6432f', '#b8862c', '#3b82f6', '#ec4899', '#8b5cf6', '#64748b']

function CategoryPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(value)} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function RecentList({ transactions, loading }) {
  if (loading) return <EmptyState loading />
  if (transactions.length === 0) return <EmptyState />

  return (
    <ul className="recent-list">
      {transactions.map((t) => (
        <li key={t.id} className="recent-item">
          <span className="recent-icon">{t.categories?.icon || '📁'}</span>
          <span className="recent-info">
            <span className="recent-name">{t.name}</span>
            <span className="recent-meta">
              {t.categories?.name || 'Sem categoria'} · {t.profiles?.icon} {t.profiles?.name}
            </span>
          </span>
          <span className={'recent-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
            {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ loading }) {
  return (
    <div className="empty-state">
      {loading ? 'Carregando…' : 'Nenhum lançamento neste período.'}
    </div>
  )
}
