const IMAGE_MIME_PREFIX = 'image/'
const PDF_MIME_TYPE = 'application/pdf'

function decodePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, token) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[token] ?? token)
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
}

function normalizeExtractedText(text) {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractTextFromRawPdf(binaryText) {
  const fragments = []
  const literalStringPattern = /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")/g
  for (const match of binaryText.matchAll(literalStringPattern)) {
    fragments.push(decodePdfString(match[0].replace(/\)\s*(?:Tj|'|")$/, '').slice(1)))
  }

  const arrayPattern = /\[((?:\s*\((?:\\.|[^\\()])*\)\s*-?\d*\.?\d*\s*)+)\]\s*TJ/g
  for (const match of binaryText.matchAll(arrayPattern)) {
    const parts = [...match[1].matchAll(/\((?:\\.|[^\\()])*\)/g)].map((part) => decodePdfString(part[0].slice(1, -1)))
    fragments.push(parts.join(''))
  }

  return normalizeExtractedText(fragments.join('\n'))
}

export async function extractDocumentText(file) {
  if (!file) return { kind: 'unknown', status: 'unsupported', text: '', message: 'Nenhum arquivo selecionado.' }

  if (file.type?.startsWith(IMAGE_MIME_PREFIX)) {
    return {
      kind: 'image',
      status: 'unsupported',
      text: '',
      message: 'Imagem salva como origem documental. OCR ainda não está habilitado; preencha o lançamento manualmente.',
    }
  }

  if (file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith('.pdf')) {
    const buffer = await file.arrayBuffer()
    const binaryText = new TextDecoder('latin1').decode(buffer)
    const text = extractTextFromRawPdf(binaryText)
    return {
      kind: 'pdf',
      status: text ? 'extracted' : 'empty',
      text,
      message: text
        ? 'Texto básico extraído do PDF. Revise os dados antes de salvar.'
        : 'PDF salvo como origem documental, mas não foi possível extrair texto básico. Preencha o lançamento manualmente.',
    }
  }

  if (file.type?.includes('csv') || file.name.toLowerCase().endsWith('.csv')) {
    return { kind: 'csv', status: 'extracted', text: await file.text(), message: 'CSV lido para gerar sugestões.' }
  }

  if (file.type?.startsWith('text/')) {
    return { kind: 'text', status: 'extracted', text: await file.text(), message: 'Texto lido para gerar sugestões.' }
  }

  return { kind: 'unknown', status: 'unsupported', text: '', message: 'Tipo de arquivo salvo sem extração automática.' }
}
