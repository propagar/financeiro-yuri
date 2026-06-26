import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTransactions, useMercadoItems } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import ContextMenu from '../components/ContextMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate } from '../lib/format'
import './Transactions.css'

export default function Transactions() {
  const { transactions, loading, reload } = useTransactions()
  const { activeProfile, isConsolidated } = useProfiles()
  const { openEdit, openDuplicate } = useTransactionModal()
  const [filterKind, setFilterKind] = useState('todos')
  const [search, setSearch] = useState('')
  const [viewingItems, setViewingItems] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, transaction }
  const [deleting, setDeleting] = useState(null) // transação a confirmar exclusão

  const filtered = useMemo(() => {
    let result = transactions
    if (filterKind !== 'todos') {
      result = result.filter((t) => t.kind === filterKind)
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      result = result.filter((t) => {
        const haystack = [
          t.name,
          t.categories?.name,
          t.accounts?.name,
          t.establishment,
          t.notes,
          t.payment_method,
          t.status,
          t.profiles?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }
    return result
  }, [transactions, filterKind, search])

  const handleDeleteConfirmed = async () => {
    if (!deleting) return
    await supabase.from('transactions').delete().eq('id', deleting.id)
    setDeleting(null)
    reload()
  }

  const handleContextMenu = (e, transaction) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, transaction })
  }

  const contextMenuItems = contextMenu
    ? [
        { label: 'Editar', icon: '✏️', onClick: () => openEdit(contextMenu.transaction) },
        { label: 'Duplicar', icon: '📑', onClick: () => openDuplicate(contextMenu.transaction) },
        { label: 'Excluir', icon: '🗑️', danger: true, onClick: () => setDeleting(contextMenu.transaction) },
      ]
    : []

  return (
    <div className="transactions-page">
      <div className="page-header">
        <div>
          <h1>Fluxo de Caixa</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Todos os perfis' : activeProfile?.name}
          </p>
        </div>
      </div>

      <div className="filter-row">
        {['todos', 'receita', 'despesa'].map((k) => (
          <button
            key={k}
            className={'filter-chip' + (filterKind === k ? ' filter-chip-active' : '')}
            onClick={() => setFilterKind(k)}
            type="button"
          >
            {k === 'todos' ? 'Todos' : k === 'receita' ? 'Receitas' : 'Despesas'}
          </button>
        ))}
      </div>

      <div className="search-row">
        <input
          className="search-input"
          placeholder="🔍 Buscar por descrição, categoria, conta, estabelecimento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} type="button" aria-label="Limpar busca">
            ✕
          </button>
        )}
      </div>

      {/* Tabela (desktop) */}
      <div className="transactions-table-wrap">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search ? `Nenhum resultado para "${search}".` : 'Nenhum lançamento encontrado.'}
          </div>
        ) : (
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                {isConsolidated && <th>Perfil</th>}
                <th>Conta</th>
                <th>Forma</th>
                <th>Status</th>
                <th className="col-amount">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} onContextMenu={(e) => handleContextMenu(e, t)}>
                  <td>{formatDate(t.occurred_on)}</td>
                  <td className="col-name">
                    {t.recurrence_id && <span className="recurring-icon" title="Lançamento recorrente">🔁</span>}
                    {t.name}
                    {(t.mercado_items?.[0]?.count ?? 0) > 0 && (
                      <button
                        className="items-badge"
                        onClick={() => setViewingItems(t)}
                        type="button"
                        title="Ver produtos desta compra"
                      >
                        🧾 {t.mercado_items[0].count} itens
                      </button>
                    )}
                  </td>
                  <td>
                    <span className="tag" style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                      {t.categories?.icon} {t.categories?.name || '—'}
                    </span>
                  </td>
                  {isConsolidated && (
                    <td>{t.profiles?.icon} {t.profiles?.name}</td>
                  )}
                  <td>{t.accounts?.name || '—'}</td>
                  <td>{t.payment_method || '—'}</td>
                  <td>
                    <span className={'status-pill status-' + (t.status || 'Pago').toLowerCase().replace(' ', '-')}>
                      {t.status}
                    </span>
                  </td>
                  <td className={'col-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                    {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="col-actions">
                    <button onClick={() => openEdit(t)} type="button" title="Editar">✏️</button>
                    <button onClick={() => openDuplicate(t)} type="button" title="Duplicar">📑</button>
                    <button onClick={() => setDeleting(t)} type="button" title="Excluir">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cards (mobile) */}
      <div className="transactions-cards">
        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search ? `Nenhum resultado para "${search}".` : 'Nenhum lançamento encontrado.'}
          </div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="transaction-card"
              onContextMenu={(e) => handleContextMenu(e, t)}
            >
              <div className="transaction-card-top">
                <div className="transaction-card-info">
                  <div className="transaction-card-name">
                    {t.recurrence_id && <span className="recurring-icon">🔁</span>}
                    {t.name}
                  </div>
                  <div className="transaction-card-date">{formatDate(t.occurred_on)}</div>
                </div>
                <span className={'transaction-card-amount ' + (t.kind === 'receita' ? 'amount-income' : 'amount-expense')}>
                  {t.kind === 'receita' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
              <div className="transaction-card-meta">
                <span className="tag" style={{ background: (t.categories?.color || '#94a3b8') + '22', color: t.categories?.color || '#64748b' }}>
                  {t.categories?.icon} {t.categories?.name || '—'}
                </span>
                <span className={'status-pill status-' + (t.status || 'Pago').toLowerCase().replace(' ', '-')}>
                  {t.status}
                </span>
                {isConsolidated && (
                  <span className="tag">{t.profiles?.icon} {t.profiles?.name}</span>
                )}
                {(t.mercado_items?.[0]?.count ?? 0) > 0 && (
                  <button className="items-badge" onClick={() => setViewingItems(t)} type="button">
                    🧾 {t.mercado_items[0].count} itens
                  </button>
                )}
              </div>
              <div className="transaction-card-footer">
                <button onClick={() => openEdit(t)} type="button" title="Editar">✏️</button>
                <button onClick={() => openDuplicate(t)} type="button" title="Duplicar">📑</button>
                <button onClick={() => setDeleting(t)} type="button" title="Excluir">🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {viewingItems && (
        <MercadoItemsModal
          transaction={viewingItems}
          onClose={() => setViewingItems(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir lançamento?"
          message="Essa ação não pode ser desfeita."
          preview={[
            { label: 'Descrição', value: deleting.name },
            { label: 'Data', value: formatDate(deleting.occurred_on) },
            {
              label: 'Valor',
              value: (deleting.kind === 'receita' ? '+' : '-') + formatCurrency(deleting.amount),
              tone: deleting.kind === 'receita' ? 'income' : 'expense',
            },
          ]}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function MercadoItemsModal({ transaction, onClose }) {
  const { items, loading } = useMercadoItems(transaction.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Produtos — {transaction.name}</h2>
        <p className="modal-context">
          {formatDate(transaction.occurred_on)} · {transaction.establishment || '—'} · Total {formatCurrency(transaction.amount)}
        </p>

        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="empty-state">Nenhum produto itemizado para esta compra.</div>
        ) : (
          <ul className="mercado-items-list">
            {items.map((item) => (
              <li key={item.id} className="mercado-item-row">
                <div className="mercado-item-info">
                  <span className="mercado-item-name">{item.product_name}</span>
                  {item.brand && <span className="mercado-item-brand">{item.brand}</span>}
                </div>
                <span className="mercado-item-qty">
                  {item.quantity} {item.unit}
                </span>
                <span className="mercado-item-price">{formatCurrency(item.final_price)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
