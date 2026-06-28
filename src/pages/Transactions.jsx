import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTransactions, useMercadoItems } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import ContextMenu from '../components/ContextMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate } from '../lib/format'
import './Transactions.css'

export default function Transactions() {
  const { transactions, loading, reload } = useTransactions()
  const { activeProfile, isConsolidated } = useProfiles()
  const { openEdit, openDuplicate } = useTransactionModal()
  const [filterKind, setFilterKind] = useState('todos')
  const [search, setSearch] = useState('')
  const [viewingItems, setViewingItems] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, transaction }
  const [deleting, setDeleting] = useState(null) // transação a confirmar exclusão
  const [importing, setImporting] = useState(false)

  const filtered = useMemo(() => {
    let result = transactions
    if (filterKind !== 'todos') {
      result = result.filter((t) => t.kind === filterKind)
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      result = result.filter((t) => {
        const haystack = [
          t.name,
          t.categories?.name,
          t.accounts?.name,
          t.establishment,
          t.notes,
          t.payment_method,
          t.status,
          t.profiles?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }
    return result
  }, [transactions, filterKind, search])

  const handleDeleteConfirmed = async () => {
    if (!deleting) return
    await supabase.from('transactions').delete().eq('id', deleting.id)
    setDeleting(null)
    reload()
  }

  const handleContextMenu = (e, transaction) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, transaction })
  }

  const contextMenuItems = contextMenu
    ? [
        { label: 'Editar', icon: '✏️', onClick: () => openEdit(contextMenu.transaction) },
        { label: 'Duplicar', icon: '📑', onClick: () => openDuplicate(contextMenu.transaction) },
        { label: 'Excluir', icon: '🗑️', danger: true, onClick: () => setDeleting(contextMenu.transaction) },
      ]
    : []

  return (
    <div className="transactions-page">
      <div className="page-header">
        <div>
          <h1>Fluxo de Caixa</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Todos os perfis' : activeProfile?.name}
          </p>
        </div>
        <button className="btn-primary import-open-button" type="button" onClick={() => setImporting(true)}>
          Importar texto/CSV
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

      <div className="search-row">
        <input
          className="search-input"
          placeholder="🔍 Buscar por descrição, categoria, conta, estabelecimento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} type="button" aria-label="Limpar busca">
            ✕
          </button>
        )}
      </div>

      {/* Tabela (desktop) */}
      <div className="transactions-table-wrap">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search ? `Nenhum resultado para "${search}".` : 'Nenhum lançamento encontrado.'}
          </div>
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
                <tr key={t.id} onContextMenu={(e) => handleContextMenu(e, t)}>
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
                    <button onClick={() => openDuplicate(t)} type="button" title="Duplicar">📑</button>
                    <button onClick={() => setDeleting(t)} type="button" title="Excluir">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cards (mobile) */}
      <div className="transactions-cards">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search ? `Nenhum resultado para "${search}".` : 'Nenhum lançamento encontrado.'}
          </div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="transaction-card"
              onContextMenu={(e) => handleContextMenu(e, t)}
            >
              <div className="transaction-card-top">
                <div className="transaction-card-info">
                  <div className="transaction-card-name">
                    {t.recurrence_id && <span className="recurring-icon">🔁</span>}
                    {t.name}
                  </div>
                  <div className="transaction-card-date">{formatDate(t.occurred_on)}</div>
                </div>
                <span className={'transaction-card-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                  {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
              <div className="transaction-card-meta">
                <span className="tag" style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                  {t.categories?.icon} {t.categories?.name || '—'}
                </span>
                <span className={'status-pill status-' + (t.status || 'Pago').toLowerCase().replace(' ', '-')}>
                  {t.status}
                </span>
                {isConsolidated && (
                  <span className="tag">{t.profiles?.icon} {t.profiles?.name}</span>
                )}
                {(t.mercado_items?.[0]?.count ?? 0) > 0 && (
                  <button className="items-badge" onClick={() => setViewingItems(t)} type="button">
                    🧾 {t.mercado_items[0].count} itens
                  </button>
                )}
              </div>
              <div className="transaction-card-footer">
                <button onClick={() => openEdit(t)} type="button" title="Editar">✏️</button>
                <button onClick={() => openDuplicate(t)} type="button" title="Duplicar">📑</button>
                <button onClick={() => setDeleting(t)} type="button" title="Excluir">🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>

      {importing && (
        <ImportTransactionsModal
          transactions={transactions}
          onClose={() => setImporting(false)}
          onImported={() => { setImporting(false); reload() }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {viewingItems && (
        <MercadoItemsModal
          transaction={viewingItems}
          onClose={() => setViewingItems(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir lançamento?"
          message="Essa ação não pode ser desfeita."
          preview={[
            { label: 'Descrição', value: deleting.name },
            { label: 'Data', value: formatDate(deleting.occurred_on) },
            {
              label: 'Valor',
              value: (deleting.kind === 'receita' ? '+' : '-') + formatCurrency(deleting.amount),
              tone: deleting.kind === 'receita' ? 'income' : 'expense',
            },
          ]}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleting(null)}
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

const IMPORT_EMPTY_TEXT = 'Cole linhas como "28/06/2026 Mercado Central -123,45" ou envie um CSV com colunas de data, descrição e valor.'

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

function parseDateToken(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (br) {
    const year = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : String(new Date().getFullYear())
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  return ''
}

function parseAmountToken(value) {
  const raw = String(value ?? '').trim().replace(/R\$\s?/i, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const amount = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if ((char === ',' || char === ';' || char === '\t') && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function guessHeaderIndex(headers, names) {
  return headers.findIndex((header) => names.some((name) => normalizeText(header).includes(name)))
}

function buildSuggestion({ date, name, amount, source, existingTransactions, index }) {
  const numericAmount = Math.abs(Number(amount) || 0)
  const kind = Number(amount) < 0 ? 'despesa' : 'receita'
  const normalizedName = normalizeText(name)
  const duplicate = existingTransactions.some((t) => (
    t.occurred_on === date &&
    Number(t.amount).toFixed(2) === numericAmount.toFixed(2) &&
    normalizeText(t.name) === normalizedName
  ))
  return {
    id: `${source}-${index}`,
    selected: !duplicate && !!date && !!normalizedName && numericAmount > 0,
    duplicate,
    kind,
    occurred_on: date,
    name: name || 'Lançamento importado',
    amount: numericAmount ? String(numericAmount.toFixed(2)) : '',
  }
}

function parseFreeText(text, existingTransactions) {
  return text.split(/\n+/).map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return null
    const dateMatch = trimmed.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/)
    const amountMatches = [...trimmed.matchAll(/(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+\.\d{2}/g)]
    const amountMatch = amountMatches.at(-1)
    const date = parseDateToken(dateMatch?.[1])
    const amount = parseAmountToken(amountMatch?.[0])
    let name = trimmed
    if (dateMatch) name = name.replace(dateMatch[0], '')
    if (amountMatch) name = name.replace(amountMatch[0], '')
    name = name.replace(/[-–—|;]/g, ' ').replace(/\s+/g, ' ').trim()
    return buildSuggestion({ date, name, amount, source: 'texto', existingTransactions, index })
  }).filter(Boolean)
}

function parseCsv(text, existingTransactions) {
  const rows = text.split(/\n+/).map((line) => parseCsvLine(line)).filter((row) => row.some(Boolean))
  if (rows.length === 0) return []
  const headers = rows[0]
  const hasHeader = headers.some((cell) => /data|date|descri|historico|histórico|valor|amount/i.test(cell))
  const dataRows = hasHeader ? rows.slice(1) : rows
  const dateIndex = hasHeader ? guessHeaderIndex(headers, ['data', 'date']) : 0
  const nameIndex = hasHeader ? guessHeaderIndex(headers, ['descricao', 'descrição', 'historico', 'histórico', 'nome']) : 1
  const amountIndex = hasHeader ? guessHeaderIndex(headers, ['valor', 'amount', 'total']) : 2

  return dataRows.map((row, index) => buildSuggestion({
    date: parseDateToken(row[dateIndex] ?? row[0]),
    name: row[nameIndex] ?? row[1] ?? '',
    amount: parseAmountToken(row[amountIndex] ?? row.at(-1)),
    source: 'csv',
    existingTransactions,
    index,
  })).filter(Boolean)
}

function ImportTransactionsModal({ transactions, onClose, onImported }) {
  const { activeProfileId, activeProfile } = useProfiles()
  const [mode, setMode] = useState('text')
  const [rawText, setRawText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedCount = suggestions.filter((item) => item.selected).length

  const generateSuggestions = (content = rawText, nextMode = mode) => {
    setError('')
    const parsed = nextMode === 'csv' ? parseCsv(content, transactions) : parseFreeText(content, transactions)
    setSuggestions(parsed)
    if (parsed.length === 0) setError('Não encontrei linhas com data, descrição e valor para sugerir.')
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setMode('csv')
    setRawText(content)
    generateSuggestions(content, 'csv')
  }

  const updateSuggestion = (id, field, value) => {
    setSuggestions((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleConfirm = async () => {
    if (!activeProfileId) {
      setError('Selecione um perfil específico antes de importar lançamentos.')
      return
    }
    const payload = suggestions.filter((item) => item.selected).map((item) => ({
      profile_id: activeProfileId,
      name: item.name.trim(),
      kind: item.kind,
      amount: Number(item.amount),
      occurred_on: item.occurred_on,
      status: 'Pago',
      payment_method: null,
    })).filter((item) => item.name && item.amount > 0 && item.occurred_on)

    if (payload.length === 0) {
      setError('Selecione ao menos uma sugestão válida para criar.')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('transactions').insert(payload)
    setSaving(false)
    if (insertError) setError(insertError.message)
    else onImported()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Importação assistida</h2>
        <p className="modal-context">Perfil: <strong>{activeProfile?.icon} {activeProfile?.name || 'selecione um perfil'}</strong></p>
        <p className="import-hint">Nada será salvo automaticamente. Revise, edite e marque apenas os lançamentos que deseja criar.</p>

        <div className="kind-toggle">
          <button type="button" className={mode === 'text' ? 'kind-active' : ''} onClick={() => setMode('text')}>Texto colado</button>
          <button type="button" className={mode === 'csv' ? 'kind-active' : ''} onClick={() => setMode('csv')}>CSV</button>
        </div>

        <label className="import-file-button">
          Ler arquivo CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </label>

        <textarea className="import-textarea" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder={IMPORT_EMPTY_TEXT} rows={6} />
        <div className="import-actions-row">
          <button type="button" className="btn-secondary" onClick={() => generateSuggestions()}>Gerar prévia</button>
          <span>{suggestions.length} sugestão(ões) · {selectedCount} selecionada(s)</span>
        </div>

        {suggestions.length > 0 && (
          <div className="import-preview-list">
            {suggestions.map((item) => (
              <div key={item.id} className={'import-preview-row' + (item.duplicate ? ' import-preview-duplicate' : '')}>
                <label className="checkbox-label import-check"><input type="checkbox" checked={item.selected} onChange={(e) => updateSuggestion(item.id, 'selected', e.target.checked)} /> Criar</label>
                <input type="date" value={item.occurred_on} onChange={(e) => updateSuggestion(item.id, 'occurred_on', e.target.value)} />
                <input value={item.name} onChange={(e) => updateSuggestion(item.id, 'name', e.target.value)} placeholder="Descrição" />
                <select value={item.kind} onChange={(e) => updateSuggestion(item.id, 'kind', e.target.value)}><option value="despesa">Despesa</option><option value="receita">Receita</option></select>
                <input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updateSuggestion(item.id, 'amount', e.target.value)} />
                {item.duplicate && <span className="duplicate-pill">possível duplicado</span>}
              </div>
            ))}
          </div>
        )}

        {error && <p className="login-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={saving || selectedCount === 0}>{saving ? 'Importando…' : 'Confirmar importação'}</button>
        </div>
      </div>
    </div>
  )
}
