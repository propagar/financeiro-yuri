import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate } from '../lib/format'
import './Recurrences.css'

const FREQUENCY_LABELS = { semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' }

export default function Recurrences() {
  const { activeProfileId, profiles, isConsolidated } = useProfiles()
  const { openEdit, version } = useTransactionModal()
  const [recurrences, setRecurrences] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState(null) // id da recorrência com ocorrências visíveis
  const [occurrences, setOccurrences] = useState([])
  const [occurrencesLoading, setOccurrencesLoading] = useState(false)

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

  // Recarrega a lista de ocorrências expandida sempre que uma transação é salva em outro lugar
  useEffect(() => {
    if (expanded) loadOccurrences(expanded)
  }, [version])

  const toggleActive = async (r) => {
    await supabase.from('recurrences').update({ is_active: !r.is_active }).eq('id', r.id)
    reload()
  }

  const handleDeleteConfirmed = async () => {
    if (!deleting) return
    await supabase.from('recurrences').delete().eq('id', deleting.id)
    setDeleting(null)
    reload()
  }

  const loadOccurrences = async (recurrenceId) => {
    setOccurrencesLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name, icon, color, kind), accounts(name)')
      .eq('recurrence_id', recurrenceId)
      .order('occurred_on', { ascending: true })
    setOccurrences(data ?? [])
    setOccurrencesLoading(false)
  }

  const toggleExpanded = (r) => {
    if (expanded === r.id) {
      setExpanded(null)
      setOccurrences([])
      return
    }
    setExpanded(r.id)
    loadOccurrences(r.id)
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
            <div key={r.id} className="recurrence-group">
              <div className={'recurrence-card' + (r.is_active ? '' : ' recurrence-inactive')}>
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
                  <button onClick={() => toggleExpanded(r)} type="button">
                    {expanded === r.id ? 'Ocultar' : 'Ver lançamentos'}
                  </button>
                  <button onClick={() => toggleActive(r)} type="button">
                    {r.is_active ? 'Pausar' : 'Reativar'}
                  </button>
                  <button onClick={() => setDeleting(r)} type="button" className="danger">Excluir</button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="recurrence-occurrences">
                  {occurrencesLoading ? (
                    <div className="empty-state">Carregando…</div>
                  ) : occurrences.length === 0 ? (
                    <div className="empty-state">Nenhum lançamento gerado ainda para esta recorrência.</div>
                  ) : (
                    occurrences.map((o) => (
                      <button
                        key={o.id}
                        className="recurrence-occurrence-row"
                        onClick={() => openEdit(o)}
                        type="button"
                        title="Editar apenas este lançamento, sem afetar a regra de recorrência"
                      >
                        <span className="recurrence-occurrence-date">{formatDate(o.occurred_on)}</span>
                        <span className={'status-pill status-' + (o.status || 'Pago').toLowerCase().replace(' ', '-')}>
                          {o.status}
                        </span>
                        <span className="recurrence-occurrence-amount">{formatCurrency(o.amount)}</span>
                        <span className="recurrence-occurrence-edit" aria-hidden="true">✏️</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir recorrência?"
          message="Os lançamentos já gerados não serão removidos, mas nenhum novo será criado."
          preview={[
            { label: 'Recorrência', value: deleting.name },
            { label: 'Frequência', value: FREQUENCY_LABELS[deleting.frequency] },
          ]}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
