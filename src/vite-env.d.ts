/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Ingreso automático con una cuenta de servicio. La app inicia sesión sola con
   * estas credenciales, sin mostrar pantalla de login. OJO: al compilar Vite,
   * quedan incrustadas en el bundle del navegador y son legibles por cualquiera
   * que abra la app; protege el acceso a la URL si el dato lo requiere.
   */
  readonly VITE_AUTH_EMAIL?: string
  readonly VITE_AUTH_PASSWORD?: string
  /**
   * Inspección con IA (OpenCode Zen). La API key NO va aquí: vive en
   * `OPENCODE_API_KEY` (sin prefijo VITE_) y sólo la lee el proxy del servidor
   * de desarrollo, para que no acabe en el bundle del navegador.
   */
  readonly VITE_OPENCODE_BASE_URL?: string
  readonly VITE_OPENCODE_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
