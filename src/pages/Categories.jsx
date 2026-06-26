import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCategories, groupCategoriesByParent } from '../hooks/useFinanceData'
import { useProfiles } from '../contexts/ProfileContext'
import ConfirmDialog from '../components/ConfirmDialog'
import './Categories.css'

const EMOJI_SUGGESTIONS = ['📁', '🛒', '🍽️', '🚗', '🏥', '📚', '🏠', '🎉', '🐾', '🛠️', '📱', '💰', '📈', '🔧', '👕', '🧾', '📣', '👥', '📦', '⚽', '🏐', '🌱']

export default function Categories() {
  const [kindFilter, setKindFilter] = useState('despesa')
  const { categories, loading, reload } = useCategories(kindFilter)
  const { activeProfileId, activeProfile, isConsolidated } = useProfiles()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [parentForNew, setParentForNew] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const groups = groupCategoriesByParent(categories)

  const openNew = () => { setEditing(null); setParentForNew(null); setShowForm(true) }
  const openEdit = (c) => { setEditing(c); setParentForNew(null); setShowForm(true) }
  const openNewSubcategory = (parent) => { setEditing(null); setParentForNew(parent); setShowForm(true) }

  const handleArchiveConfirmed = async () => {
    if (!archiving) return
    await supabase.from('categories').update({ is_active: false }).eq('id', archiving.id)
    setArchiving(null)
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
      ) : groups.length === 0 ? (
        <div className="empty-state">Nenhuma categoria cadastrada.</div>
      ) : (
        <div className="categories-groups">
          {groups.map((parent) => (
            <div className="category-group" key={parent.id}>
              <div className="category-group-row">
                <CategoryChip
                  category={parent}
                  isConsolidated={isConsolidated}
                  onEdit={() => openEdit(parent)}
                  onArchive={() => setArchiving(parent)}
                />
                <button
                  className="category-add-sub-btn"
                  onClick={() => openNewSubcategory(parent)}
                  type="button"
                  disabled={isConsolidated}
                  title={isConsolidated ? 'Selecione um perfil específico para cadastrar' : 'Adicionar subcategoria'}
                >
                  + subcategoria
                </button>
              </div>

              {parent.subcategories.length > 0 && (
                <div className="category-subgrid">
                  {parent.subcategories.map((c) => (
                    <CategoryChip
                      key={c.id}
                      category={c}
                      isSub
                      isConsolidated={isConsolidated}
                      onEdit={() => openEdit(c)}
                      onArchive={() => setArchiving(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editing}
          parent={parentForNew}
          allCategories={categories}
          profileId={activeProfileId}
          defaultKind={kindFilter}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}

      {archiving && (
        <ConfirmDialog
          title="Arquivar categoria?"
          message={
            archiving.subcategories?.length > 0
              ? 'As subcategorias dela continuarão ativas, mas ficarão sem categoria-pai visível até você arquivá-las também.'
              : 'Lançamentos antigos com essa categoria não serão afetados.'
          }
          confirmLabel="Arquivar"
          preview={[
            { label: 'Categoria', value: `${archiving.icon} ${archiving.name}` },
          ]}
          onConfirm={handleArchiveConfirmed}
          onCancel={() => setArchiving(null)}
        />
      )}
    </div>
  )
}

function CategoryChip({ category, isSub, isConsolidated, onEdit, onArchive }) {
  return (
    <div className={'category-chip' + (isSub ? ' category-chip-sub' : '')} style={{ borderColor: category.color }}>
      {isSub && <span className="category-chip-branch" aria-hidden="true">↳</span>}
      <span className="category-chip-icon" style={{ background: category.color + '22' }}>{category.icon}</span>
      <span className="category-chip-name">{category.name}</span>
      {isConsolidated && (
        <span className="category-chip-profile">{category.profiles?.icon}</span>
      )}
      <div className="category-chip-actions">
        <button onClick={onEdit} type="button" title="Editar">✏️</button>
        <button onClick={onArchive} type="button" title="Arquivar">🗑️</button>
      </div>
    </div>
  )
}

function CategoryForm({ category, parent, allCategories, profileId, defaultKind, onClose, onSaved }) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name || '')
  const [kind, setKind] = useState(category?.kind || parent?.kind || defaultKind)
  const [color, setColor] = useState(category?.color || parent?.color || '#6366f1')
  const [icon, setIcon] = useState(category?.icon || '📁')
  const [parentCategoryId, setParentCategoryId] = useState(category?.parent_category_id || parent?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Só categorias de nível raiz (sem pai) do mesmo kind/perfil podem ser escolhidas como pai —
  // o sistema permite no máximo 1 nível de subcategoria.
  const effectiveProfileId = category?.profile_id || profileId
  const possibleParents = allCategories.filter((c) =>
    !c.parent_category_id &&
    c.kind === kind &&
    c.profile_id === effectiveProfileId &&
    c.id !== category?.id
  )

  // Se estamos criando uma subcategoria diretamente (botão "+ subcategoria"), o pai é fixo
  const parentIsLocked = !!parent && !isEdit

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Dê um nome para a categoria.'); return }

    setSaving(true)
    const payload = {
      profile_id: effectiveProfileId,
      name: name.trim(),
      kind,
      color,
      icon,
      parent_category_id: parentCategoryId || null,
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
        <h2>
          {isEdit ? 'Editar categoria' : parentIsLocked ? 'Nova subcategoria' : 'Nova categoria'}
        </h2>
        {parentIsLocked && (
          <p className="modal-context">
            Dentro de: <strong>{parent.icon} {parent.name}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit} className="transaction-form">
          <div className="kind-toggle">
            <button
              type="button"
              className={kind === 'despesa' ? 'kind-active kind-expense' : ''}
              onClick={() => setKind('despesa')}
              disabled={parentIsLocked}
            >
              Despesa
            </button>
            <button
              type="button"
              className={kind === 'receita' ? 'kind-active kind-income' : ''}
              onClick={() => setKind('receita')}
              disabled={parentIsLocked}
            >
              Receita
            </button>
          </div>

          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" required />
          </label>

          {!parentIsLocked && (
            <label>
              Categoria-pai (opcional)
              <select value={parentCategoryId} onChange={(e) => setParentCategoryId(e.target.value)}>
                <option value="">Nenhuma — categoria de nível principal</option>
                {possibleParents.map((p) => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
              {possibleParents.length === 0 && (
                <span className="field-hint">
                  Nenhuma categoria-pai disponível para {kind === 'despesa' ? 'despesas' : 'receitas'} neste perfil ainda.
                </span>
              )}
            </label>
          )}

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
