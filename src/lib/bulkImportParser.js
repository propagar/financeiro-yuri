export const IMPORT_ACCEPT = '.csv,text/csv,.ofx,application/x-ofx,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function sanitizeFileName(fileName) {
  return fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').toLowerCase()
}

export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

export function detectFileKind(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'csv' || file.type.includes('csv')) return 'csv'
  if (ext === 'ofx') return 'ofx'
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (['xls', 'xlsx'].includes(ext)) return 'spreadsheet'
  return 'unknown'
}

export function parseDateToken(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  const ofx = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`
  return ''
}

export function parseAmountToken(value) {
  const raw = String(value ?? '').trim().replace(/R\$\s?/i, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const amount = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function splitCsvLine(line, delimiter) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { cells.push(current.trim()); current = '' }
    else current += char
  }
  cells.push(current.trim())
  return cells
}

export function parseDelimitedText(text, fileName = 'arquivo') {
  const sample = text.split(/\r?\n/).slice(0, 8).join('\n')
  const delimiter = (sample.match(/;/g)?.length || 0) >= (sample.match(/,/g)?.length || 0) ? ';' : ','
  const rows = text.split(/\r?\n/).map((line) => splitCsvLine(line, delimiter)).filter((row) => row.some(Boolean))
  if (!rows.length) return { items: [], needsMapping: false, headers: [], message: 'Arquivo vazio.' }
  const first = rows[0]
  const hasHeader = first.some((cell) => /data|date|descri|hist[oó]rico|lan[cç]amento|valor|d[eé]bito|cr[eé]dito|entrada|sa[ií]da|saldo|categoria/i.test(cell))
  const headers = hasHeader ? first : first.map((_, index) => `Coluna ${index + 1}`)
  const dataRows = hasHeader ? rows.slice(1) : rows
  const guess = (patterns) => headers.findIndex((h) => patterns.some((p) => normalizeText(h).includes(p)))
  const mapping = {
    date: guess(['data', 'date']),
    description: guess(['lancamento', 'historico', 'descricao', 'descrição', 'memo', 'documento']),
    amount: guess(['valor', 'amount', 'total']),
    debit: guess(['debito', 'débito', 'saida', 'saída']),
    credit: guess(['credito', 'crédito', 'entrada']),
    category: guess(['categoria']),
  }
  if (mapping.date < 0 || (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0)) {
    return { items: [], needsMapping: true, headers, rows: dataRows, message: 'Mapeie as colunas para gerar a prévia.' }
  }
  return { items: rowsToImportItems(dataRows, mapping, fileName), needsMapping: false, headers }
}

export function rowsToImportItems(rows, mapping, fileName) {
  return rows.map((row, index) => {
    const debit = mapping.debit >= 0 ? parseAmountToken(row[mapping.debit]) : null
    const credit = mapping.credit >= 0 ? parseAmountToken(row[mapping.credit]) : null
    const amount = mapping.amount >= 0 ? parseAmountToken(row[mapping.amount]) : (credit || (debit ? -Math.abs(debit) : null))
    const description = row[mapping.description] || row.find((cell) => /[a-zA-ZÀ-ÿ]/.test(cell)) || ''
    return buildPreviewItem({ date: parseDateToken(row[mapping.date]), description, amount, categoryName: row[mapping.category] || '', sourceType: 'CSV', fileName, externalId: null, index })
  }).filter(Boolean)
}

export function parseOfxText(text, fileName) {
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  return blocks.map((block, index) => buildPreviewItem({
    date: parseDateToken(readOfxTag(block, 'DTPOSTED')),
    description: readOfxTag(block, 'MEMO') || readOfxTag(block, 'NAME') || readOfxTag(block, 'TRNTYPE'),
    amount: parseAmountToken(readOfxTag(block, 'TRNAMT')),
    sourceType: 'OFX', fileName,
    externalId: readOfxTag(block, 'FITID'),
    accountRef: readOfxTag(text, 'ACCTID'),
    index,
  })).filter(Boolean)
}

function readOfxTag(text, tag) {
  return text.match(new RegExp(`<${tag}>([^<\r\n]+)`, 'i'))?.[1]?.trim() || ''
}

export function parsePdfLikeText(text, fileName) {
  return text.split(/\r?\n/).map((line, index) => {
    const date = parseDateToken(line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/)?.[1])
    const amounts = [...line.matchAll(/-?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2}/g)]
    const amount = parseAmountToken(amounts.at(-1)?.[0])
    if (!date || amount == null) return null
    let description = line.replace(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/, '').replace(amounts.at(-1)[0], '').trim()
    return buildPreviewItem({ date, description, amount, sourceType: 'PDF', fileName, index })
  }).filter(Boolean)
}

export function buildPreviewItem({ date, description, amount, categoryName = '', sourceType, fileName, externalId, accountRef, index }) {
  const numeric = Number(amount)
  const status = !date || !description || !Number.isFinite(numeric) || numeric === 0 ? 'incompleto' : 'pronto'
  return { id: `${fileName}-${sourceType}-${index}-${crypto.randomUUID()}`, selected: status === 'pronto', occurred_on: date || '', name: description || '', amount: Number.isFinite(numeric) ? Math.abs(numeric).toFixed(2) : '', kind: numeric < 0 ? 'despesa' : 'receita', category_id: '', categoryName, account_id: '', payment_method: '', source_type: sourceType, file_name: fileName, status, notes: '', external_id: externalId || null, account_ref: accountRef || null, raw: null }
}

export function markDuplicates(items, existingTransactions) {
  const seen = new Set()
  return items.map((item) => {
    const key = `${item.occurred_on}|${Number(item.amount).toFixed(2)}|${normalizeText(item.name)}|${item.account_id || ''}|${item.external_id || ''}`
    const duplicated = seen.has(key) || existingTransactions.some((t) => t.occurred_on === item.occurred_on && Number(t.amount).toFixed(2) === Number(item.amount).toFixed(2) && normalizeText(t.name) === normalizeText(item.name) && (!item.account_id || t.account_id === item.account_id))
    seen.add(key)
    return duplicated ? { ...item, status: 'duplicado possível', selected: false } : item
  })
}
