/**
 * Valida la forma básica de un correo. La restricción por dominio de marca se
 * eliminó: el sistema entra automáticamente con una cuenta de servicio y no se
 * limita el acceso a dominios corporativos específicos.
 */
export function esCorreoAutorizado(email: string): boolean {
  const [usuario, dominio] = email.trim().split('@')
  return !!usuario && !!dominio && dominio.includes('.')
}
