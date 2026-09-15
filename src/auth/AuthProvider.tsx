import { useEffect, useState, type ReactNode } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type User,
} from './authContext'
import { useConciliacionStore } from '@/store/useConciliacionStore'

// Credenciales de la cuenta de servicio para el ingreso automático. La app
// inicia sesión sola con estas variables, sin mostrar pantalla de login.
const AUTO_EMAIL = import.meta.env.VITE_AUTH_EMAIL
const AUTO_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD

function limpiarDatosDeSesion(): void {
  useConciliacionStore.setState({
    transacciones: [],
    reglas: [],
    codigos: [],
    inicializado: false,
    cargando: false,
    errorCarga: null,
    errorSincronizacion: null,
  })
}

function mapUsuario(usuario: SupabaseUser | null | undefined): User | null {
  if (!usuario) return null
  const metadata = usuario.user_metadata ?? {}
  const nombre = (metadata.name ?? metadata.full_name ?? '') as string
  return {
    id: usuario.id,
    email: usuario.email ?? '',
    name: nombre,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    let activo = true

    async function iniciarSesion(): Promise<void> {
      const { data } = await supabase.auth.getSession()
      if (!activo) return

      // Ya hay sesión persistida: se reutiliza.
      if (data.session?.user) {
        setState({ user: mapUsuario(data.session.user), loading: false })
        return
      }

      // Ingreso automático con la cuenta de servicio.
      if (AUTO_EMAIL && AUTO_PASSWORD) {
        const { data: ingreso, error } = await supabase.auth.signInWithPassword({
          email: AUTO_EMAIL,
          password: AUTO_PASSWORD,
        })
        if (!activo) return
        if (!error && ingreso.user) {
          setState({ user: mapUsuario(ingreso.user), loading: false })
          return
        }
        console.error('El ingreso automático falló:', error?.message)
      }

      setState({ user: null, loading: false })
    }

    iniciarSesion().catch((e) => {
      if (!activo) return
      console.error(e)
      setState({ user: null, loading: false })
    })

    // Mantiene el estado sincronizado ante refresh de token, logout u otras pestañas.
    const { data: listener } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!activo) return
      if (evento === 'SIGNED_OUT') {
        setState({ user: null, loading: false })
      } else if (session?.user) {
        setState({ user: mapUsuario(session.user), loading: false })
      }
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextValue = {
    ...state,
    async signIn(email, password) {
      limpiarDatosDeSesion()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      setState({ user: mapUsuario(data.user), loading: false })
    },
    async signOut() {
      await supabase.auth.signOut()
      limpiarDatosDeSesion()
      setState({ user: null, loading: false })
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
