/**
 * Servidor de producción para el deploy en Docker/Coolify.
 *
 * Sirve el build estático de Vite (carpeta `dist/`) y mantiene vivas las rutas
 * `/api/*` que en Vercel eran funciones serverless y en desarrollo las atiende
 * el proxy de Vite. Así la app sigue funcionando igual (incluida la IA), y las
 * API keys del servidor (`OPENCODE_API_KEY`, `PDF_MODEL_API_KEY`) se leen en
 * runtime y NUNCA se incrustan en el bundle del navegador.
 */
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import opencode from './api/opencode.js'
import pdf from './api/pdf.js'
import ping from './api/ping.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const PORT = process.env.PORT || 3000

const app = express()

// Los payloads de IA (PDF/imágenes en base64) pueden ser grandes.
app.use(express.json({ limit: '50mb' }))

// Rutas de API (handlers estilo Vercel, compatibles con Express).
app.post('/api/opencode', (req, res) => opencode(req, res))
app.post('/api/pdf', (req, res) => pdf(req, res))
app.all('/api/ping', (req, res) => ping(req, res))

// Estáticos del build de Vite.
app.use(express.static(distDir))

// SPA fallback: cualquier ruta GET que no sea /api sirve index.html
// (React Router resuelve el resto en el cliente).
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Conciliación escuchando en el puerto ${PORT}`)
})
