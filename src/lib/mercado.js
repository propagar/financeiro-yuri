/**
 * Utilitários compartilhados para a seção de Mercado: cálculo de preço por unidade,
 * agregação de histórico por produto (para autocomplete e comparação de preço).
 */

export function normalizeProductKey(name) {
  return (name || '').trim().toLowerCase()
}

export function calcUnitPrice(finalPrice, quantity) {
  const price = Number(finalPrice)
  const qty = Number(quantity) || 1
  if (!Number.isFinite(price) || qty <= 0) return null
  return price / qty
}

/**
 * Agrega o histórico de compras (lista flat de mercado_items) por nome de produto
 * (case-insensitive), retornando, para cada produto: a última categoria/unidade/marca
 * usadas (para sugestão automática) e o preço médio por unidade (para comparação).
 */
export function buildProductHistory(items) {
  const map = new Map()

  for (const item of items) {
    const key = normalizeProductKey(item.product_name)
    if (!key) continue
    const unitPrice = item.unit_price != null ? Number(item.unit_price) : calcUnitPrice(item.final_price, item.quantity)

    if (!map.has(key)) {
      map.set(key, {
        name: item.product_name,
        category: item.category,
        unit: item.unit,
        brand: item.brand,
        establishments: new Set(),
        unitPrices: [],
      })
    }
    const entry = map.get(key)
    if (item.establishment) entry.establishments.add(item.establishment)
    if (Number.isFinite(unitPrice)) entry.unitPrices.push(unitPrice)
  }

  const history = new Map()
  for (const [key, entry] of map) {
    const prices = entry.unitPrices
    const avgUnitPrice = prices.length > 0 ? prices.reduce((s, v) => s + v, 0) / prices.length : null
    history.set(key, {
      name: entry.name,
      category: entry.category,
      unit: entry.unit,
      brand: entry.brand,
      establishments: [...entry.establishments],
      avgUnitPrice,
      purchaseCount: prices.length,
    })
  }
  return history
}

/**
 * Lista de nomes distintos de produtos já cadastrados, ordenada alfabeticamente,
 * para alimentar o autocomplete do campo "Produto".
 */
export function listKnownProductNames(items) {
  const seen = new Map()
  for (const item of items) {
    const key = normalizeProductKey(item.product_name)
    if (key && !seen.has(key)) seen.set(key, item.product_name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Compara o preço por unidade digitado com a média histórica do produto.
 * Retorna null se não houver histórico suficiente, ou { diffPct, tone, avgUnitPrice }.
 */
export function comparePriceToHistory(unitPrice, productHistoryEntry) {
  if (!productHistoryEntry || !Number.isFinite(productHistoryEntry.avgUnitPrice) || !Number.isFinite(unitPrice)) {
    return null
  }
  const avg = productHistoryEntry.avgUnitPrice
  if (avg <= 0) return null

  const diffPct = ((unitPrice - avg) / avg) * 100
  // margem de 3% como "praticamente igual" pra não disparar alerta por ruído de centavos
  const tone = diffPct > 3 ? 'expense' : diffPct < -3 ? 'income' : 'neutral'

  return { diffPct, tone, avgUnitPrice: avg }
}
