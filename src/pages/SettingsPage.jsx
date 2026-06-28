import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../contexts/ProfileContext'
import ProfilesPage from './ProfilesPage'
import AccessesPage from './AccessesPage'
import './SettingsPage.css'

const AVATAR_OPTIONS = ['🙂', '😎', '🧑‍💼', '👩‍💼', '🧔', '👨‍💻', '👩‍💻', '🦁', '🐯', '🐼', '🦊', '🐻']

export default function SettingsPage() {
  const { user } = useAuth()
  const { profiles } = useProfiles()
  const [activeTab, setActiveTab] = useState('dados')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [stateUf, setStateUf] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('🙂')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [resetProfileId, setResetProfileId] = useState('')
  const [resetOptions, setResetOptions] = useState({ accounts: false, cashflow: false, market: false })
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  useEffect(() => {
    loadProfile()
  }, [user?.id])

  const loadProfile = async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('user_preferences')
      .select('full_name, cpf, address, city, state, zip_code, avatar_emoji')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setFullName(data.full_name || '')
      setCpf(data.cpf || '')
      setAddress(data.address || '')
      setCity(data.city || '')
      setZipCode(data.zip_code || '')
      setStateUf(data.state || '')
      setAvatarEmoji(data.avatar_emoji || '🙂')
    }
    setLoading(false)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    const { error: err } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        full_name: fullName.trim() || null,
        cpf: cpf.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateUf.trim().toUpperCase() || null,
        zip_code: zipCode.trim() || null,
        avatar_emoji: avatarEmoji,
      })

    setSaving(false)
    if (err) setError(err.message)
    else setMessage('Dados salvos com sucesso.')
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (newPassword.length < 6) {
      setPasswordError('A senha precisa ter ao menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }

    setPasswordSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)

    if (err) {
      setPasswordError(err.message)
    } else {
      setPasswordMessage('Senha atualizada com sucesso.')
      setNewPassword('')
      setConfirmPassword('')
    }
  }


  const selectedResetProfile = profiles.find((p) => p.id === resetProfileId)
  const resetChoices = selectedResetProfile?.type === 'PF'
    ? [
        { key: 'accounts', label: 'Somente contas' },
        { key: 'cashflow', label: 'Somente dados do fluxo de caixa' },
        { key: 'market', label: 'Somente dados de mercado' },
      ]
    : [
        { key: 'accounts', label: 'Somente contas' },
        { key: 'cashflow', label: 'Somente dados do fluxo de caixa' },
      ]

  useEffect(() => {
    if (!resetProfileId && profiles.length > 0) setResetProfileId(profiles[0].id)
  }, [profiles, resetProfileId])

  useEffect(() => {
    if (selectedResetProfile?.type === 'PJ' && resetOptions.market) {
      setResetOptions((current) => ({ ...current, market: false }))
    }
  }, [selectedResetProfile?.type, resetOptions.market])

  const handleResetProfileData = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetMessage('')

    if (!resetProfileId) { setResetError('Selecione um perfil para resetar.'); return }
    const chosen = Object.entries(resetOptions).filter(([, enabled]) => enabled).map(([key]) => key)
    if (chosen.length === 0) { setResetError('Escolha ao menos um tipo de dado para resetar.'); return }

    const labels = resetChoices.filter((choice) => resetOptions[choice.key]).map((choice) => choice.label.toLowerCase()).join(', ')
    const ok = window.confirm(`Resetar ${labels} do perfil ${selectedResetProfile?.name}? Esta ação não pode ser desfeita e também resetará as categorias relacionadas.`)
    if (!ok) return

    setResetting(true)
    const errors = []
    const run = async (promise) => {
      const { error: err } = await promise
      if (err) errors.push(err.message)
    }

    if (resetOptions.cashflow) {
      await run(supabase.from('recurrences').delete().eq('profile_id', resetProfileId))
      await run(supabase.from('transactions').delete().eq('profile_id', resetProfileId))
      await run(supabase.from('financial_import_sessions').delete().eq('profile_id', resetProfileId))
    }

    if (resetOptions.market) {
      await run(supabase.from('mercado_items').delete().eq('profile_id', resetProfileId))
    }

    if (resetOptions.accounts) {
      await run(supabase.from('transactions').update({ account_id: null }).eq('profile_id', resetProfileId))
      await run(supabase.from('recurrences').update({ account_id: null }).eq('profile_id', resetProfileId))
      await run(supabase.from('accounts').delete().eq('profile_id', resetProfileId))
    }

    await run(supabase.from('transactions').update({ category_id: null }).eq('profile_id', resetProfileId))
    await run(supabase.from('recurrences').update({ category_id: null }).eq('profile_id', resetProfileId))
    await run(supabase.from('categories').delete().eq('profile_id', resetProfileId))

    setResetting(false)
    if (errors.length) setResetError([...new Set(errors)].join(' | '))
    else {
      setResetMessage('Dados do perfil resetados com sucesso.')
      setResetOptions({ accounts: false, cashflow: false, market: false })
    }
  }

  if (loading) {
    return <div className="empty-state">Carregando…</div>
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p className="dashboard-subtitle">Seus dados pessoais, preferências, perfis e acessos</p>
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Configurações">
        <button type="button" className={activeTab === 'dados' ? 'settings-tab-active' : ''} onClick={() => setActiveTab('dados')}>Configurações</button>
        <button type="button" className={activeTab === 'perfis' ? 'settings-tab-active' : ''} onClick={() => setActiveTab('perfis')}>Perfis</button>
        <button type="button" className={activeTab === 'acessos' ? 'settings-tab-active' : ''} onClick={() => setActiveTab('acessos')}>Acessos</button>
        <button type="button" className={activeTab === 'reset' ? 'settings-tab-active danger-tab' : ''} onClick={() => setActiveTab('reset')}>Resetar dados</button>
      </div>

      {activeTab === 'dados' && <div className="settings-grid">
        <form onSubmit={handleSaveProfile} className="settings-card transaction-form">
          <h2>Dados pessoais</h2>

          <label>
            Avatar
            <div className="avatar-picker">
              {AVATAR_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={'avatar-option' + (avatarEmoji === a ? ' avatar-option-active' : '')}
                  onClick={() => setAvatarEmoji(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </label>

          <label>
            Nome completo
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome completo" />
          </label>

          <label>
            CPF
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </label>

          <label>
            E-mail
            <input value={user?.email || ''} disabled title="O e-mail não pode ser alterado aqui" />
          </label>

          <label>
            Endereço completo
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, complemento" />
          </label>

          <div className="form-row form-row-three">
            <label>
              Cidade
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label>
              Estado
              <input value={stateUf} onChange={(e) => setStateUf(e.target.value.slice(0, 2).toUpperCase())} placeholder="UF" maxLength={2} />
            </label>
            <label>
              CEP
              <input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="00000-000" />
            </label>
          </div>

          {error && <p className="login-error">{error}</p>}
          {message && <p className="login-info">{message}</p>}

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </form>

        <div className="settings-card settings-shortcuts">
          <h2>Perfis e acessos</h2>
          <p className="settings-help">Gerencie os perfis financeiros e as permissões de acesso diretamente pelas configurações.</p>
          <div className="settings-shortcut-actions">
            <button type="button" className="btn-secondary" onClick={() => setActiveTab('perfis')}>
              <span aria-hidden="true">👥</span> Perfis
            </button>
            <button type="button" className="btn-secondary" onClick={() => setActiveTab('acessos')}>
              <span aria-hidden="true">🔐</span> Acessos
            </button>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="settings-card transaction-form">
          <h2>Alterar senha</h2>

          <label>
            Nova senha
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>

          <label>
            Confirmar nova senha
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>

          {passwordError && <p className="login-error">{passwordError}</p>}
          {passwordMessage && <p className="login-info">{passwordMessage}</p>}

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={passwordSaving}>
              {passwordSaving ? 'Atualizando…' : 'Atualizar senha'}
            </button>
          </div>
        </form>
      </div>}

      {activeTab === 'perfis' && <ProfilesPage />}
      {activeTab === 'acessos' && <AccessesPage />}
      {activeTab === 'reset' && (
        <form onSubmit={handleResetProfileData} className="settings-card transaction-form settings-reset-card">
          <h2>Resetar dados de perfil</h2>
          <p className="settings-help">Escolha o perfil e quais dados serão apagados. Ao resetar dados, as categorias do perfil também serão resetadas.</p>
          <label>
            Perfil
            <select value={resetProfileId} onChange={(e) => setResetProfileId(e.target.value)}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.icon} {profile.name} — {profile.type === 'PF' ? 'Pessoal' : 'Empresarial'}</option>)}
            </select>
          </label>
          <div className="reset-options">
            {resetChoices.map((choice) => (
              <label key={choice.key} className="reset-option">
                <input type="checkbox" checked={!!resetOptions[choice.key]} onChange={(e) => setResetOptions((current) => ({ ...current, [choice.key]: e.target.checked }))} />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
          {resetError && <p className="login-error">{resetError}</p>}
          {resetMessage && <p className="login-info">{resetMessage}</p>}
          <div className="modal-actions">
            <button type="submit" className="btn-secondary danger" disabled={resetting}>{resetting ? 'Resetando…' : 'Resetar dados selecionados'}</button>
          </div>
        </form>
      )}

    </div>
  )
}
