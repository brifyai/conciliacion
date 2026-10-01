import { useEffect } from 'react'
import { Box, LinearProgress, Stack } from '@mui/material'
import { Outlet, useSearchParams } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { supabase } from '@/lib/supabase'

/**
 * Puente SSO con el panel Brifii: el panel (origen confiable) envía la
 * sesión Supabase del usuario por postMessage y se adopta aquí, de modo
 * que cada usuario opere conciliaBK con su identidad de Brifii.
 */
function SsoBridge() {
  useEffect(() => {
    const ORIGEN_PANEL = 'https://brifii-servicios.aintelligence.cl'
    function aplicar(e: MessageEvent) {
      if (e.origin !== ORIGEN_PANEL) return
      const d = e.data as {
        type?: string
        access_token?: string
        refresh_token?: string
      }
      if (d?.type !== 'brifii-sesion' || !d.access_token || !d.refresh_token) {
        return
      }
      supabase.auth
        .setSession({
          access_token: d.access_token,
          refresh_token: d.refresh_token,
        })
        .then(() => window.location.reload())
    }
    window.addEventListener('message', aplicar)
    window.parent.postMessage({ type: 'concilia-listo' }, ORIGEN_PANEL)
    return () => window.removeEventListener('message', aplicar)
  }, [])
  return null
}

export function AppLayout() {
  const [searchParams] = useSearchParams()
  const embebido = searchParams.get('embed') === '1'
  const cargarDatos = useConciliacionStore((s) => s.cargarDatos)
  const cargando = useConciliacionStore((s) => s.cargando)
  const completandoCarga = useConciliacionStore((s) => s.completandoCarga)
  const errorSincronizacion = useConciliacionStore((s) => s.errorSincronizacion)
  const limpiarErrorSincronizacion = useConciliacionStore((s) => s.limpiarErrorSincronizacion)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  useEffect(() => {
    if (errorSincronizacion) {
      enqueueSnackbar(`Error de sincronización: ${errorSincronizacion}`, {
        variant: 'error',
        autoHideDuration: 6000,
      })
      limpiarErrorSincronizacion()
    }
  }, [errorSincronizacion, enqueueSnackbar, limpiarErrorSincronizacion])

  return (
    <Stack direction="row" sx={{ minHeight: '100vh' }}>
      <SsoBridge />
      {!embebido && <Sidebar />}
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        {!embebido && <Topbar />}
        {(cargando || completandoCarga) && (
          <LinearProgress
            aria-label="Cargando datos"
            sx={{ position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar + 1 }}
          />
        )}
        <Box
          component="main"
          sx={{
            flex: 1,
            px: { xs: 2, md: 3.5 },
            py: { xs: 2.5, md: 3.5 },
            maxWidth: 1400,
            width: '100%',
            mx: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Stack>
    </Stack>
  )
}
