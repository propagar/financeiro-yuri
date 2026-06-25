import { createContext, useContext, useState, useCallback } from 'react'

const TransactionModalContext = createContext(null)

export function TransactionModalProvider({ children }) {
  const [state, setState] = useState({ open: false, transaction: null })
  const [version, setVersion] = useState(0)

  const openNew = useCallback(() => setState({ open: true, transaction: null }), [])
  const openEdit = useCallback((t) => setState({ open: true, transaction: t }), [])
  const openDuplicate = useCallback((t) => {
    // Duplicar: mesma transação, mas sem id (vira criação) e com a data de hoje
    const { id, created_at, updated_at, recurrence_id, ...rest } = t
    setState({
      open: true,
      transaction: { ...rest, occurred_on: new Date().toISOString().slice(0, 10) },
    })
  }, [])
  const close = useCallback(() => setState({ open: false, transaction: null }), [])
  const notifySaved = useCallback(() => setVersion((v) => v + 1), [])

  const value = { ...state, openNew, openEdit, openDuplicate, close, notifySaved, version }

  return (
    <TransactionModalContext.Provider value={value}>
      {children}
    </TransactionModalContext.Provider>
  )
}

export function useTransactionModal() {
  const ctx = useContext(TransactionModalContext)
  if (!ctx) throw new Error('useTransactionModal precisa estar dentro de TransactionModalProvider')
  return ctx
}
