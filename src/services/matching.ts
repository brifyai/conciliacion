import { differenceInCalendarDays, parseISO } from 'date-fns'
import { compareTwoStrings } from 'string-similarity'
import type {
  EstadoTransaccion,
  MatchingConfig,
  Transaccion,
} from '@/types/conciliacion'
import { cuerpoRUT } from '@/lib/rut'

/** Configuración por defecto del matching. */
export const MATCHING_DEFAULT: MatchingConfig = {
  toleranciaMonto: 1, // ±$1 por redondeo
  // Un pago casi nunca ocurre el mismo día que la emisión del documento; en
  // Chile los plazos habituales van de 30 a 60 días. Como los libros suelen no
  // traer fecha de vencimiento, el matching usa la emisión y necesita una
  // ventana amplia para alcanzar los pagos reales. 60 días captura la mayoría
  // sin volverse indiscriminado (el desempate sigue priorizando RUT, glosa y
  // cercanía de fecha).
  toleranciaDias: 60,
  umbralSimilitud: 0.72,
}

/** Normaliza una glosa para comparación difusa. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Evaluacion {
  montoOK: boolean
  fechaOK: boolean
  rutOK: boolean
  rutConflicto: boolean
  similitud: number
  /** Días entre el pago y vencimiento, o emisión sólo si no hay vencimiento. */
  diffDias: number
}

/**
 * Montos con los que un documento contable puede calzar contra el banco: su
 * total y, si existen, cada pago parcial (cuotas P1..Pn / pago-abono). Todos
 * llevan el signo del movimiento (egreso negativo, ingreso positivo). Un pago
 * bancario que refleja sólo una cuota calza así con la factura completa.
 */
function montosCandidatos(t: Transaccion): number[] {
  const total = Math.round(t.monto)
  if (t.fuente !== 'contabilidad') return [total]
  const parciales = t.metadatos?.montos_pago
  if (!Array.isArray(parciales) || parciales.length === 0) return [total]
  const signo = Math.sign(t.monto) || 1
  const montos = new Set<number>([total])
  for (const p of parciales) {
    const n = Number(p)
    if (Number.isFinite(n) && n !== 0) montos.add(Math.round(signo * Math.abs(n)))
  }
  return [...montos]
}

/** Ambos lados usan el mismo convenio: ingreso positivo y egreso negativo. */
function montosCompatibles(
  banco: Transaccion,
  contab: Transaccion,
  tolerancia: number,
): boolean {
  if (banco.monto === 0) return false
  for (const cand of montosCandidatos(contab)) {
    if (cand === 0) continue
    if (Math.sign(banco.monto) !== Math.sign(cand)) continue
    if (Math.abs(banco.monto - cand) <= tolerancia) return true
  }
  return false
}

function evaluar(
  banco: Transaccion,
  contab: Transaccion,
  config: MatchingConfig,
): Evaluacion {
  const montoOK = montosCompatibles(banco, contab, config.toleranciaMonto)

  const fechaReferencia = contab.fechaVencimiento ?? contab.fecha
  const diffDias = Math.abs(
    differenceInCalendarDays(parseISO(banco.fecha), parseISO(fechaReferencia)),
  )
  const fechaOK = diffDias <= config.toleranciaDias

  const rutBanco = banco.rut ? cuerpoRUT(banco.rut) : ''
  const rutContab = contab.rut ? cuerpoRUT(contab.rut) : ''
  const ambosConRut = rutBanco !== '' && rutContab !== ''
  const rutOK = ambosConRut && rutBanco === rutContab
  const rutConflicto = ambosConRut && rutBanco !== rutContab

  const textoMatching = (t: Transaccion): string => normalizar([
    t.descripcion,
    t.contraparte,
    t.folio,
    t.documento,
    t.folioReferencia,
    t.tipoDoc,
  ].filter(Boolean).join(' '))
  const similitud = compareTwoStrings(
    textoMatching(banco),
    textoMatching(contab),
  )
  return { montoOK, fechaOK, rutOK, rutConflicto, similitud, diffDias }
}

/** Niveles de calidad de un par, de mayor a menor fuerza. */
const NIVEL = {
  exacto: 4, // monto + fecha + RUT → concilia
  fuerte: 3, // monto + fecha, descripción similar → concilia
  sugerido: 2, // monto + fecha, descripción distinta → concilia (menor confianza)
  soloMonto: 1, // solo monto (fuera de rango de fecha) → pendiente
  ninguno: 0,
} as const

interface Par {
  banco: Transaccion
  contab: Transaccion
  ev: Evaluacion
  nivel: number
  estado: EstadoTransaccion // estado a asignar si el par gana
  confianza: number | undefined
}

/**
 * Clasifica un par candidato en nivel de calidad y el estado que produciría.
 */
function clasificar(
  ev: Evaluacion,
  config: MatchingConfig,
): { nivel: number; estado: EstadoTransaccion; confianza: number | undefined } {
  if (!ev.montoOK || ev.rutConflicto) {
    return { nivel: NIVEL.ninguno, estado: 'no_conciliada', confianza: undefined }
  }
  if (ev.fechaOK && ev.rutOK) {
    return { nivel: NIVEL.exacto, estado: 'conciliada', confianza: Math.max(0.95, ev.similitud) }
  }
  if (ev.fechaOK) {
    // Monto y fecha compatibles bastan para conciliar automáticamente. La
    // similitud de glosa ya no decide el estado: sólo modula la confianza y el
    // orden de asignación (los pares con mejor glosa reclaman antes su
    // contraparte cuando hay varios candidatos con el mismo monto).
    if (ev.similitud >= config.umbralSimilitud) {
      return { nivel: NIVEL.fuerte, estado: 'conciliada', confianza: ev.similitud }
    }
    return { nivel: NIVEL.sugerido, estado: 'conciliada', confianza: Math.max(0.6, ev.similitud) }
  }
  return { nivel: NIVEL.soloMonto, estado: 'pendiente', confianza: undefined }
}

/**
 * Ejecuta la conciliación entre las transacciones del banco y la contabilidad.
 *
 * Algoritmo greedy global: evalúa TODOS los pares banco×contabilidad, los
 * ordena por calidad descendente (exacto > fuerte > sugerido) y los asigna
 * uno a uno, consumiendo cada banco y cada contabilidad una sola vez. Así,
 * cuando hay varias facturas y varios pagos idénticos del mismo proveedor
 * (duplicados), todos encuentran pareja en vez de solo el primero.
 *
 * Los pares de monto $0 se descartan: no son pagos reales y solo generan
 * ruido (0 siempre "coincide" con 0).
 *
 * @returns Nuevo arreglo con los estados y matchId actualizados.
 */
export function conciliar(
  transacciones: Transaccion[],
  config: MatchingConfig = MATCHING_DEFAULT,
): Transaccion[] {
  const resultado = transacciones.map((t): Transaccion => (
    // 'resuelta' es una decisión de clasificación (movimiento sin contraparte
    // explicado por su código): se preserva y queda fuera del emparejamiento.
    t.estado === 'resuelta'
      ? { ...t }
      : {
          ...t,
          estado: 'no_conciliada' as EstadoTransaccion,
          matchId: undefined,
          confianza: undefined,
        }
  ))

  const disponible = (t: Transaccion): boolean =>
    t.monto !== 0 && t.estado !== 'resuelta'
  const banco = resultado.filter((t) => t.fuente === 'banco' && disponible(t))
  const contab = resultado.filter((t) => t.fuente === 'contabilidad' && disponible(t))

  // Indexa por monto para no recorrer el producto cartesiano completo. Cada
  // documento se indexa bajo su total y bajo cada pago parcial, de modo que un
  // movimiento bancario que refleja una cuota también encuentre su factura.
  const contabPorMonto = new Map<number, Transaccion[]>()
  for (const c of contab) {
    for (const clave of montosCandidatos(c)) {
      const grupo = contabPorMonto.get(clave) ?? []
      grupo.push(c)
      contabPorMonto.set(clave, grupo)
    }
  }
  const candidatosMonto = (monto: number): Transaccion[] => {
    const vistos = new Set<string>()
    const candidatos: Transaccion[] = []
    const desde = Math.floor(monto - config.toleranciaMonto)
    const hasta = Math.ceil(monto + config.toleranciaMonto)
    for (let valor = desde; valor <= hasta; valor += 1) {
      for (const c of contabPorMonto.get(valor) ?? []) {
        if (vistos.has(c.id)) continue
        vistos.add(c.id)
        candidatos.push(c)
      }
    }
    return candidatos
  }

  // 1) Construir sólo pares con monto y signo compatibles.
  const pares: Par[] = []
  for (const b of banco) {
    for (const c of candidatosMonto(b.monto)) {
      const ev = evaluar(b, c, config)
      const { nivel, estado, confianza } = clasificar(ev, config)
      if (nivel === NIVEL.ninguno) continue // el monto no coincide
      if (nivel === NIVEL.soloMonto) continue // se trata después (pendiente)
      pares.push({ banco: b, contab: c, ev, nivel, estado, confianza })
    }
  }

  // 2) Ordenar: mejor nivel primero; a igual nivel, más similitud y menor
  //    diferencia de fecha ganan. Esto asegura que los matches exactos se
  //    resuelvan antes que los difusos, evitando que un match débil le robe
  //    la contraparte a uno fuerte.
  pares.sort((a, z) => {
    if (z.nivel !== a.nivel) return z.nivel - a.nivel
    if (z.ev.similitud !== a.ev.similitud) return z.ev.similitud - a.ev.similitud
    return a.ev.diffDias - z.ev.diffDias
  })

  // 3) Asignar greedy: cada banco y contabilidad se usa una sola vez.
  const bancoUsado = new Set<string>()
  const contabUsada = new Set<string>()
  for (const p of pares) {
    if (bancoUsado.has(p.banco.id) || contabUsada.has(p.contab.id)) continue
    p.banco.estado = p.estado
    p.banco.matchId = p.contab.id
    p.banco.confianza = p.confianza
    p.contab.estado = p.estado
    p.contab.matchId = p.banco.id
    p.contab.confianza = p.confianza
    bancoUsado.add(p.banco.id)
    contabUsada.add(p.contab.id)
  }

  // 4) Pagos sin pareja confirmada pero con un monto y signo compatibles
  //    quedan pendientes para revisión manual.
  for (const b of banco) {
    if (bancoUsado.has(b.id)) continue
    if (b.monto === 0) continue
    const hayPorMonto = candidatosMonto(b.monto).some(
      (c) => !contabUsada.has(c.id) && montosCompatibles(b, c, config.toleranciaMonto),
    )
    if (hayPorMonto) b.estado = 'pendiente'
  }

  return resultado
}

/** Calcula el monto total (absoluto) sin explicar (ni conciliado ni resuelto). */
export function montoNoConciliado(transacciones: Transaccion[]): number {
  return transacciones
    .filter((t) => t.estado !== 'conciliada' && t.estado !== 'resuelta')
    .reduce((acc, t) => acc + Math.abs(t.monto), 0)
}
