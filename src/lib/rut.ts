/**
 * Utilidades para el RUT chileno (Rol Único Tributario).
 * Implementa cálculo del dígito verificador mediante módulo 11.
 */

/** Limpia un RUT quitando puntos, espacios y guion. Devuelve solo dígitos + DV. */
export function limpiarRUT(rut: string): string {
  return (rut ?? '').toString().replace(/[^0-9kK]/g, '').toUpperCase()
}

/**
 * Calcula el dígito verificador de un cuerpo de RUT (sin DV) usando módulo 11.
 * @param cuerpo Solo los dígitos (sin dígito verificador).
 * @returns Dígito verificador: '0'..'9' o 'K'.
 */
export function calcularDV(cuerpo: string): string {
  let suma = 0
  let mul = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return '0'
  if (dv === 10) return 'K'
  return dv.toString()
}

/** Valida si un RUT es correcto (formato + dígito verificador). */
export function validarRUT(rut: string): boolean {
  const limpio = limpiarRUT(rut)
  if (limpio.length < 2) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return false
  return calcularDV(cuerpo) === dv
}

/**
 * Formatea un RUT al estilo chileno: "12.345.678-9".
 * Acepta entradas con o sin formato. No valida (solo formatea).
 */
export function formatRUT(rut: string): string {
  const limpio = limpiarRUT(rut)
  if (limpio.length < 2) return rut ?? ''
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dv = limpio.slice(-1)
  return `${cuerpo}-${dv}`
}

/** Devuelve solo el cuerpo del RUT (sin DV), útil para matching. */
export function cuerpoRUT(rut: string): string {
  return limpiarRUT(rut).slice(0, -1)
}
