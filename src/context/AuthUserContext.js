import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const AuthUserContext = createContext({ user: null, initializing: true })

export function AuthUserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setUser(session?.user || null)
      setInitializing(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setUser(session?.user || null)
      setInitializing(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthUserContext.Provider value={{ user, initializing }}>
      {children}
    </AuthUserContext.Provider>
  )
}

export function useAuthUser() {
  return useContext(AuthUserContext)
}
