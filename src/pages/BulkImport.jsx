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
const STATUS_OPTIONS = ['todos', 'pronto', 'incompleto', 'duplicado possível', 'erro', 'ignorado', 'importado']

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
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const filteredItems = useMemo(() => items.filter((item) => (fileFilter === 'todos' || item.file_name === fileFilter) && (statusFilter === 'todos' || item.status === statusFilter)), [items, fileFilter, statusFilter])
  const selectedCount = items.filter((item) => item.selected && ['pronto', 'duplicado possível'].includes(item.status)).length

  const addFiles = async (fileList) => {
    setMessage('')
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
  const updateItem = (id, field, value) => setItems((current) => markDuplicates(current.map((item) => item.id === id ? { ...item, [field]: value, status: item.status === 'importado' ? 'importado' : validateStatus({ ...item, [field]: value }) } : item), transactions))
  const removeItem = (id) => setItems((current) => current.map((item) => item.id === id ? { ...item, selected: false, status: 'ignorado' } : item))
  const applyMapping = () => {
    const map = Object.fromEntries(Object.entries(mappingDraft.mapping).map(([key, value]) => [key, value === '' ? -1 : Number(value)]))
    const parsed = rowsToImportItems(mappingDraft.rows, map, mappingDraft.fileName)
    setItems((current) => markDuplicates([...current, ...parsed], transactions))
    updateFile(mappingDraft.fileId, 'prévia gerada', `${parsed.length} lançamento(s) gerados com mapeamento manual.`)
    setMappingDraft(null)
  }

  const confirmImport = async () => {
    if (!activeProfileId) { setMessage('Selecione um perfil específico antes de importar.'); return }
    const selected = items.filter((item) => item.selected && ['pronto', 'duplicado possível'].includes(item.status))
    if (!selected.length) { setMessage('Selecione ao menos uma linha pronta para importar.'); return }
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
    setItems((current) => current.map((item) => item.selected ? { ...item, status: 'importado', selected: false } : item))
    setMessage(`${selected.length} lançamento(s) importado(s) com vínculo à sessão.`)
    setSaving(false)
    reload()
  }

  return <div className="bulk-import-page">
    <header className="page-header"><div><h1>Importar lançamentos em massa</h1><p>Envie extratos do banco, CSVs, PDFs ou arquivos OFX para gerar vários lançamentos de uma vez. Revise antes de confirmar. Nada será lançado automaticamente.</p><p className="modal-context">Perfil: <strong>{activeProfile?.icon} {activeProfile?.name || 'selecione um perfil'}</strong></p></div></header>
    <label className="bulk-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><input type="file" multiple accept={IMPORT_ACCEPT} onChange={(e) => addFiles(e.target.files)} /><strong>Arraste e solte arquivos aqui</strong><span>ou clique para selecionar CSV, PDF, OFX, XLS/XLSX.</span></label>
    {files.length > 0 && <section className="bulk-card"><h2>Arquivos adicionados</h2><div className="bulk-file-list">{files.map((file) => <div key={file.id} className="bulk-file-row"><strong>{file.name}</strong><span>{file.kind.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB</span><em>{file.status}</em><small>{file.note}</small></div>)}</div></section>}
    {mappingDraft && <section className="bulk-card"><h2>Mapeamento manual — {mappingDraft.fileName}</h2><p>Não identificamos todas as colunas. Informe quais campos representam os dados principais.</p><div className="mapping-grid">{['date','description','amount','debit','credit','category'].map((field) => <label key={field}>{field}<select value={mappingDraft.mapping[field]} onChange={(e) => setMappingDraft((current) => ({ ...current, mapping: { ...current.mapping, [field]: e.target.value } }))}><option value="">Não usar</option>{mappingDraft.headers.map((header, index) => <option key={header + index} value={index}>{header}</option>)}</select></label>)}</div><button className="btn-primary" type="button" onClick={applyMapping}>Gerar prévia com este mapeamento</button></section>}
    <section className="bulk-card"><div className="bulk-preview-head"><div><h2>Encontramos estes lançamentos nos seus arquivos</h2><p>Algumas linhas precisam de revisão. Possíveis duplicidades foram encontradas.</p></div><div className="bulk-filters"><select value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}><option value="todos">Todos os arquivos</option>{[...new Set(items.map((item) => item.file_name))].map((name) => <option key={name}>{name}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></div></div><div className="bulk-table-wrap"><table className="bulk-table"><thead><tr><th>Sel.</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Conta</th><th>Forma</th><th>Origem</th><th>Arquivo</th><th>Status</th><th>Observações</th><th></th></tr></thead><tbody>{filteredItems.map((item) => <tr key={item.id} className={item.status.includes('duplicado') ? 'duplicate-row' : ''}><td><input type="checkbox" checked={item.selected} disabled={item.status === 'importado'} onChange={(e) => updateItem(item.id, 'selected', e.target.checked)} /></td><td><input type="date" value={item.occurred_on} onChange={(e) => updateItem(item.id, 'occurred_on', e.target.value)} /></td><td><input value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} /></td><td><input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updateItem(item.id, 'amount', e.target.value)} /></td><td><select value={item.kind} onChange={(e) => updateItem(item.id, 'kind', e.target.value)}><option value="despesa">gasto</option><option value="receita">entrada</option></select></td><td><select value={item.category_id} onChange={(e) => updateItem(item.id, 'category_id', e.target.value)}><option value="">Sem categoria</option>{categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{cat.depth ? '↳ ' : ''}{cat.icon} {cat.name}</option>)}</select></td><td><select value={item.account_id} onChange={(e) => updateItem(item.id, 'account_id', e.target.value)}><option value="">Sem conta</option>{accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}</select></td><td><select value={item.payment_method} onChange={(e) => updateItem(item.id, 'payment_method', e.target.value)}><option value="">—</option>{PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}</select></td><td>{item.source_type}</td><td>{item.file_name}</td><td><span className={'status-pill status-' + item.status.replace(/\s+/g, '-')}>{item.status}</span></td><td><input value={item.notes} onChange={(e) => updateItem(item.id, 'notes', e.target.value)} /></td><td><button className="btn-secondary" type="button" onClick={() => removeItem(item.id)}>Remover</button></td></tr>)}</tbody></table>{items.length === 0 && <p className="empty-import">A prévia consolidada aparecerá aqui após a leitura dos arquivos.</p>}</div><div className="bulk-actions"><span>{items.length} linha(s) · {selectedCount} selecionada(s)</span><button className="btn-primary" type="button" onClick={confirmImport} disabled={saving || selectedCount === 0}>{saving ? 'Salvando…' : 'Confirmar importação dos selecionados'}</button></div>{message && <p className="login-error">{message}</p>}</section>
  </div>
}

function validateStatus(item) {
  if (!item.occurred_on || !item.name?.trim() || !(Number(item.amount) > 0)) return 'incompleto'
  return item.status === 'duplicado possível' ? 'duplicado possível' : 'pronto'
}
