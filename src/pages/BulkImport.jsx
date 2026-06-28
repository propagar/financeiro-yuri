import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories, flattenCategoriesForSelect, useTransactions } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { extractDocumentText } from '../lib/documentExtraction'
import { IMPORT_ACCEPT, detectFileKind, markDuplicates, parseDelimitedText, parseOfxText, parsePdfLikeText, rowsToImportItems, sanitizeFileName } from '../lib/bulkImportParser'
import './BulkImport.css'

const ATTACHMENT_BUCKET = 'financial-attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência']
const STATUS_OPTIONS = ['todos', 'selecionados', 'pronto', 'incompleto', 'duplicado possível', 'erro', 'ignorado', 'importado']
const TYPE_OPTIONS = ['todos', 'despesa', 'receita']
const PAGE_SIZE = 50

export default function BulkImport() {
  const { activeProfileId, activeProfile } = useProfiles()
  const { transactions, reload } = useTransactions()
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const categoryOptions = flattenCategoriesForSelect(categories)
  const [files, setFiles] = useState([])
  const [items, setItems] = useState([])
  const [mappingDraft, setMappingDraft] = useState(null)
  const [fileFilter, setFileFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [groupByFile, setGroupByFile] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const fileNames = useMemo(() => [...new Set(items.map((item) => item.file_name))], [items])
  const filteredItems = useMemo(() => items.filter((item) => {
    const query = normalizeSearch(search)
    const matchesSearch = !query || [item.name, item.amount, item.occurred_on, item.file_name, item.notes, validationMessages(item).join(' ')].some((value) => normalizeSearch(value).includes(query))
    const matchesStatus = statusFilter === 'todos' || (statusFilter === 'selecionados' ? item.selected : item.status === statusFilter)
    return (fileFilter === 'todos' || item.file_name === fileFilter) && matchesStatus && (typeFilter === 'todos' || item.kind === typeFilter) && matchesSearch
  }), [items, fileFilter, statusFilter, typeFilter, search])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const pagedItems = useMemo(() => filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredItems, page])
  const selectedItems = items.filter((item) => item.selected && canImport(item))
  const selectedCount = selectedItems.length
  const summary = useMemo(() => buildSummary(items, selectedItems), [items, selectedItems])
  const fileSummaries = useMemo(() => fileNames.map((name) => ({ name, ...buildSummary(items.filter((item) => item.file_name === name), selectedItems.filter((item) => item.file_name === name)) })), [fileNames, items, selectedItems])
  const groupedItems = useMemo(() => fileNames.map((name) => ({ name, items: pagedItems.filter((item) => item.file_name === name), summary: fileSummaries.find((file) => file.name === name) })).filter((group) => group.items.length), [fileNames, pagedItems, fileSummaries])

  const addFiles = async (fileList) => {
    setMessage('')
    setPage(1)
    const incoming = Array.from(fileList ?? [])
    for (const file of incoming) await processFile(file)
  }

  const processFile = async (file) => {
    if (!activeProfileId) { setMessage('Selecione um perfil específico antes de importar.'); return }
    if (file.size > MAX_FILE_SIZE) { appendFile(file, 'erro', 'Arquivo maior que 10 MB.'); return }
    const kind = detectFileKind(file)
    const fileId = crypto.randomUUID()
    appendFile(file, 'lendo', 'Lendo arquivo…', fileId, kind)
    try {
      let parsedItems = []
      let readMessage = ''
      if (kind === 'csv') {
        const text = await file.text()
        const parsed = parseDelimitedText(text, file.name)
        if (parsed.needsMapping) setMappingDraft({ fileId, fileName: file.name, headers: parsed.headers, rows: parsed.rows, mapping: { date: '', description: '', amount: '', debit: '', credit: '', category: '' } })
        parsedItems = parsed.items
        readMessage = parsed.message || `${parsed.items.length} lançamento(s) detectado(s).`
      } else if (kind === 'ofx') {
        parsedItems = parseOfxText(await file.text(), file.name)
        readMessage = `${parsedItems.length} lançamento(s) OFX detectado(s).`
      } else if (kind === 'pdf') {
        const extraction = await extractDocumentText(file)
        parsedItems = extraction.text ? parsePdfLikeText(extraction.text, file.name) : []
        readMessage = parsedItems.length ? `${parsedItems.length} lançamento(s) encontrados no PDF.` : 'Arquivo salvo, mas não foi possível extrair lançamentos automaticamente. Você pode revisar ou lançar manualmente.'
      } else if (kind === 'spreadsheet') {
        readMessage = 'Planilha aceita e salva para a sessão, mas leitura XLS/XLSX automática ainda está preparada para implementação futura. Exporte como CSV para prévia automática.'
      } else {
        readMessage = 'Formato não suportado para leitura automática.'
      }
      const withDuplicates = markDuplicates(parsedItems, transactions)
      setItems((current) => markDuplicates([...current, ...withDuplicates], transactions))
      updateFile(fileId, parsedItems.length ? 'prévia gerada' : 'salvo sem extração', readMessage)
    } catch (error) {
      updateFile(fileId, 'erro', error.message)
    }
  }

  const appendFile = (file, status, note, id = crypto.randomUUID(), kind = detectFileKind(file)) => {
    setFiles((current) => [...current, { id, file, name: file.name, size: file.size, kind, status, note }])
  }
  const updateFile = (id, status, note) => setFiles((current) => current.map((item) => item.id === id ? { ...item, status, note } : item))
  const updateItem = (id, field, value) => setItems((current) => markDuplicates(current.map((item) => item.id === id ? normalizeItem({ ...item, [field]: value }, field) : item), transactions))
  const bulkSelect = (mode) => setItems((current) => current.map((item) => {
    if (item.status === 'importado') return item
    if (mode === 'ready') return { ...item, selected: canImport(item) }
    if (mode === 'none') return { ...item, selected: false }
    if (mode === 'expenses') return { ...item, selected: item.kind === 'despesa' && canImport(item) }
    if (mode === 'income') return { ...item, selected: item.kind === 'receita' && canImport(item) }
    if (mode === 'no-duplicates') return item.status === 'duplicado possível' ? { ...item, selected: false } : item
    if (mode === 'no-invalid') return canImport(item) ? item : { ...item, selected: false }
    return item
  }))
  const removeItem = (id) => setItems((current) => current.map((item) => item.id === id ? { ...item, selected: false, status: 'ignorado' } : item))
  const applyMapping = () => {
    const map = Object.fromEntries(Object.entries(mappingDraft.mapping).map(([key, value]) => [key, value === '' ? -1 : Number(value)]))
    const parsed = rowsToImportItems(mappingDraft.rows, map, mappingDraft.fileName)
    setItems((current) => markDuplicates([...current, ...parsed], transactions))
    updateFile(mappingDraft.fileId, 'prévia gerada', `${parsed.length} lançamento(s) gerados com mapeamento manual.`)
    setMappingDraft(null)
  }

  const importSelected = () => {
    const invalidSelected = items.filter((item) => item.selected && !canImport(item))
    if (invalidSelected.length) { setMessage('Corrija os itens incompletos ou com erro para poder importar.'); return }
    if (!selectedCount) { setMessage('Selecione ao menos uma linha pronta para importar.'); return }
    setShowConfirm(true)
  }

  const confirmImport = async () => {
    if (!activeProfileId) { setMessage('Selecione um perfil específico antes de importar.'); return }
    const selected = items.filter((item) => item.selected && canImport(item))
    if (!selected.length) { setMessage('Selecione ao menos uma linha pronta para importar.'); return }
    setShowConfirm(false)
    setSaving(true)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) { setMessage(userError.message); setSaving(false); return }
    const { data: session, error: sessionError } = await supabase.from('financial_import_sessions').insert({ profile_id: activeProfileId, created_by: userData.user?.id ?? null, status: 'reviewed', source_label: 'Importar lançamentos em massa' }).select('id').single()
    if (sessionError) { setMessage(sessionError.message); setSaving(false); return }

    const fileRows = []
    for (const source of files) {
      const path = [activeProfileId, 'bulk-imports', session.id, `${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(source.name)}`].join('/')
      const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, source.file, { contentType: source.file.type || undefined, upsert: false })
      if (!uploadError) fileRows.push({ import_session_id: session.id, profile_id: activeProfileId, uploaded_by: userData.user?.id ?? null, bucket_id: ATTACHMENT_BUCKET, storage_path: path, file_name: source.name, content_type: source.file.type || null, file_size: source.size, file_kind: source.kind, read_status: source.status, read_message: source.note })
    }
    const { data: insertedFiles } = await supabase.from('financial_import_files').insert(fileRows).select('id,file_name')
    const fileIdByName = new Map((insertedFiles ?? []).map((f) => [f.file_name, f.id]))
    const itemRows = selected.map((item) => ({ import_session_id: session.id, import_file_id: fileIdByName.get(item.file_name) || null, profile_id: activeProfileId, status: 'ready', occurred_on: item.occurred_on, description: item.name.trim(), amount: Number(item.amount), kind: item.kind, category_id: item.category_id || null, account_id: item.account_id || null, payment_method: item.payment_method || null, source_type: item.source_type, source_file_name: item.file_name, external_id: item.external_id, notes: item.notes || null }))
    const { data: importedItems, error: itemsError } = await supabase.from('financial_import_items').insert(itemRows).select('id,description,amount,occurred_on')
    if (itemsError) { setMessage(itemsError.message); setSaving(false); return }
    const transactionsPayload = selected.map((item, index) => ({ profile_id: activeProfileId, account_id: item.account_id || null, category_id: item.category_id || null, name: item.name.trim(), kind: item.kind, amount: Number(item.amount), occurred_on: item.occurred_on, payment_method: item.payment_method || null, status: 'Pago', notes: [item.notes, `Importado de ${item.file_name}`].filter(Boolean).join('\n'), import_session_id: session.id, import_item_id: importedItems?.[index]?.id || null }))
    const { error: txError } = await supabase.from('transactions').insert(transactionsPayload)
    if (txError) { setMessage(txError.message); setSaving(false); return }
    await supabase.from('financial_import_items').update({ status: 'imported' }).in('id', (importedItems ?? []).map((item) => item.id))
    await supabase.from('financial_import_sessions').update({ status: 'imported', imported_count: selected.length }).eq('id', session.id)
    setItems((current) => current.map((item) => item.selected && canImport(item) ? { ...item, status: 'importado', selected: false } : item))
    setMessage(`${selected.length} lançamento(s) importado(s) com vínculo à sessão.`)
    setSaving(false)
    reload()
  }

  return <div className="bulk-import-page">
    <header className="page-header"><div><h1>Importar lançamentos em massa</h1><p>Envie extratos do banco, CSVs, PDFs ou arquivos OFX para gerar vários lançamentos de uma vez. Revise antes de confirmar. Nada será lançado automaticamente.</p><p className="modal-context">Perfil: <strong>{activeProfile?.icon} {activeProfile?.name || 'selecione um perfil'}</strong></p></div></header>
    <label className="bulk-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><input type="file" multiple accept={IMPORT_ACCEPT} onChange={(e) => addFiles(e.target.files)} /><strong>Arraste e solte arquivos aqui</strong><span>ou clique para selecionar CSV, PDF, OFX, XLS/XLSX.</span></label>
    {files.length > 0 && <section className="bulk-card"><h2>Arquivos adicionados</h2><div className="bulk-file-list">{files.map((file) => <div key={file.id} className="bulk-file-row"><strong>{file.name}</strong><span>{file.kind.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB</span><em>{file.status}</em><small>{file.note}</small></div>)}</div></section>}
    {mappingDraft && <section className="bulk-card"><h2>Mapeamento manual — {mappingDraft.fileName}</h2><p>Não identificamos todas as colunas. Informe quais campos representam os dados principais.</p><div className="mapping-grid">{['date','description','amount','debit','credit','category'].map((field) => <label key={field}>{field}<select value={mappingDraft.mapping[field]} onChange={(e) => setMappingDraft((current) => ({ ...current, mapping: { ...current.mapping, [field]: e.target.value } }))}><option value="">Não usar</option>{mappingDraft.headers.map((header, index) => <option key={header + index} value={index}>{header}</option>)}</select></label>)}</div><button className="btn-primary" type="button" onClick={applyMapping}>Gerar prévia com este mapeamento</button></section>}
    <section className="bulk-card">
      <div className="bulk-preview-head"><div><h2>Prévia da importação</h2><p>Revise os lançamentos antes de confirmar. Nada será salvo até você confirmar.</p></div></div>
      <div className="summary-grid">{[
        ['Linhas detectadas', summary.total], ['Prontas', summary.ready], ['Incompletas', summary.incomplete], ['Duplicadas possíveis', summary.duplicate], ['Com erro', summary.error], ['Selecionadas', summary.selected], ['Valor selecionado', formatCurrency(summary.selectedAmount)], ['Total de gastos', formatCurrency(summary.expenses)], ['Total de entradas', formatCurrency(summary.income)],
      ].map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {fileSummaries.length > 1 && <div className="file-summary-list"><div className="file-summary-title"><strong>Agrupamento por arquivo</strong><label className="checkbox-label"><input type="checkbox" checked={groupByFile} onChange={(e) => setGroupByFile(e.target.checked)} /> Visualizar agrupado</label></div>{fileSummaries.map((file) => <div key={file.name} className="file-summary-row"><strong>Arquivo: {file.name}</strong><span>{file.total} lançamentos encontrados</span><span>{file.ready} prontos</span><span>{file.incomplete} incompletos</span><span>{file.duplicate} possíveis duplicados</span></div>)}</div>}
      <div className="bulk-toolbar">
        <input className="bulk-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar por descrição, valor, data, arquivo ou observação" />
        <select value={fileFilter} onChange={(e) => { setFileFilter(e.target.value); setPage(1) }}><option value="todos">Todos os arquivos</option>{fileNames.map((name) => <option key={name}>{name}</option>)}</select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}>{TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type === 'todos' ? 'todos os tipos' : type === 'despesa' ? 'gastos' : 'entradas'}</option>)}</select>
      </div>
      <div className="bulk-mass-actions"><button type="button" className="btn-secondary" onClick={() => bulkSelect('ready')}>Selecionar todos os prontos</button><button type="button" className="btn-secondary" onClick={() => bulkSelect('none')}>Desmarcar todos</button><button type="button" className="btn-secondary" onClick={() => bulkSelect('expenses')}>Selecionar somente gastos</button><button type="button" className="btn-secondary" onClick={() => bulkSelect('income')}>Selecionar somente entradas</button><button type="button" className="btn-secondary" onClick={() => bulkSelect('no-duplicates')}>Desmarcar duplicados</button><button type="button" className="btn-secondary" onClick={() => bulkSelect('no-invalid')}>Desmarcar inválidos</button></div>
      <div className="bulk-table-wrap">{(groupByFile ? groupedItems : [{ name: null, items: pagedItems }]).map((group) => <div key={group.name || 'all'}>{group.name && <h3 className="group-heading">Arquivo: {group.name}</h3>}<table className="bulk-table"><thead><tr><th>Sel.</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Conta</th><th>Forma</th><th>Arquivo de origem</th><th>Status</th><th>Observação/erro</th><th>Ações</th></tr></thead><tbody>{group.items.map((item) => <tr key={item.id} className={item.status.includes('duplicado') ? 'duplicate-row' : ''}><td><input type="checkbox" checked={item.selected} disabled={item.status === 'importado' || ['incompleto', 'erro'].includes(item.status)} onChange={(e) => updateItem(item.id, 'selected', e.target.checked)} /></td><td><input type="date" value={item.occurred_on} onChange={(e) => updateItem(item.id, 'occurred_on', e.target.value)} /></td><td><input value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} /></td><td><input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updateItem(item.id, 'amount', e.target.value)} /></td><td><select value={item.kind} onChange={(e) => updateItem(item.id, 'kind', e.target.value)}><option value="despesa">gasto</option><option value="receita">entrada</option></select></td><td><select value={item.category_id} onChange={(e) => updateItem(item.id, 'category_id', e.target.value)}><option value="">Sem categoria</option>{categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{cat.depth ? '↳ ' : ''}{cat.icon} {cat.name}</option>)}</select></td><td><select value={item.account_id} onChange={(e) => updateItem(item.id, 'account_id', e.target.value)}><option value="">Sem conta</option>{accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}</select></td><td><select value={item.payment_method} onChange={(e) => updateItem(item.id, 'payment_method', e.target.value)}><option value="">—</option>{PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}</select></td><td><small>{item.source_type} · {item.file_name}</small></td><td><span className={'status-pill status-' + item.status.replace(/\s+/g, '-')}>{statusLabel(item.status)}</span></td><td><div className="row-notes"><input value={item.notes} onChange={(e) => updateItem(item.id, 'notes', e.target.value)} placeholder="Observação" />{validationMessages(item).map((note) => <small key={note}>{note}</small>)}{item.status === 'duplicado possível' && <div className="duplicate-detail"><strong>{item.duplicate_reason || 'Possível duplicidade encontrada'}</strong><span>{duplicateText(item)}</span><label><input type="checkbox" checked={item.selected} onChange={(e) => updateItem(item.id, 'selected', e.target.checked)} /> Manter selecionado</label></div>}</div></td><td><button className="btn-secondary" type="button" onClick={() => removeItem(item.id)}>Ignorar</button></td></tr>)}</tbody></table></div>)}{items.length === 0 && <p className="empty-import">A prévia consolidada aparecerá aqui após a leitura dos arquivos.</p>}{items.length > 0 && !filteredItems.length && <p className="empty-import">Nenhum lançamento encontrado com os filtros atuais.</p>}</div>
      <div className="bulk-actions"><span>{filteredItems.length} linha(s) filtrada(s) · {selectedCount} selecionada(s)</span><div className="pager"><button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button className="btn-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></div><button className="btn-primary" type="button" onClick={importSelected} disabled={saving || selectedCount === 0}>{saving ? 'Salvando…' : 'Importar selecionados'}</button></div>
      {summary.incomplete + summary.error > 0 && <p className="bulk-warning">Corrija os itens incompletos para poder importar.</p>}{message && <p className="login-error">{message}</p>}
    </section>
    {showConfirm && <div className="modal-backdrop" onClick={() => setShowConfirm(false)}><div className="modal-card import-confirm-modal" onClick={(e) => e.stopPropagation()}><h2>Confirmar importação</h2><p>Você está prestes a importar {selectedCount} lançamentos financeiros. Revise os dados antes de confirmar.</p><div className="confirm-summary"><span>Valor total: <strong>{formatCurrency(summary.selectedAmount)}</strong></span><span>Gastos: <strong>{selectedItems.filter((item) => item.kind === 'despesa').length}</strong></span><span>Entradas: <strong>{selectedItems.filter((item) => item.kind === 'receita').length}</strong></span><span>Arquivos: <strong>{[...new Set(selectedItems.map((item) => item.file_name))].join(', ')}</strong></span></div><p className="bulk-warning">Esta ação vai criar lançamentos financeiros reais.</p><div className="import-confirm-actions"><button className="btn-secondary" type="button" onClick={() => setShowConfirm(false)}>Voltar para revisão</button><button className="btn-primary" type="button" onClick={confirmImport} disabled={saving}>{saving ? 'Importando…' : 'Confirmar e salvar'}</button></div></div></div>}
  </div>
}


function normalizeItem(item, field) {
  if (field === 'selected') return { ...item, selected: Boolean(item.selected) }
  if (item.status === 'importado') return item
  const status = validateStatus(item)
  return { ...item, status, selected: ['incompleto', 'erro'].includes(status) ? false : item.selected }
}

function canImport(item) { return ['pronto', 'duplicado possível'].includes(item.status) }
function normalizeSearch(value) { return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function statusLabel(status) { return status === 'pronto' ? 'pronto' : status }
function formatCurrency(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function buildSummary(sourceItems, selectedItems) { return { total: sourceItems.length, ready: sourceItems.filter((item) => item.status === 'pronto').length, incomplete: sourceItems.filter((item) => item.status === 'incompleto').length, duplicate: sourceItems.filter((item) => item.status === 'duplicado possível').length, error: sourceItems.filter((item) => item.status === 'erro').length, selected: selectedItems.length, selectedAmount: selectedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), expenses: selectedItems.filter((item) => item.kind === 'despesa').reduce((sum, item) => sum + Number(item.amount || 0), 0), income: selectedItems.filter((item) => item.kind === 'receita').reduce((sum, item) => sum + Number(item.amount || 0), 0) } }
function validationMessages(item) {
  const messages = []
  if (!item.occurred_on) messages.push('Data inválida')
  if (!item.name?.trim()) messages.push('Descrição vazia')
  if (!(Number(item.amount) > 0)) messages.push('Valor não identificado')
  if (!item.category_id) messages.push('Categoria não definida')
  if (item.status === 'duplicado possível') messages.push('Possível duplicidade encontrada')
  if (item.status === 'erro') messages.push(item.notes || 'Erro na leitura da linha')
  return messages
}
function duplicateText(item) {
  const match = item.duplicate_match
  if (!match) return 'Há outro lançamento com data, descrição e valor parecidos nesta prévia ou nos lançamentos existentes.'
  return `${match.occurred_on || 'sem data'} · ${match.name || match.description || 'sem descrição'} · ${formatCurrency(match.amount)}`
}

function validateStatus(item) {
  if (!item.occurred_on || !item.name?.trim() || !(Number(item.amount) > 0)) return 'incompleto'
  return item.status === 'duplicado possível' ? 'duplicado possível' : 'pronto'
}
