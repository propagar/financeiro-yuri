import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useProfiles } from '../contexts/ProfileContext'
import { useState } from 'react'
import './AppLayout.css'

const NAV_ITEMS = [
  { to: '/', label: 'Painel', icon: '📊', end: true },
  { to: '/lancamentos', label: 'Lançamentos', icon: '📋' },
  { to: '/recorrencias', label: 'Recorrências', icon: '🔁' },
  { to: '/contas', label: 'Contas', icon: '🏦' },
  { to: '/categorias', label: 'Categorias', icon: '🏷️' },
  { to: '/perfis', label: 'Perfis e acessos', icon: '👥' },
]

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { profiles, activeProfileId, activeProfile, isConsolidated, selectProfile } = useProfiles()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-mark">＄</span>
            <span className="sidebar-title">Financeiro</span>
          </div>

          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfileId}
            isConsolidated={isConsolidated}
            onSelect={selectProfile}
          />
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item-active' : '')}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="theme-toggle" onClick={toggleTheme} type="button">
            <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>

          <div className="user-menu">
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)} type="button">
              <span className="user-avatar">{(user?.email?.[0] || '?').toUpperCase()}</span>
              <span className="user-email">{user?.email}</span>
            </button>
            {menuOpen && (
              <div className="user-dropdown">
                <button onClick={handleSignOut} type="button">Sair</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="topbar-context">
            {isConsolidated ? (
              <>
                <span className="context-dot context-dot-all" />
                Visão geral — todos os perfis
              </>
            ) : (
              <>
                <span
                  className="context-dot"
                  style={{ background: activeProfile?.color }}
                />
                {activeProfile?.icon} {activeProfile?.name}
                <span className="context-type">{activeProfile?.type}</span>
              </>
            )}
          </div>
        </header>

        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function ProfileSwitcher({ profiles, activeProfileId, isConsolidated, onSelect }) {
  const [open, setOpen] = useState(false)
  const active = profiles.find((p) => p.id === activeProfileId)

  return (
    <div className="profile-switcher">
      <button className="profile-trigger" onClick={() => setOpen((v) => !v)} type="button">
        {isConsolidated ? (
          <>
            <span className="profile-trigger-icon">🌐</span>
            <span>Visão geral</span>
          </>
        ) : (
          <>
            <span className="profile-trigger-icon">{active?.icon}</span>
            <span>{active?.name}</span>
          </>
        )}
        <span className="profile-trigger-caret">▾</span>
      </button>

      {open && (
        <div className="profile-dropdown">
          <button
            className={'profile-option' + (isConsolidated ? ' profile-option-active' : '')}
            onClick={() => { onSelect(null); setOpen(false) }}
            type="button"
          >
            <span className="profile-option-icon">🌐</span>
            Visão geral
            <span className="profile-option-tag">Tudo</span>
          </button>

          <div className="profile-dropdown-divider" />

          {profiles.map((p) => (
            <button
              key={p.id}
              className={'profile-option' + (p.id === activeProfileId ? ' profile-option-active' : '')}
              onClick={() => { onSelect(p.id); setOpen(false) }}
              type="button"
            >
              <span className="profile-option-icon">{p.icon}</span>
              {p.name}
              <span
                className="profile-option-tag"
                style={{ background: p.type === 'PF' ? 'var(--color-pf-soft)' : 'var(--color-pj-soft)', color: p.type === 'PF' ? 'var(--color-pf)' : 'var(--color-pj)' }}
              >
                {p.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
