import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { formatCurrency } from '../lib/format'
import './Accounts.css'

const ACCOUNT_TYPES = ['Corrente', 'Poupança', 'Investimento', 'Pagamento', 'Carteira', 'Outro']
const CARD_STATUSES = ['Ativa', 'Bloqueado', 'Desbloqueado']

export default function Accounts() {
  const { accounts, loading, reload } = useAccounts()
  const { activeProfileId, activeProfile, isConsolidated } = useProfiles()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (a) => { setEditing(a); setShowForm(true) }

  const handleArchive = async (id) => {
    if (!window.confirm('Arquivar esta conta? Lançamentos antigos não serão afetados.')) return
    await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    reload()
  }

  return (
    <div className="accounts-page">
      <div className="page-header">
        <div>
          <h1>Contas</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Todos os perfis' : activeProfile?.name}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={openNew}
          type="button"
          disabled={isConsolidated}
          title={isConsolidated ? 'Selecione um perfil específico para cadastrar' : ''}
        >
          + Nova conta
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">Nenhuma conta cadastrada ainda.</div>
      ) : (
        <div className="accounts-grid">
          {accounts.map((a) => (
            <div className="account-card" key={a.id}>
              <div className="account-card-top">
                <div className="account-card-info">
                  <h3>{a.name}</h3>
                  {a.bank && <span className="account-bank">{a.bank}</span>}
                </div>
                {isConsolidated && (
                  <span className="account-profile-tag">{a.profiles?.icon} {a.profiles?.name}</span>
                )}
              </div>

              <div className="account-balance">
                <span className="account-balance-label">Saldo atual</span>
                <span className="account-balance-value">{formatCurrency(a.current_balance)}</span>
              </div>

              {a.is_credit_card && (
                <div className="account-credit">
                  <div className="credit-bar">
                    <div
                      className="credit-bar-fill"
                      style={{
                        width: `${Math.min(100, ((Number(a.credit_used) || 0) / (Number(a.credit_limit) || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="account-credit-label">
                    {formatCurrency(a.credit_used)} de {formatCurrency(a.credit_limit)} usado
                    {a.card_due_day ? ` · vence dia ${a.card_due_day}` : ''}
                  </span>
                  {a.card_status && (
                    <span className={'card-status card-status-' + a.card_status.toLowerCase()}>
                      {a.card_status}
                    </span>
                  )}
                </div>
              )}

              <div className="account-card-footer">
                <button onClick={() => openEdit(a)} type="button">Editar</button>
                <button onClick={() => handleArchive(a.id)} type="button" className="danger">Arquivar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AccountForm
          account={editing}
          profileId={activeProfileId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}
    </div>
  )
}

function AccountForm({ account, profileId, onClose, onSaved }) {
  const isEdit = !!account
  const [name, setName] = useState(account?.name || '')
  const [bank, setBank] = useState(account?.bank || '')
  const [accountType, setAccountType] = useState(account?.account_type || 'Corrente')
  const [isCreditCard, setIsCreditCard] = useState(account?.is_credit_card || false)
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit ?? '')
  const [creditUsed, setCreditUsed] = useState(account?.credit_used ?? '')
  const [cardDueDay, setCardDueDay] = useState(account?.card_due_day ?? '')
  const [cardStatus, setCardStatus] = useState(account?.card_status || 'Ativa')
  const [currentBalance, setCurrentBalance] = useState(account?.current_balance ?? '')
  const [pixKey, setPixKey] = useState(account?.pix_key || '')
  const [notes, setNotes] = useState(account?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Dê um nome para a conta.'); return }

    setSaving(true)
    const payload = {
      profile_id: account?.profile_id || profileId,
      name: name.trim(),
      bank: bank.trim() || null,
      account_type: accountType || null,
      is_credit_card: isCreditCard,
      credit_limit: creditLimit === '' ? null : Number(creditLimit),
      credit_used: creditUsed === '' ? null : Number(creditUsed),
      card_due_day: cardDueDay === '' ? null : Number(cardDueDay),
      card_status: isCreditCard ? cardStatus : null,
      current_balance: currentBalance === '' ? 0 : Number(currentBalance),
      pix_key: pixKey.trim() || null,
      notes: notes.trim() || null,
    }

    const query = isEdit
      ? supabase.from('accounts').update(payload).eq('id', account.id)
      : supabase.from('accounts').insert(payload)

    const { error: err } = await query
    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Editar conta' : 'Nova conta'}</h2>
        <form onSubmit={handleSubmit} className="transaction-form">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: NuBank Yuri" required />
          </label>

          <div className="form-row">
            <label>
              Banco (opcional)
              <input value={bank} onChange={(e) => setBank(e.target.value)} />
            </label>
            <label>
              Tipo
              <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <label className="checkbox-label">
            <input type="checkbox" checked={isCreditCard} onChange={(e) => setIsCreditCard(e.target.checked)} />
            É cartão de crédito
          </label>

          <label>
            Saldo atual (R$)
            <input type="number" step="0.01" value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} />
          </label>

          {isCreditCard && (
            <>
              <div className="form-row">
                <label>
                  Limite de crédito (R$)
                  <input type="number" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
                </label>
                <label>
                  Limite usado (R$)
                  <input type="number" step="0.01" value={creditUsed} onChange={(e) => setCreditUsed(e.target.value)} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Dia de vencimento
                  <input type="number" min="1" max="31" value={cardDueDay} onChange={(e) => setCardDueDay(e.target.value)} />
                </label>
                <label>
                  Status do cartão
                  <select value={cardStatus} onChange={(e) => setCardStatus(e.target.value)}>
                    {CARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          <label>
            Chave Pix (opcional)
            <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
          </label>

          <label>
            Observações
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
