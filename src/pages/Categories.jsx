import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCategories } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import './Categories.css'

const EMOJI_SUGGESTIONS = ['📁', '🛒', '🍽️', '🚗', '🏥', '📚', '🏠', '🎉', '🐾', '🛠️', '📱', '💰', '📈', '🔧', '👕', '🧾', '📣', '👥', '📦', '⚽', '🏐', '🌱']

export default function Categories() {
  const [kindFilter, setKindFilter] = useState('despesa')
  const { categories, loading, reload } = useCategories(kindFilter)
  const { activeProfileId, activeProfile, isConsolidated } = useProfiles()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (c) => { setEditing(c); setShowForm(true) }

  const handleArchive = async (id) => {
    if (!window.confirm('Arquivar esta categoria?')) return
    await supabase.from('categories').update({ is_active: false }).eq('id', id)
    reload()
  }

  return (
    <div className="categories-page">
      <div className="page-header">
        <div>
          <h1>Categorias</h1>
          <p className="dashboard-subtitle">
            {isConsolidated ? 'Todos os perfis' : activeProfile?.name}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={openNew}
          type="button"
          disabled={isConsolidated}
          title={isConsolidated ? 'Selecione um perfil específico para cadastrar' : ''}
        >
          + Nova categoria
        </button>
      </div>

      <div className="filter-row">
        {['despesa', 'receita'].map((k) => (
          <button
            key={k}
            className={'filter-chip' + (kindFilter === k ? ' filter-chip-active' : '')}
            onClick={() => setKindFilter(k)}
            type="button"
          >
            {k === 'despesa' ? 'Despesas' : 'Receitas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : categories.length === 0 ? (
        <div className="empty-state">Nenhuma categoria cadastrada.</div>
      ) : (
        <div className="categories-grid">
          {categories.map((c) => (
            <div className="category-chip" key={c.id} style={{ borderColor: c.color }}>
              <span className="category-chip-icon" style={{ background: c.color + '22' }}>{c.icon}</span>
              <span className="category-chip-name">{c.name}</span>
              {isConsolidated && (
                <span className="category-chip-profile">{c.profiles?.icon}</span>
              )}
              <div className="category-chip-actions">
                <button onClick={() => openEdit(c)} type="button" title="Editar">✏️</button>
                <button onClick={() => handleArchive(c.id)} type="button" title="Arquivar">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editing}
          profileId={activeProfileId}
          defaultKind={kindFilter}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}
    </div>
  )
}

function CategoryForm({ category, profileId, defaultKind, onClose, onSaved }) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name || '')
  const [kind, setKind] = useState(category?.kind || defaultKind)
  const [color, setColor] = useState(category?.color || '#6366f1')
  const [icon, setIcon] = useState(category?.icon || '📁')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Dê um nome para a categoria.'); return }

    setSaving(true)
    const payload = {
      profile_id: category?.profile_id || profileId,
      name: name.trim(),
      kind,
      color,
      icon,
    }

    const query = isEdit
      ? supabase.from('categories').update(payload).eq('id', category.id)
      : supabase.from('categories').insert(payload)

    const { error: err } = await query
    setSaving(false)
    if (err) setError(err.message.includes('duplicate') ? 'Já existe uma categoria com esse nome.' : err.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Editar categoria' : 'Nova categoria'}</h2>
        <form onSubmit={handleSubmit} className="transaction-form">
          <div className="kind-toggle">
            <button type="button" className={kind === 'despesa' ? 'kind-active kind-expense' : ''} onClick={() => setKind('despesa')}>Despesa</button>
            <button type="button" className={kind === 'receita' ? 'kind-active kind-income' : ''} onClick={() => setKind('receita')}>Receita</button>
          </div>

          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" required />
          </label>

          <label>
            Ícone
            <div className="emoji-picker">
              {EMOJI_SUGGESTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={'emoji-option' + (icon === e ? ' emoji-option-active' : '')}
                  onClick={() => setIcon(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </label>

          <label>
            Cor
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 4 }} />
          </label>

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
