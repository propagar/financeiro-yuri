import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import { useAuth } from '../contexts/AuthContext'
import './ProfilesPage.css'

const PROFILE_COLORS = ['#6366f1', '#10b981', '#f97316', '#ec4899', '#0f5e56', '#a6432f', '#5b4ccb', '#b8862c']
const ROLE_LABELS = { owner: 'Proprietário', editor: 'Editor', viewer: 'Visualizador' }

export default function ProfilesPage() {
  const { profiles, reloadProfiles } = useProfiles()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [accessProfile, setAccessProfile] = useState(null)

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (p) => { setEditing(p); setShowForm(true) }

  const handleArchive = async (id) => {
    if (!window.confirm('Arquivar este perfil? Os dados não serão excluídos, mas o perfil deixará de aparecer no seletor.')) return
    await supabase.from('profiles').update({ is_active: false }).eq('id', id)
    reloadProfiles()
  }

  return (
    <div className="profiles-page">
      <div className="page-header">
        <div>
          <h1>Perfis e acessos</h1>
          <p className="dashboard-subtitle">Gerencie suas entidades (PF/PJ) e quem pode acessá-las</p>
        </div>
        <button className="btn-primary" onClick={openNew} type="button">+ Novo perfil</button>
      </div>

      <div className="profiles-list">
        {profiles.map((p) => (
          <div className="profile-row" key={p.id} style={{ borderLeftColor: p.color }}>
            <div className="profile-row-main">
              <span className="profile-row-icon">{p.icon}</span>
              <div>
                <h3>{p.name}</h3>
                <span className="profile-row-meta">
                  <span className="profile-row-type">{p.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                  {p.document && <span> · {p.document}</span>}
                </span>
              </div>
            </div>
            <div className="profile-row-actions">
              <button onClick={() => setAccessProfile(p)} type="button">Gerenciar acessos</button>
              <button onClick={() => openEdit(p)} type="button">Editar</button>
              <button onClick={() => handleArchive(p.id)} type="button" className="danger">Arquivar</button>
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

      {accessProfile && (
        <AccessManager
          profile={accessProfile}
          currentUserId={user?.id}
          onClose={() => setAccessProfile(null)}
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

function AccessManager({ profile, currentUserId, onClose }) {
  const [access, setAccess] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState('')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    loadAccess()
  }, [profile.id])

  const loadAccess = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profile_access')
      .select('*')
      .eq('profile_id', profile.id)
    setAccess(data ?? [])
    setLoading(false)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setError('Para convidar alguém, peça que essa pessoa crie uma conta no sistema primeiro — depois você poderá vincular o e-mail dela aqui.')
  }

  const handleRemove = async (id) => {
    await supabase.from('profile_access').delete().eq('id', id)
    loadAccess()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Acessos — {profile.icon} {profile.name}</h2>
        <p className="modal-context">Quem pode ver ou editar este perfil específico.</p>

        {loading ? (
          <div className="empty-state">Carregando…</div>
        ) : access.length === 0 ? (
          <p className="access-empty">Apenas você (proprietário do workspace) tem acesso a este perfil hoje.</p>
        ) : (
          <ul className="access-list">
            {access.map((a) => (
              <li key={a.id} className="access-item">
                <span>{a.user_id === currentUserId ? 'Você' : a.user_id}</span>
                <span className="access-role">{ROLE_LABELS[a.role]}</span>
                <button onClick={() => handleRemove(a.id)} type="button">Remover</button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleInvite} className="transaction-form" style={{ marginTop: 18 }}>
          <label>
            Convidar por e-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </label>
          <label>
            Nível de acesso
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Visualizador (só vê)</option>
              <option value="editor">Editor (vê e lança)</option>
              <option value="owner">Proprietário (controle total)</option>
            </select>
          </label>
          {error && <p className="login-info">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
            <button type="submit" className="btn-primary" disabled={inviting}>Convidar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
