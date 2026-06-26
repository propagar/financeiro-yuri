import { useState, useMemo } from 'react'
import { useProfiles } from '../contexts/ProfileContext'
import { useMercadoItemsByProfile } from '../hooks/useFinanceData'
import { formatCurrency, formatDate, currentMonthRange } from '../lib/format'
import DateRangeFilter from '../components/DateRangeFilter'
import './MercadoPage.css'

export default function MercadoPage() {
  const { activeProfile, isConsolidated, profiles } = useProfiles()
  const [range, setRange] = useState(currentMonthRange())
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)

  // Mercado é uma visão exclusiva do perfil PF — não existe consolidado nem no PJ
  const pfProfile = profiles.find((p) => p.type === 'PF')
  const isPF = !isConsolidated && activeProfile?.type === 'PF'

  const { items, loading } = useMercadoItemsByProfile(isPF ? activeProfile.id : null, range)

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const term = search.trim().toLowerCase()
    return items.filter((i) => i.product_name?.toLowerCase().includes(term))
  }, [items, search])

  const products = useMemo(() => groupByProduct(filteredItems), [filteredItems])
  const totals = useMemo(() => {
    const totalSpent = filteredItems.reduce((sum, i) => sum + Number(i.final_price || 0), 0)
    return { totalSpent, totalItems: filteredItems.length, uniqueProducts: products.length }
  }, [filteredItems, products])

  if (!isPF) {
    return (
      <div className="mercado-page">
        <div className="page-header">
          <div>
            <h1>Mercado</h1>
            <p className="dashboard-subtitle">Fluxo de caixa detalhado de compras de mercado</p>
          </div>
        </div>
        <div className="info-box">
          <strong>Disponível apenas no perfil pessoal (PF)</strong>
          <p>
            O Fluxo de Caixa de Mercado é um recurso exclusivo do perfil pessoal, já que
            compras de mercado são uma despesa do dia a dia. Selecione o perfil
            {pfProfile ? <> <strong>{pfProfile.icon} {pfProfile.name}</strong></> : ' pessoal'} no topo para acessá-lo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mercado-page">
      <div className="page-header">
        <div>
          <h1>Mercado</h1>
          <p className="dashboard-subtitle">Fluxo de caixa detalhado de compras de mercado — {activeProfile.name}</p>
        </div>
        <DateRangeFilter range={range} onChange={setRange} />
      </div>

      <div className="mercado-summary-grid">
        <div className="summary-card">
          <span className="summary-label">Total gasto no período</span>
          <span className="summary-value summary-value-expense">{formatCurrency(totals.totalSpent)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Itens comprados</span>
          <span className="summary-value summary-value-neutral">{totals.totalItems}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Produtos distintos</span>
          <span className="summary-value summary-value-neutral">{totals.uniqueProducts}</span>
        </div>
      </div>

      <div className="mercado-search-row">
        <input
          className="mercado-search"
          placeholder="🔍 Buscar produto (ex: leite, tomate, papel higiênico)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          Nenhum item de mercado encontrado neste período.
          Itens aparecem aqui quando você registra uma compra de Mercado, Fruteira ou Farmácia
          com produtos detalhados.
        </div>
      ) : (
        <div className="mercado-products-grid">
          {products.map((p) => (
            <button
              key={p.name}
              className="mercado-product-card"
              onClick={() => setSelectedProduct(p)}
              type="button"
            >
              <div className="mercado-product-top">
                <span className="mercado-product-name">{p.name}</span>
                {p.category && <span className="mercado-product-category">{p.category}</span>}
              </div>
              <div className="mercado-product-prices">
                <div className="mercado-price-stat">
                  <span className="mercado-price-label">Preço médio</span>
                  <span className="mercado-price-value">{formatCurrency(p.avgPrice)}{p.unit && p.unit !== 'un.' ? `/${p.unit}` : ''}</span>
                </div>
                <div className="mercado-price-stat">
                  <span className="mercado-price-label">Menor preço visto</span>
                  <span className="mercado-price-value mercado-price-best">{formatCurrency(p.minPrice)}</span>
                </div>
              </div>
              <div className="mercado-product-footer">
                <span>{p.purchaseCount}x comprado</span>
                <span>Mais barato em: <strong>{p.bestEstablishment || '—'}</strong></span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedProduct && (
        <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  )
}

function groupByProduct(items) {
  const map = new Map()

  for (const item of items) {
    const key = (item.product_name || 'Sem nome').trim().toLowerCase()
    const pricePerUnit = item.unit_price != null ? Number(item.unit_price) : Number(item.final_price) / Number(item.quantity || 1)

    if (!map.has(key)) {
      map.set(key, {
        name: item.product_name,
        category: item.product_category,
        unit: item.unit,
        purchases: [],
      })
    }
    map.get(key).purchases.push({
      ...item,
      pricePerUnit,
    })
  }

  return [...map.values()].map((p) => {
    const prices = p.purchases.map((x) => x.pricePerUnit).filter((v) => Number.isFinite(v))
    const avgPrice = prices.reduce((s, v) => s + v, 0) / (prices.length || 1)
    const minPrice = Math.min(...prices)
    const best = p.purchases.find((x) => x.pricePerUnit === minPrice)

    return {
      ...p,
      avgPrice,
      minPrice,
      bestEstablishment: best?.establishment,
      purchaseCount: p.purchases.length,
      purchases: p.purchases.sort((a, b) => (a.purchased_on < b.purchased_on ? 1 : -1)),
    }
  }).sort((a, b) => b.purchaseCount - a.purchaseCount)
}

function ProductDetailModal({ product, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card mercado-detail-card" onClick={(e) => e.stopPropagation()}>
        <h2>{product.name}</h2>
        <p className="modal-context">
          {product.purchaseCount} compra{product.purchaseCount > 1 ? 's' : ''} registrada{product.purchaseCount > 1 ? 's' : ''}
          {product.category ? <> · {product.category}</> : null}
        </p>

        <div className="mercado-detail-stats">
          <div>
            <span className="mercado-price-label">Preço médio</span>
            <span className="mercado-price-value">{formatCurrency(product.avgPrice)}</span>
          </div>
          <div>
            <span className="mercado-price-label">Menor preço</span>
            <span className="mercado-price-value mercado-price-best">{formatCurrency(product.minPrice)}</span>
          </div>
          <div>
            <span className="mercado-price-label">Onde foi mais barato</span>
            <span className="mercado-price-value">{product.bestEstablishment || '—'}</span>
          </div>
        </div>

        <ul className="mercado-history-list">
          {product.purchases.map((purchase) => (
            <li key={purchase.id} className="mercado-history-row">
              <span className="mercado-history-date">{formatDate(purchase.purchased_on)}</span>
              <span className="mercado-history-establishment">{purchase.establishment || '—'}</span>
              <span className="mercado-history-qty">{purchase.quantity} {purchase.unit || 'un.'}</span>
              <span className={'mercado-history-price' + (purchase.pricePerUnit === product.minPrice ? ' mercado-price-best' : '')}>
                {formatCurrency(purchase.pricePerUnit)}
              </span>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
