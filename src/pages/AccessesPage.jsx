import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../contexts/ProfileContext'
import { useAuth } from '../contexts/AuthContext'
import './ProfilesPage.css'

const ROLE_LABELS = { owner: 'Proprietário', editor: 'Editor', viewer: 'Visualizador' }

export default function AccessesPage() {
  const { profiles } = useProfiles()
  const { user } = useAuth()
  const [accessProfile, setAccessProfile] = useState(null)

  return (
    <div className="profiles-page">
      <div className="page-header">
        <div>
          <h1>Acessos</h1>
          <p className="dashboard-subtitle">Quem pode ver ou editar cada um dos seus perfis</p>
        </div>
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
                </span>
              </div>
            </div>
            <div className="profile-row-actions">
              <button onClick={() => setAccessProfile(p)} type="button">Gerenciar acessos</button>
            </div>
          </div>
        ))}
      </div>

      <div className="info-box">
        <strong>Sobre o controle de acessos</strong>
        <p>
          Por padrão, só você (proprietário) acessa seus perfis. Você pode convidar outras
          pessoas para visualizar ou editar um perfil específico, com controle granular
          por nível de permissão.
        </p>
      </div>

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
