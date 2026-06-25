import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import './TransactionForm.css'

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência']
const STATUSES = ['Pago', 'Pendente', 'A pagar', 'Cancelado']
const FREQUENCIES = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
]

export default function TransactionForm({ transaction, onClose, onSaved }) {
  const { activeProfileId, activeProfile } = useProfiles()
  // Edição de verdade só ocorre quando a transação já tem id (duplicar não conta como edição)
  const isEdit = !!transaction?.id

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
