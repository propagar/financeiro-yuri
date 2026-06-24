import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import { formatCurrency, formatDate } from '../lib/format'
import './Recurrences.css'

const FREQUENCY_LABELS = { semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' }

export default function Recurrences() {
  const { activeProfileId, profiles, isConsolidated } = useProfiles()
  const [recurrences, setRecurrences] = useState([])
  const [loading, setLoading] = useState(true)

  const profileIds = isConsolidated ? profiles.map((p) => p.id) : [activeProfileId]

  const reload = useCallback(async () => {
    if (profileIds.length === 0 || !profileIds[0]) {
      setRecurrences([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('recurrences')
      .select('*, categories(name, icon, color), accounts(name), profiles(name, icon, color)')
      .in('profile_id', profileIds)
      .order('is_active', { ascending: false })
      .order('next_due_date')
    setRecurrences(data ?? [])
    setLoading(false)
  }, [JSON.stringify(profileIds)])

  useEffect(() => {
    reload()
  }, [reload])

  const toggleActive = async (r) => {
    await supabase.from('recurrences').update({ is_active: !r.is_active }).eq('id', r.id)
    reload()
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Excluir a recorrência "${r.name}"? Os lançamentos já gerados não serão removidos.`)) return
    await supabase.from('recurrences').delete().eq('id', r.id)
    reload()
  }

  return (
    <div className="recurrences-page">
      <div className="page-header">
        <div>
          <h1>Recorrências</h1>
          <p className="dashboard-subtitle">Despesas e receitas que se repetem automaticamente</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : recurrences.length === 0 ? (
        <div className="empty-state">
          Nenhuma recorrência cadastrada ainda. Crie um lançamento e marque "Tornar recorrente".
        </div>
      ) : (
        <div className="recurrences-list">
          {recurrences.map((r) => (
            <div key={r.id} className={'recurrence-card' + (r.is_active ? '' : ' recurrence-inactive')}>
              <div className="recurrence-main">
                <span className="recurrence-icon" style={{ background: (r.categories?.color || '#94a3b8') + '22' }}>
                  {r.categories?.icon || '📁'}
                </span>
                <div className="recurrence-info">
                  <span className="recurrence-name">{r.name}</span>
                  <span className="recurrence-meta">
                    {FREQUENCY_LABELS[r.frequency]} · próxima geração {formatDate(r.next_due_date)}
                    {isConsolidated && <> · {r.profiles?.icon} {r.profiles?.name}</>}
                  </span>
                </div>
              </div>
              <span className={'recurrence-amount ' + (r.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                {r.kind === 'receita' ? '+' : '-'}{formatCurrency(r.amount)}
              </span>
              <div className="recurrence-actions">
                <button onClick={() => toggleActive(r)} type="button">
                  {r.is_active ? 'Pausar' : 'Reativar'}
                </button>
                <button onClick={() => handleDelete(r)} type="button" className="danger">Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
