import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import ConfirmDialog from '../components/ConfirmDialog'
import './ProfilesPage.css'

const PROFILE_COLORS = ['#6366f1', '#10b981', '#f97316', '#ec4899', '#0f5e56', '#a6432f', '#5b4ccb', '#b8862c']
const ROLE_LABELS = { owner: 'Proprietário', editor: 'Editor', viewer: 'Visualizador' }

export default function ProfilesPage() {
  const { profiles, reloadProfiles } = useProfiles()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (p) => { setEditing(p); setShowForm(true) }

  const handleArchiveConfirmed = async () => {
    if (!archiving) return
    await supabase.from('profiles').update({ is_active: false }).eq('id', archiving.id)
    setArchiving(null)
    reloadProfiles()
  }

  return (
    <div className="profiles-page">
      <div className="page-header">
        <div>
          <h1>Perfis</h1>
          <p className="dashboard-subtitle">Gerencie suas entidades (PF/PJ)</p>
        </div>
        <button className="btn-primary" onClick={openNew} type="button">+ Novo perfil</button>
      </div>

      <div className="profiles-list">
        {profiles.map((p) => (
          <div className="profile-row" key={p.id} style={{ borderLeftColor: p.color }}>
            <div className="profile-row-main">
              <span className="profile-row-icon">{p.icon}</span>
              <div className="profile-row-info">
                <h3>{p.name}</h3>
                <span className="profile-row-meta">
                  <span className="profile-row-type">{p.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                  {p.document && <span> · {p.document}</span>}
                </span>
              </div>
            </div>
            <div className="profile-row-actions">
              <button onClick={() => openEdit(p)} type="button">Editar</button>
              <button onClick={() => setArchiving(p)} type="button" className="danger">Arquivar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="info-box">
        <strong>Como funciona a visão "Geral"</strong>
        <p>
          Ao não selecionar nenhum perfil específico no menu superior, você vê os dados
          consolidados de todos os seus perfis juntos — útil para ter uma visão completa
          das suas finanças, pessoal e empresarial.
        </p>
      </div>

      {showForm && (
        <ProfileForm
          profile={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reloadProfiles() }}
        />
      )}

      {archiving && (
        <ConfirmDialog
          title="Arquivar perfil?"
          message="Os dados não serão excluídos, mas o perfil deixará de aparecer no seletor."
          confirmLabel="Arquivar"
          preview={[
            { label: 'Perfil', value: `${archiving.icon} ${archiving.name}` },
            { label: 'Tipo', value: archiving.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica' },
          ]}
          onConfirm={handleArchiveConfirmed}
          onCancel={() => setArchiving(null)}
        />
      )}
    </div>
  )
}

function ProfileForm({ profile, onClose, onSaved }) {
  const isEdit = !!profile
  const [name, setName] = useState(profile?.name || '')
  const [type, setType] = useState(profile?.type || 'PJ')
  const [document, setDocument] = useState(profile?.document || '')
  const [color, setColor] = useState(profile?.color || PROFILE_COLORS[0])
  const [icon, setIcon] = useState(profile?.icon || '🏢')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Dê um nome para o perfil.'); return }

    setSaving(true)

    if (isEdit) {
      const { error: err } = await supabase
        .from('profiles')
        .update({ name: name.trim(), type, document: document.trim() || null, color, icon })
        .eq('id', profile.id)
      setSaving(false)
      if (err) { setError(err.message); return }
      onSaved()
      return
    }

    const { data: wsUser, error: wsErr } = await supabase
      .from('workspace_users')
      .select('workspace_id')
      .limit(1)
      .single()

    if (wsErr || !wsUser) {
      setSaving(false)
      setError('Não foi possível identificar seu workspace.')
      return
    }

    const { error: err } = await supabase.from('profiles').insert({
      workspace_id: wsUser.workspace_id,
      name: name.trim(),
      type,
      document: document.trim() || null,
      color,
      icon,
    })

    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Editar perfil' : 'Novo perfil'}</h2>
        <form onSubmit={handleSubmit} className="transaction-form">
          <div className="kind-toggle">
            <button type="button" className={type === 'PF' ? 'kind-active' : ''} style={type === 'PF' ? { borderColor: 'var(--color-pf)', background: 'var(--color-pf-soft)', color: 'var(--color-pf)' } : {}} onClick={() => setType('PF')}>Pessoa Física</button>
            <button type="button" className={type === 'PJ' ? 'kind-active' : ''} style={type === 'PJ' ? { borderColor: 'var(--color-pj)', background: 'var(--color-pj-soft)', color: 'var(--color-pj)' } : {}} onClick={() => setType('PJ')}>Pessoa Jurídica</button>
          </div>

          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'PF' ? 'Ex: Yuri Welter' : 'Ex: Propagar'} required />
          </label>

          <label>
            {type === 'PF' ? 'CPF (opcional)' : 'CNPJ (opcional)'}
            <input value={document} onChange={(e) => setDocument(e.target.value)} />
          </label>

          <label>
            Cor de identificação
            <div className="color-picker">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={'color-option' + (color === c ? ' color-option-active' : '')}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
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
