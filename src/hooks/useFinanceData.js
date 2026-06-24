import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'

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
  }, [reload])

  return { transactions, loading, error, reload }
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
