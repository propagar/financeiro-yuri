import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTransactions, useAccounts, useCategories, useMercadoItems } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { formatCurrency, formatDate } from '../lib/format'
import './Transactions.css'

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência']
const STATUSES = ['Pago', 'Pendente', 'A pagar', 'Cancelado']
const FREQUENCIES = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
]

export default function Transactions() {
  const { transactions, loading, reload } = useTransactions()
  const { activeProfile, isConsolidated } = useProfiles()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterKind, setFilterKind] = useState('todos')
  const [viewingItems, setViewingItems] = useState(null)

  const filtered = useMemo(() => {
    if (filterKind === 'todos') return transactions
    return transactions.filter((t) => t.kind === filterKind)
  }, [transactions, filterKind])

  const openNew = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (t) => {
    setEditing(t)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este lançamento?')) return
    await supabase.from('transactions').delete().eq('id', id)
    reload()
  }

  return (
    <div className="transactions-page">
      <div className="page-header">
        <div>
          <h1>Lançamentos</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Todos os perfis' : activeProfile?.name}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={openNew}
          type="button"
          disabled={isConsolidated}
          title={isConsolidated ? 'Selecione um perfil específico para lançar' : ''}
        >
          + Novo lançamento
        </button>
      </div>

      <div className="filter-row">
        {['todos', 'receita', 'despesa'].map((k) => (
          <button
            key={k}
            className={'filter-chip' + (filterKind === k ? ' filter-chip-active' : '')}
            onClick={() => setFilterKind(k)}
            type="button"
          >
            {k === 'todos' ? 'Todos' : k === 'receita' ? 'Receitas' : 'Despesas'}
          </button>
        ))}
      </div>

      <div className="transactions-table-wrap">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Nenhum lançamento encontrado.</div>
        ) : (
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                {isConsolidated && <th>Perfil</th>}
                <th>Conta</th>
                <th>Forma</th>
                <th>Status</th>
                <th className="col-amount">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.occurred_on)}</td>
                  <td className="col-name">
                    {t.recurrence_id && <span className="recurring-icon" title="Lançamento recorrente">🔁</span>}
                    {t.name}
                    {(t.mercado_items?.[0]?.count ?? 0) > 0 && (
                      <button
                        className="items-badge"
                        onClick={() => setViewingItems(t)}
                        type="button"
                        title="Ver produtos desta compra"
                      >
                        🧾 {t.mercado_items[0].count} itens
                      </button>
                    )}
                  </td>
                  <td>
                    <span className="tag" style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                      {t.categories?.icon} {t.categories?.name || '—'}
                    </span>
                  </td>
                  {isConsolidated && (
                    <td>{t.profiles?.icon} {t.profiles?.name}</td>
                  )}
                  <td>{t.accounts?.name || '—'}</td>
                  <td>{t.payment_method || '—'}</td>
                  <td>
                    <span className={'status-pill status-' + (t.status || 'Pago').toLowerCase().replace(' ', '-')}>
                      {t.status}
                    </span>
                  </td>
                  <td className={'col-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                    {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="col-actions">
                    <button onClick={() => openEdit(t)} type="button" title="Editar">✏️</button>
                    <button onClick={() => handleDelete(t.id)} type="button" title="Excluir">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <TransactionForm
          transaction={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}

      {viewingItems && (
        <MercadoItemsModal
          transaction={viewingItems}
          onClose={() => setViewingItems(null)}
        />
      )}
    </div>
  )
}

function MercadoItemsModal({ transaction, onClose }) {
  const { items, loading } = useMercadoItems(transaction.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Produtos — {transaction.name}</h2>
        <p className="modal-context">
          {formatDate(transaction.occurred_on)} · {transaction.establishment || '—'} · Total {formatCurrency(transaction.amount)}
        </p>

        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="empty-state">Nenhum produto itemizado para esta compra.</div>
        ) : (
          <ul className="mercado-items-list">
            {items.map((item) => (
              <li key={item.id} className="mercado-item-row">
                <div className="mercado-item-info">
                  <span className="mercado-item-name">{item.product_name}</span>
                  {item.brand && <span className="mercado-item-brand">{item.brand}</span>}
                </div>
                <span className="mercado-item-qty">
                  {item.quantity} {item.unit}
                </span>
                <span className="mercado-item-price">{formatCurrency(item.final_price)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

function TransactionForm({ transaction, onClose, onSaved }) {
  const { activeProfileId, activeProfile } = useProfiles()
  const isEdit = !!transaction

  const [kind, setKind] = useState(transaction?.kind || 'despesa')
  const [name, setName] = useState(transaction?.name || '')
  const [amount, setAmount] = useState(transaction?.amount ?? '')
  const [occurredOn, setOccurredOn] = useState(transaction?.occurred_on || new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '')
  const [accountId, setAccountId] = useState(transaction?.account_id || '')
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || 'Pix')
  const [status, setStatus] = useState(transaction?.status || 'Pago')
  const [establishment, setEstablishment] = useState(transaction?.establishment || '')
  const [notes, setNotes] = useState(transaction?.notes || '')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('mensal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { categories } = useCategories(kind)
  const { accounts } = useAccounts()

  const profileId = transaction?.profile_id || activeProfileId

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!profileId) {
      setError('Selecione um perfil antes de lançar.')
      return
    }
    if (!name.trim() || !amount) {
      setError('Preencha ao menos a descrição e o valor.')
      return
    }

    setSaving(true)

    // Lançamento recorrente novo: cria a regra e deixa o banco gerar as próximas ocorrências
    if (!isEdit && isRecurring) {
      const { error: err } = await supabase.from('recurrences').insert({
        profile_id: profileId,
        account_id: accountId || null,
        category_id: categoryId || null,
        name: name.trim(),
        kind,
        amount: Number(amount),
        frequency,
        payment_method: paymentMethod || null,
        establishment: establishment.trim() || null,
        notes: notes.trim() || null,
        start_date: occurredOn,
        next_due_date: occurredOn,
      })

      if (err) {
        setSaving(false)
        setError(err.message)
        return
      }

      // Gera imediatamente as ocorrências dos próximos 3 meses, sem esperar o job noturno
      await supabase.rpc('generate_recurring_transactions')

      setSaving(false)
      onSaved()
      return
    }

    const payload = {
      profile_id: profileId,
      account_id: accountId || null,
      category_id: categoryId || null,
      name: name.trim(),
      kind,
      amount: Number(amount),
      occurred_on: occurredOn,
      payment_method: paymentMethod || null,
      status,
      establishment: establishment.trim() || null,
      notes: notes.trim() || null,
    }

    const query = isEdit
      ? supabase.from('transactions').update(payload).eq('id', transaction.id)
      : supabase.from('transactions').insert(payload)

    const { error: err } = await query
    setSaving(false)

    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
        <p className="modal-context">
          Perfil: <strong>{activeProfile?.icon} {activeProfile?.name}</strong>
        </p>

        <form onSubmit={handleSubmit} className="transaction-form">
          <div className="kind-toggle">
            <button
              type="button"
              className={kind === 'despesa' ? 'kind-active kind-expense' : ''}
              onClick={() => setKind('despesa')}
            >
              Despesa
            </button>
            <button
              type="button"
              className={kind === 'receita' ? 'kind-active kind-income' : ''}
              onClick={() => setKind('receita')}
            >
              Receita
            </button>
          </div>

          <label>
            Descrição
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Compras no mercado" required />
          </label>

          <div className="form-row">
            <label>
              Valor (R$)
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label>
              Data
              <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
            </label>
          </div>

          <div className="form-row">
            <label>
              Categoria
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Selecione…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Conta
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Sem conta vinculada</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Forma de pagamento
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isRecurring}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {!isEdit && (
            <div className="recurring-box">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                />
                Tornar recorrente
              </label>

              {isRecurring && (
                <>
                  <label>
                    Repetir
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                      {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <p className="recurring-hint">
                    A partir da data acima, o sistema vai gerar automaticamente os próximos
                    lançamentos com status <strong>"A pagar"</strong>, sempre com 3 meses de antecedência,
                    pra te ajudar a controlar e lembrar dos pagamentos.
                  </p>
                </>
              )}
            </div>
          )}

          <label>
            Estabelecimento (opcional)
            <input value={establishment} onChange={(e) => setEstablishment(e.target.value)} />
          </label>

          <label>
            Observações (opcional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {error && <p className="login-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
