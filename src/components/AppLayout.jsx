import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useProfiles } from '../contexts/ProfileContext'
import { useTransactionModal } from '../contexts/TransactionModalContext'
import { useState, useEffect } from 'react'
import './AppLayout.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/contas', label: 'Contas', icon: '🏦' },
  { to: '/categorias', label: 'Categorias', icon: '🏷️' },
]


export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { profiles, activeProfileId, activeProfile, isConsolidated, selectProfile } = useProfiles()
  const { openNew } = useTransactionModal()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleNavClick = () => setMobileOpen(false)

  // Fecha o drawer mobile automaticamente ao trocar de rota (clique em link)
  useEffect(() => {
    const close = () => setMobileOpen(false)
    window.addEventListener('popstate', close)
    return () => window.removeEventListener('popstate', close)
  }, [])


  return (
    <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={'app-sidebar' + (mobileOpen ? ' sidebar-mobile-open' : '')}>
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
              onClick={handleNavClick}
              className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item-active' : '')}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="theme-toggle" onClick={toggleTheme} type="button">
            <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="nav-label">{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
          </button>

          <div className="user-menu">
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)} type="button">
              <span className="user-avatar">{(user?.email?.[0] || '?').toUpperCase()}</span>
              <span className="user-email">{user?.email}</span>
            </button>
            {menuOpen && (
              <div className="user-dropdown">
                <button onClick={() => { setMenuOpen(false); navigate('/perfis') }} type="button">
                  <span aria-hidden="true">👥</span> Perfis
                </button>
                <button onClick={() => { setMenuOpen(false); navigate('/acessos') }} type="button">
                  <span aria-hidden="true">🔐</span> Acessos
                </button>
                <button onClick={() => { setMenuOpen(false); navigate('/configuracoes') }} type="button">
                  <span aria-hidden="true">⚙️</span> Configurações
                </button>
                <div className="user-dropdown-divider" />
                <button onClick={handleSignOut} type="button" className="danger">
                  <span aria-hidden="true">🚪</span> Sair
                </button>
              </div>
            )}
          </div>

          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            type="button"
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <span aria-hidden="true">{sidebarCollapsed ? '»' : '«'}</span>
            <span className="nav-label">Recolher menu</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
            type="button"
            aria-label="Abrir menu"
          >
            ☰
          </button>

          <div className="topbar-context">
            {isConsolidated ? (
              <>
                <span className="context-dot context-dot-all" />
                <span className="context-label">Visão geral — todos os perfis</span>
                <span className="context-label-short">Geral</span>
              </>
            ) : (
              <>
                <span
                  className="context-dot"
                  style={{ background: activeProfile?.color }}
                />
                <span className="context-label">{activeProfile?.icon} {activeProfile?.name}</span>
                <span className="context-label-short">{activeProfile?.icon}</span>
                <span className="context-type">{activeProfile?.type}</span>
              </>
            )}
          </div>

          <button className="btn-primary topbar-new-btn" onClick={openNew} type="button">
            <span className="topbar-new-btn-icon">+</span>
            <span className="topbar-new-btn-label">Novo lançamento</span>
          </button>
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
            <span className="nav-label">Visão geral</span>
          </>
        ) : (
          <>
            <span className="profile-trigger-icon">{active?.icon}</span>
            <span className="nav-label">{active?.name}</span>
          </>
        )}
        <span className="profile-trigger-caret nav-label">▾</span>
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
