// Sube documentos de conciliación al Drive Brifii del usuario
// (edge function drive-concilia-upload — organizado por fecha:
//  Brifii/Conciliación/<YYYY-MM>/ y referencia en front_documents).
import { supabase } from '@/lib/supabase'

const EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-concilia-upload`

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('no pude leer el documento'))
    reader.readAsDataURL(blob)
  })
}

export async function subirDocumentoDrive(
  nombre: string,
  contenido: BlobPart,
  periodo?: string,
): Promise<{ file_id: string; link: string; carpeta: string }> {
  const { data: ses } = await supabase.auth.getSession()
  const token = ses.session?.access_token
  if (!token) throw new Error('sin sesión Brifii')
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido])
  const base64 = await blobABase64(blob)
  const res = await fetch(EDGE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nombre, base64, periodo }),
  })
  if (!res.ok) {
    const detalle = (await res.text()).slice(0, 140)
    throw new Error(`Drive: ${detalle || res.status}`)
  }
  return res.json()
}
