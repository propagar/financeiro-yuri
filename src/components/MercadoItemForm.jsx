import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useKnownMercadoProducts } from '../hooks/useFinanceData'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import {
  buildProductHistory,
  listKnownProductNames,
  normalizeProductKey,
  calcUnitPrice,
  comparePriceToHistory,
} from '../lib/mercado'
import './MercadoItemForm.css'

const UNIT_OPTIONS = ['un.', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'dz']

// Categoria de lançamento (Fluxo de Caixa) para a qual o checkbox de despesa vinculada
// deve sugerir a categoria — Mercado é a mais comum, mas o usuário pode trocar no Fluxo depois.
const MERCADO_CATEGORY_NAME = 'Mercado'

export default function MercadoItemForm({ profileId, onClose, onSaved }) {
  const { items: knownItems } = useKnownMercadoProducts(profileId)
  const { notifySaved } = useTransactionModal()

  const productHistory = useMemo(() => buildProductHistory(knownItems), [knownItems])
  const knownProductNames = useMemo(() => listKnownProductNames(knownItems), [knownItems])

  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('un.')
  const [finalPrice, setFinalPrice] = useState('')
  const [purchasedOn, setPurchasedOn] = useState(new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [establishment, setEstablishment] = useState('')
  const [createExpense, setCreateExpense] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [appliedSuggestionFor, setAppliedSuggestionFor] = useState(null)

  const matchedHistory = productHistory.get(normalizeProductKey(productName)) || null

  const filteredSuggestions = useMemo(() => {
    const term = productName.trim().toLowerCase()
    if (!term) return []
    return knownProductNames.filter((n) => n.toLowerCase().includes(term)).slice(0, 6)
  }, [productName, knownProductNames])

  const unitPrice = calcUnitPrice(finalPrice, quantity)
  const priceComparison = comparePriceToHistory(unitPrice, matchedHistory)

  // Quando o produto digitado bate exatamente com um já conhecido (e ainda não aplicamos
  // a sugestão para esse produto), oferece auto-preencher categoria/unidade/marca.
  const canAutoSuggest = matchedHistory && appliedSuggestionFor !== normalizeProductKey(productName) &&
    (matchedHistory.category || matchedHistory.unit || matchedHistory.brand)

  const applySuggestion = () => {
    if (!matchedHistory) return
    if (matchedHistory.category) setCategory(matchedHistory.category)
    if (matchedHistory.unit) setUnit(matchedHistory.unit)
    if (matchedHistory.brand) setBrand(matchedHistory.brand)
    setAppliedSuggestionFor(normalizeProductKey(productName))
  }

  const pickSuggestion = (name) => {
    setProductName(name)
    setShowSuggestions(false)
    const hist = productHistory.get(normalizeProductKey(name))
    if (hist) {
      if (hist.category) setCategory(hist.category)
      if (hist.unit) setUnit(hist.unit)
      if (hist.brand) setBrand(hist.brand)
      setAppliedSuggestionFor(normalizeProductKey(name))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!productName.trim()) { setError('Informe o nome do produto.'); return }
    if (!finalPrice || Number(finalPrice) <= 0) { setError('Informe o preço pago.'); return }
    if (!quantity || Number(quantity) <= 0) { setError('Informe a quantidade.'); return }

    setSaving(true)

    let transactionId = null

    if (createExpense) {
      // Busca a categoria "Mercado" do perfil para vincular automaticamente, se existir
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('profile_id', profileId)
        .eq('kind', 'despesa')
        .ilike('name', MERCADO_CATEGORY_NAME)
        .maybeSingle()

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          profile_id: profileId,
          name: `Mercado: ${productName.trim()}`,
          kind: 'despesa',
          amount: Number(finalPrice),
          occurred_on: purchasedOn,
          category_id: cat?.id || null,
          status: 'Pago',
          establishment: establishment.trim() || null,
        })
        .select('id')
        .single()

      if (txErr) {
        setSaving(false)
        setError(txErr.message)
        return
      }
      transactionId = tx.id
    }

    const { error: itemErr } = await supabase.from('mercado_items').insert({
      profile_id: profileId,
      transaction_id: transactionId,
      product_name: productName.trim(),
      brand: brand.trim() || null,
      establishment: establishment.trim() || null,
      purchased_on: purchasedOn,
      final_price: Number(finalPrice),
      unit_price: unitPrice,
      quantity: Number(quantity),
      unit: unit || null,
      category: category.trim() || null,
    })

    setSaving(false)

    if (itemErr) {
      setError(itemErr.message)
      return
    }

    if (createExpense) notifySaved()
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Novo item de mercado</h2>
        <p className="modal-context">Registre uma compra para acompanhar preços e histórico.</p>

        <form onSubmit={handleSubmit} className="transaction-form">
          <label className="mercado-form-autocomplete-wrap">
            Produto
            <input
              value={productName}
              onChange={(e) => { setProductName(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              placeholder="Ex: Leite Elege 1L"
              autoComplete="off"
              required
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <ul className="mercado-form-suggestions">
                {filteredSuggestions.map((name) => (
                  <li key={name}>
                    <button type="button" onClick={() => pickSuggestion(name)}>{name}</button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          {canAutoSuggest && (
            <button type="button" className="mercado-form-suggestion-hint" onClick={applySuggestion}>
              💡 Produto conhecido — usar categoria{matchedHistory.category ? ` "${matchedHistory.category}"` : ''}, unidade
              {matchedHistory.unit ? ` "${matchedHistory.unit}"` : ''}{matchedHistory.brand ? ` e marca "${matchedHistory.brand}"` : ''} de antes?
            </button>
          )}

          <div className="form-row">
            <label>
              Quantidade
              <input type="number" step="0.001" min="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </label>
            <label>
              Unidade
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Preço pago (R$)
              <input type="number" step="0.01" min="0" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} required />
            </label>
            <label>
              Data
              <input type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} required />
            </label>
          </div>

          {priceComparison && (
            <div className={`mercado-price-alert mercado-price-alert-${priceComparison.tone}`}>
              {priceComparison.tone === 'expense' && (
                <>⚠️ {Math.abs(priceComparison.diffPct).toFixed(0)}% mais caro que a média histórica (R$ {priceComparison.avgUnitPrice.toFixed(2)}/{unit || 'un.'})</>
              )}
              {priceComparison.tone === 'income' && (
                <>✅ {Math.abs(priceComparison.diffPct).toFixed(0)}% mais barato que a média histórica (R$ {priceComparison.avgUnitPrice.toFixed(2)}/{unit || 'un.'})</>
              )}
              {priceComparison.tone === 'neutral' && (
                <>≈ Praticamente igual à média histórica (R$ {priceComparison.avgUnitPrice.toFixed(2)}/{unit || 'un.'})</>
              )}
            </div>
          )}

          <div className="form-row">
            <label>
              Categoria do produto
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Hortifruti" list="mercado-category-options" />
              <datalist id="mercado-category-options">
                {[...new Set([...productHistory.values()].map((h) => h.category).filter(Boolean))].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Marca (opcional)
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
          </div>

          <label>
            Estabelecimento (opcional)
            <input value={establishment} onChange={(e) => setEstablishment(e.target.value)} placeholder="Ex: Kern, Bourbon…" />
          </label>

          <div className="recurring-box">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={createExpense}
                onChange={(e) => setCreateExpense(e.target.checked)}
              />
              Lançar também como despesa no Fluxo de Caixa
            </label>
            {createExpense && (
              <p className="recurring-hint">
                Cria um lançamento de despesa vinculado a este item, no valor de {finalPrice ? `R$ ${Number(finalPrice).toFixed(2)}` : 'R$ —'},
                na categoria <strong>Mercado</strong> (se existir) e com status <strong>"Pago"</strong>.
              </p>
            )}
          </div>

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
