import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import './SettingsPage.css'

const AVATAR_OPTIONS = ['🙂', '😎', '🧑‍💼', '👩‍💼', '🧔', '👨‍💻', '👩‍💻', '🦁', '🐯', '🐼', '🦊', '🐻']

export default function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('🙂')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    loadProfile()
  }, [user?.id])

  const loadProfile = async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('user_preferences')
      .select('full_name, cpf, address, city, zip_code, avatar_emoji')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setFullName(data.full_name || '')
      setCpf(data.cpf || '')
      setAddress(data.address || '')
      setCity(data.city || '')
      setZipCode(data.zip_code || '')
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

  if (loading) {
    return <div className="empty-state">Carregando…</div>
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p className="dashboard-subtitle">Seus dados pessoais e preferências de conta</p>
        </div>
      </div>

      <div className="settings-grid">
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

          <div className="form-row">
            <label>
              Cidade
              <input value={city} onChange={(e) => setCity(e.target.value)} />
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
      </div>
    </div>
  )
}
