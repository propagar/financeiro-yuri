import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)

// activeProfileId === null  -> visão "Geral" (consolidada, todos os perfis)
export function ProfileProvider({ children }) {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfiles = useCallback(async () => {
    if (!user) {
      setProfiles([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('created_at', { ascending: true })

    if (!error) setProfiles(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  // Restaura último perfil visitado
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_preferences')
      .select('last_profile_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.last_profile_id) setActiveProfileId(data.last_profile_id)
      })
  }, [user])

  const selectProfile = async (profileId) => {
    setActiveProfileId(profileId)
    if (user) {
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        last_profile_id: profileId,
        updated_at: new Date().toISOString(),
      })
    }
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null

  const value = {
    profiles,
    loading,
    activeProfileId,
    activeProfile,
    isConsolidated: activeProfileId === null,
    selectProfile,
    reloadProfiles: loadProfiles,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfiles() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles precisa estar dentro de ProfileProvider')
  return ctx
}
