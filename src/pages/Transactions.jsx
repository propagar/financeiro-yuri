import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTransactions, useMercadoItems, useCategories } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import ContextMenu from '../components/ContextMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate, currentMonthRange } from '../lib/format'
import { extractDocumentText } from '../lib/documentExtraction'
import DateRangeFilter from '../components/DateRangeFilter'
import './Transactions.css'

export default function Transactions() {
  const [range, setRange] = useState(currentMonthRange())
  const { transactions, loading, reload } = useTransactions(range)
  const { activeProfile, isConsolidated } = useProfiles()
  const { categories } = useCategories()
  const { openEdit, openDuplicate } = useTransactionModal()
  const [filterKind, setFilterKind] = useState('todos')
  const [filterCategory, setFilterCategory] = useState('todas')
  const [filterName, setFilterName] = useState('')
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
    if (filterCategory !== 'todas') {
      result = result.filter((t) => filterCategory === 'sem-categoria' ? !t.category_id : t.category_id === filterCategory)
    }
    if (filterName.trim()) {
      const nameTerm = filterName.trim().toLowerCase()
      result = result.filter((t) => String(t.name ?? '').toLowerCase().includes(nameTerm))
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
  }, [transactions, filterKind, filterCategory, filterName, search])

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
          Importar documento
        </button>
      </div>

      <div className="cashflow-filter-panel">
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

        <div className="advanced-filter-row">
          <div className="filter-field filter-field-date">
            <span className="filter-label">Data</span>
            <DateRangeFilter range={range} onChange={setRange} />
          </div>

          <label className="filter-field">
            <span className="filter-label">Categoria</span>
            <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="todas">Todas as categorias</option>
              <option value="sem-categoria">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon ? `${category.icon} ` : ''}{category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Nome</span>
            <input
              className="filter-input"
              placeholder="Filtrar por nome"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </label>

          <label className="filter-field filter-field-search">
            <span className="filter-label">Pesquisa</span>
            <input
              className="filter-input"
              placeholder="🔍 Descrição, categoria, conta, estabelecimento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <button
            className="btn-secondary filters-clear-button"
            onClick={() => { setFilterKind('todos'); setFilterCategory('todas'); setFilterName(''); setSearch(''); setRange(currentMonthRange()) }}
            type="button"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Tabela (desktop) */}
      <div className="transactions-table-wrap">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search || filterName || filterCategory !== 'todas' ? 'Nenhum lançamento encontrado para os filtros aplicados.' : 'Nenhum lançamento encontrado.'}
          </div>
        ) : (
          <table className="transactions-table">
            <colgroup>
              <col className="col-date" />
              <col className="col-description" />
              <col className="col-category" />
              {isConsolidated && <col className="col-profile" />}
              <col className="col-account" />
              <col className="col-method" />
              <col className="col-status" />
              <col className="col-value" />
              <col className="col-action-width" />
            </colgroup>
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

                  </td>
                  <td>
                    <span className="tag cell-text" title={t.categories?.name || '—'} style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                      {t.categories?.icon} {t.categories?.name || '—'}
                    </span>
                  </td>
                  {isConsolidated && (
                    <td><span className="cell-text" title={t.profiles?.name || '—'}>{t.profiles?.icon} {t.profiles?.name || '—'}</span></td>
                  )}
                  <td><span className="cell-text" title={t.accounts?.name || '—'}>{t.accounts?.name || '—'}</span></td>
                  <td><span className="cell-text" title={t.payment_method || '—'}>{t.payment_method || '—'}</span></td>
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
            {search || filterName || filterCategory !== 'todas' ? 'Nenhum lançamento encontrado para os filtros aplicados.' : 'Nenhum lançamento encontrado.'}
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
                  <div className="transaction-card-name" title={t.name || '—'}>
                    {t.recurrence_id && <span className="recurring-icon">🔁</span>}
                    {t.name || '—'}
                  </div>
                  <div className="transaction-card-date">{formatDate(t.occurred_on)}</div>
                </div>
                <span className={'transaction-card-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                  {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
              <div className="transaction-card-meta">
                <span className="tag" title={t.categories?.name || '—'} style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                  {t.categories?.icon} {t.categories?.name || '—'}
                </span>
                <span className={'status-pill status-' + (t.status || 'Pago').toLowerCase().replace(' ', '-')}>
                  {t.status}
                </span>
                {isConsolidated && (
                  <span className="tag" title={t.profiles?.name || '—'}>{t.profiles?.icon} {t.profiles?.name || '—'}</span>
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

const IMPORT_EMPTY_TEXT = 'Cole linhas como "28/06/2026 Mercado Central -123,45", envie CSV/PDF ou anexe imagem para lançar manualmente.'
const ATTACHMENT_BUCKET = 'financial-attachments'
const DOCUMENT_ACCEPT = 'image/*,.pdf,.csv,text/csv,text/plain'

function sanitizeFileName(fileName) {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

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
  const [sourceFile, setSourceFile] = useState(null)
  const [extraction, setExtraction] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedCount = suggestions.filter((item) => item.selected).length

  const generateSuggestions = (content = rawText, nextMode = mode, attachedFile = sourceFile) => {
    setError('')
    const parsed = nextMode === 'csv' ? parseCsv(content, transactions) : parseFreeText(content, transactions)
    setSuggestions(parsed)
    if (parsed.length === 0) {
      const manual = buildSuggestion({ date: new Date().toISOString().slice(0, 10), name: attachedFile?.name || '', amount: 0, source: 'manual', existingTransactions: transactions, index: 0 })
      setSuggestions([{ ...manual, selected: !!attachedFile, duplicate: false }])
      setError('Não encontrei dados completos para sugerir. O arquivo será mantido como anexo do lançamento preenchido manualmente.')
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSourceFile(file)
    setError('')
    const result = await extractDocumentText(file)
    setExtraction(result)
    const nextMode = result.kind === 'csv' ? 'csv' : 'text'
    setMode(nextMode)
    setRawText(result.text)
    generateSuggestions(result.text, nextMode, file)
    if (result.message) setError(result.message)
  }

  const updateSuggestion = (id, field, value) => {
    setSuggestions((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleConfirm = async () => {
    if (!activeProfileId) {
      setError('Selecione um perfil específico antes de importar lançamentos.')
      return
    }
    const selected = suggestions.filter((item) => item.selected)
    const payload = selected.map((item) => ({
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
    const { data: inserted, error: insertError } = await supabase.from('transactions').insert(payload).select('id')
    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    if (sourceFile && inserted?.length === 1) {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) {
        setSaving(false)
        setError(userError.message)
        return
      }
      const transactionId = inserted[0].id
      const storagePath = [activeProfileId, transactionId, `${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(sourceFile.name)}`].join('/')
      const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, sourceFile, {
        contentType: sourceFile.type || undefined,
        upsert: false,
      })
      if (uploadError) {
        setSaving(false)
        setError(uploadError.message)
        return
      }
      const { error: attachmentError } = await supabase.from('transaction_attachments').insert({
        transaction_id: transactionId,
        profile_id: activeProfileId,
        uploaded_by: userData.user?.id ?? null,
        bucket_id: ATTACHMENT_BUCKET,
        storage_path: storagePath,
        file_name: sourceFile.name,
        content_type: sourceFile.type || null,
        file_size: sourceFile.size,
        source_kind: 'document_origin',
        extraction_status: extraction?.status || 'not_attempted',
        extracted_text: extraction?.text || null,
        extraction_message: extraction?.message || null,
      })
      if (attachmentError) {
        setSaving(false)
        setError(attachmentError.message)
        return
      }
    }

    setSaving(false)
    onImported()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Importação documental</h2>
        <p className="modal-context">Perfil: <strong>{activeProfile?.icon} {activeProfile?.name || 'selecione um perfil'}</strong></p>
        <p className="import-hint">Nada será salvo automaticamente. PDFs e CSVs podem gerar prévia; imagens são salvas sem OCR e ficam vinculadas ao lançamento preenchido manualmente.</p>

        <div className="kind-toggle">
          <button type="button" className={mode === 'text' ? 'kind-active' : ''} onClick={() => setMode('text')}>Texto colado</button>
          <button type="button" className={mode === 'csv' ? 'kind-active' : ''} onClick={() => setMode('csv')}>CSV/PDF</button>
        </div>

        <label className="import-file-button">
          Ler PDF, imagem ou CSV
          <input type="file" accept={DOCUMENT_ACCEPT} onChange={handleFileChange} />
        </label>

        {sourceFile && <p className="document-source-pill">📎 {sourceFile.name} · {extraction?.status || 'aguardando leitura'}</p>}
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
