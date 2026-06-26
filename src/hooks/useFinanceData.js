import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'

/**
 * Resolve a lista de profile_ids relevante para a consulta atual:
 * - se houver um perfil ativo, só ele
 * - se for visão consolidada, todos os perfis do usuário
 */
function useRelevantProfileIds() {
  const { activeProfileId, profiles } = useProfiles()
  if (activeProfileId) return [activeProfileId]
  return profiles.map((p) => p.id)
}

export function useTransactions({ from, to } = {}) {
  const profileIds = useRelevantProfileIds()
  const { version } = useTransactionModal()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (profileIds.length === 0) {
      setTransactions([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon, color, kind), accounts(name), profiles(name, type, color, icon), mercado_items(count)')
      .in('profile_id', profileIds)
      .order('occurred_on', { ascending: false })

    if (from) query = query.gte('occurred_on', from)
    if (to) query = query.lte('occurred_on', to)

    const { data, error: err } = await query
    if (err) setError(err)
    else setTransactions(data ?? [])
    setLoading(false)
  }, [JSON.stringify(profileIds), from, to])

  useEffect(() => {
    reload()
  }, [reload, version])

  return { transactions, loading, error, reload }
}

/**
 * Busca lançamentos dos últimos N meses (incluindo o mês atual) e agrega receita/despesa
 * por mês, preenchendo com zero os meses sem nenhum lançamento — usado no gráfico de
 * evolução mensal do Dashboard.
 */
export function useMonthlyEvolution(months = 6) {
  const profileIds = useRelevantProfileIds()
  const { version } = useTransactionModal()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (profileIds.length === 0) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)

    const now = new Date()
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
    const from = rangeStart.toISOString().slice(0, 10)

    const { data: rows, error } = await supabase
      .from('transactions')
      .select('amount, kind, occurred_on')
      .in('profile_id', profileIds)
      .gte('occurred_on', from)

    if (error) {
      setData([])
      setLoading(false)
      return
    }

    // Monta os N meses do intervalo, todos zerados, na ordem cronológica
    const buckets = new Map()
    for (let i = 0; i < months; i++) {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, { monthKey: key, monthDate: d.toISOString().slice(0, 10), income: 0, expense: 0 })
    }

    for (const row of rows ?? []) {
      const key = row.occurred_on.slice(0, 7)
      const bucket = buckets.get(key)
      if (!bucket) continue
      if (row.kind === 'receita') bucket.income += Number(row.amount)
      else bucket.expense += Number(row.amount)
    }

    setData([...buckets.values()])
    setLoading(false)
  }, [JSON.stringify(profileIds), months])

  useEffect(() => {
    reload()
  }, [reload, version])

  return { data, loading, reload }
}

export function useAccounts() {
  const profileIds = useRelevantProfileIds()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (profileIds.length === 0) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('*, profiles(name, type, color, icon)')
      .in('profile_id', profileIds)
      .eq('is_active', true)
      .order('name')
    setAccounts(data ?? [])
    setLoading(false)
  }, [JSON.stringify(profileIds)])

  useEffect(() => {
    reload()
  }, [reload])

  return { accounts, loading, reload }
}

export function useMercadoItems(transactionId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!transactionId) {
      setItems([])
      return
    }
    setLoading(true)
    supabase
      .from('mercado_items')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('product_name')
      .then(({ data }) => {
        setItems(data ?? [])
        setLoading(false)
      })
  }, [transactionId])

  return { items, loading }
}

/**
 * Busca todos os itens de mercado de um perfil específico (não consolidado — Mercado é PF apenas),
 * com filtro de período opcional, para a página de Fluxo de Caixa de Mercado.
 */
export function useMercadoItemsByProfile(profileId, { from, to } = {}) {
  const { version } = useTransactionModal()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!profileId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('mercado_items')
      .select('*')
      .eq('profile_id', profileId)
      .order('purchased_on', { ascending: false })

    if (from) query = query.gte('purchased_on', from)
    if (to) query = query.lte('purchased_on', to)

    const { data } = await query
    setItems(data ?? [])
    setLoading(false)
  }, [profileId, from, to])

  useEffect(() => {
    reload()
  }, [reload, version])

  return { items, loading, reload }
}

/**
 * Busca todos os itens de mercado já cadastrados para um perfil (sem filtro de período),
 * usado para autocomplete de produto/categoria/unidade e para a comparação de preço
 * com a média histórica ao cadastrar um novo item.
 */
export function useKnownMercadoProducts(profileId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profileId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('mercado_items')
      .select('product_name, brand, category, unit, quantity, final_price, unit_price, establishment')
      .eq('profile_id', profileId)
      .then(({ data }) => {
        setItems(data ?? [])
        setLoading(false)
      })
  }, [profileId])

  return { items, loading }
}

export function useCategories(kind) {
  const profileIds = useRelevantProfileIds()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (profileIds.length === 0) {
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('categories')
      .select('*, profiles(name, type, color, icon)')
      .in('profile_id', profileIds)
      .eq('is_active', true)
      .order('name')

    if (kind) query = query.eq('kind', kind)

    const { data } = await query
    setCategories(data ?? [])
    setLoading(false)
  }, [JSON.stringify(profileIds), kind])

  useEffect(() => {
    reload()
  }, [reload])

  return { categories, loading, reload }
}

/**
 * Organiza a lista flat de categorias em grupos hierárquicos: cada categoria-pai
 * (parent_category_id == null) com suas subcategorias (parent_category_id == pai.id)
 * aninhadas. Categorias órfãs (pai arquivado) caem como categoria de nível raiz.
 */
export function groupCategoriesByParent(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const roots = []
  const childrenMap = new Map()

  for (const c of categories) {
    if (c.parent_category_id && byId.has(c.parent_category_id)) {
      const list = childrenMap.get(c.parent_category_id) || []
      list.push(c)
      childrenMap.set(c.parent_category_id, list)
    } else {
      roots.push(c)
    }
  }

  return roots.map((parent) => ({
    ...parent,
    subcategories: (childrenMap.get(parent.id) || []).sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

/**
 * Lista flat para uso em <select>, com indentação visual ("↳") para subcategorias,
 * mantendo cada subcategoria logo após seu pai.
 */
export function flattenCategoriesForSelect(categories) {
  const grouped = groupCategoriesByParent(categories)
  const flat = []
  for (const parent of grouped) {
    flat.push({ ...parent, depth: 0 })
    for (const child of parent.subcategories) {
      flat.push({ ...child, depth: 1 })
    }
  }
  return flat
}
