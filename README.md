# Conciliación Bancaria (Brifii)

SPA de conciliación bancaria orientada al mercado chileno. Frontend en React +
Vite + MUI, con **Supabase** (PostgreSQL + PostgREST + Auth) como backend.

> **Nota para agentes/devs nuevos:** este README es la fuente de verdad del
> estado actual del proyecto. El archivo `AGENTS.md` de la raíz es **boilerplate
> obsoleto de InsForge** y NO refleja este proyecto (el backend real es
> Supabase, no InsForge). Ignóralo salvo que se migre a InsForge.

---

## Stack

- **Frontend:** React 18, Vite, TypeScript, MUI, Zustand, React Query, React Router.
- **Backend:** Supabase self-hosted en `https://brifii-data.aintelligence.cl`
  (Postgres + PostgREST + GoTrue Auth), desplegado en un VPS con **Coolify**.
- **IA (opcional):** proxy a OpenCode Zen para inspección/clasificación y PDF→Excel
  (la key vive server-side en el proxy de Vite, sin prefijo `VITE_`).

---

## Correr en local

Requisitos: **Node 20.19+ o 22.12+** (Vite 8).

```bash
npm install
npm run dev        # http://localhost:5173
```

Otros scripts: `npm run build`, `npm run preview`, `npm test`, `npm run lint`.

---

## Variables de entorno (`.env`)

```dotenv
VITE_SUPABASE_URL=https://brifii-data.aintelligence.cl
VITE_SUPABASE_ANON_KEY=<anon/publishable key de brifii-data>

# Ingreso automático (cuenta de servicio) — ver sección Autenticación.
VITE_AUTH_EMAIL=brifyaimaster@gmail.com
VITE_AUTH_PASSWORD=<clave de la cuenta de servicio>

# IA opcional (sin prefijo VITE_ = se queda en el servidor de dev).
OPENCODE_API_KEY=<...>
OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1
VITE_OPENCODE_MODEL=qwen3.7-max
```

La **anon key** se saca en Coolify → servicio Supabase → Environment Variables,
o en Studio → Settings → API. La **clave de Postgres NO la usa el frontend**
(solo sirve para migraciones/psql).

---

## Autenticación — Auto-login (sin pantalla de login)

La app **inicia sesión sola** con una cuenta de servicio; el usuario no ve
pantalla de login. Implementado en [`src/auth/AuthProvider.tsx`](src/auth/AuthProvider.tsx):

1. Al cargar, reutiliza la sesión persistida si existe.
2. Si no hay sesión, hace `signInWithPassword` con `VITE_AUTH_EMAIL` /
   `VITE_AUTH_PASSWORD`.
3. Si el auto-login falla, cae al login manual en `/login` (respaldo).

El resto de la app sigue detrás de `ProtectedRoute`, así que **siempre opera con
una sesión real** → el RLS y el modelo multi-organización funcionan igual.

> ⚠️ **Seguridad:** al ser un frontend Vite, `VITE_AUTH_EMAIL/PASSWORD` quedan
> incrustados en el bundle y son legibles por cualquiera que abra la app. En la
> práctica, **quien pueda abrir la URL entra como esa cuenta**. Protege el
> acceso a la URL (red/proxy) si el dato lo requiere.

La restricción de dominio de correo de la marca anterior fue **eliminada** (ver
Rebrand). [`src/auth/authHelpers.ts`](src/auth/authHelpers.ts) ahora solo valida
la forma del correo.

---

## Backend Supabase — modelo de datos

Multi-tenant por **organización**. Cada tabla de negocio lleva `organization_id`
y el acceso se resuelve con la sesión del usuario.

**Tablas (schema `public`):**
`organizations`, `organization_members`, `transacciones`, `reglas`, `codigos`,
`bancos`, `importaciones`, `importacion_pendientes`, `importacion_chunks`,
`sync_operaciones`, `sync_chunks`.

**Funciones/RPC clave:** `current_organization_id()`, `is_organization_member()`,
importación por lotes (`begin_importacion` / `upload_importacion_chunk` /
`finalize_importacion`), sincronización (`sync_transacciones`,
`begin/upload/finalize_sync_transacciones`) y `clear_transacciones`.

**RLS:** cada tabla filtra por `is_organization_member(organization_id)`, que a su
vez usa `auth.uid()`. Sin sesión válida → `auth.uid()` es NULL → todo devuelve
vacío. Por eso **no se puede quitar el login del todo** sin reescribir RLS+RPC.

Definición canónica del esquema:
- [`supabase/schemas/01_core.sql`](supabase/schemas/01_core.sql) — tablas.
- [`supabase/schemas/02_functions.sql`](supabase/schemas/02_functions.sql) — funciones/RPC/triggers.
- [`supabase/schemas/03_rls.sql`](supabase/schemas/03_rls.sql) — RLS y permisos.
- [`supabase/migrations/`](supabase/migrations) — historial de migraciones.

---

## Poner en marcha una Supabase nueva (o completar una a medias)

1. **Aplicar el esquema** en orden: `01_core.sql` → `02_functions.sql` →
   `03_rls.sql`.
2. **Crear la cuenta de servicio** en Auth (Studio → Authentication → Add user,
   con *Auto Confirm*) con el email/clave de `VITE_AUTH_EMAIL/PASSWORD`.
3. **Crear la organización e inscribir al usuario** como `admin`.

Scripts listos para Studio → SQL Editor:
- [`supabase/rebuild-tables.sql`](supabase/rebuild-tables.sql) — borra (si están
  vacías) y recrea las 11 tablas con los tipos correctos (`uuid`). Úsalo cuando la
  instancia tiene tablas con tipos inconsistentes (ver problema conocido).
- [`supabase/setup-brifii.sql`](supabase/setup-brifii.sql) — funciones + RLS +
  organización + alta del usuario de servicio (idempotente). Correr **después**
  de tener las tablas.

> En `brifii-data` (Sept 2026) las tablas venían con ids en `text` en vez de
> `uuid`; se resolvió corriendo `rebuild-tables.sql` y luego `setup-brifii.sql`.
> La app quedó operativa (auto-login + RLS + organización funcionando).

### ⚠️ Problema conocido: `user_id`/ids como `text` en vez de `uuid`

Si al aplicar las funciones aparece:

```
ERROR: 42883: operator does not exist: text = uuid  (where om.user_id = auth.uid())
```

significa que las tablas de esa instancia se crearon con ids de **texto** en
lugar de **uuid** (no coinciden con `01_core.sql`; suele pasar si se crearon con
otra herramienta). Diagnóstico:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and (column_name in ('user_id','created_by')
       or (table_name='organizations' and column_name='id')
       or (table_name='transacciones' and column_name='organization_id'))
order by table_name, column_name;
```

Con las tablas vacías, arreglar es seguro: o `alter table ... alter column ...
type uuid using col::uuid`, o recrear esas tablas desde `01_core.sql`.

### ⚠️ Base de datos compartida

`brifii-data` la usan varios servicios. Antes de aplicar migraciones:
- Revisa colisiones de nombres genéricos (`organizations`, `organization_members`).
- `enable row level security` sobre estas tablas cambia el acceso para cualquier
  otro servicio que las lea directo (es reversible con `disable`).
- El `setup-brifii.sql` **no** instala el trigger de auto-inscripción en
  `auth.users` a propósito, para no afectar a otros servicios de la instancia.

---

## Rebrand: Origen → Brifii

Se eliminó la marca anterior ("Origen"). El único rastro real eran las
restricciones de dominio de correo (`origencomunicaciones.cl`, `origenmedios.cl`)
en [`authHelpers.ts`](src/auth/authHelpers.ts),
[`LoginPage.tsx`](src/features/auth/LoginPage.tsx) y
[`scripts/create-user.mjs`](scripts/create-user.mjs), ya removidas. El resto de
apariciones de "origen" en el código son la palabra común (fuente/`codigo_origen`)
y **son lógica de negocio, no marca**.

---

## Deploy en Docker / Coolify

El proyecto se despliega como **un contenedor Node** que sirve el build de Vite
y mantiene las rutas `/api/*` (proxy de IA, con las keys solo en el servidor).

Archivos:
- [`Dockerfile`](Dockerfile) — build multi-stage (compila con Vite → sirve con Node).
- [`server.js`](server.js) — Express: estáticos de `dist/` + `/api/opencode`,
  `/api/pdf`, `/api/ping`. Escucha en `PORT` (default 3000).
- [`.dockerignore`](.dockerignore).

### Variables en Coolify (¡importante!)

- **Build-time** (marcar como *Build Variable*): las `VITE_*` se **incrustan en
  el bundle** durante `vite build`, así que deben estar disponibles al construir:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_EMAIL`,
  `VITE_AUTH_PASSWORD`, `VITE_OPENCODE_MODEL`, `VITE_MODELO_PDF`.
- **Runtime** (solo servidor, NO en el bundle): `OPENCODE_API_KEY`,
  `OPENCODE_BASE_URL`, `PDF_MODEL_API_KEY`, `PDF_MODEL_BASE_URL`, `PORT`.

### Pasos en Coolify
1. New Resource → Application → desde el repo git (build pack: **Dockerfile**).
2. Cargar las variables (build-time y runtime según lo anterior).
3. Puerto expuesto: **3000**. Asignar el dominio.
4. Deploy. En cada `git push` Coolify reconstruye.

> Recordatorio de seguridad: `VITE_AUTH_*` y la anon key quedan en el bundle
> público (inevitable en un frontend). Si la app no debe ser pública, ponla
> detrás de acceso restringido.

## Pendiente

- (nada crítico) Slim de la imagen runtime y code-splitting de chunks grandes.
