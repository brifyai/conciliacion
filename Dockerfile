# syntax=docker/dockerfile:1

# ============================================================
# 1) BUILD — compila el frontend con Vite
# ============================================================
FROM node:22-slim AS build
WORKDIR /app

# ⚠️ Las variables VITE_* se INCRUSTAN en el bundle en tiempo de build.
#    En Coolify hay que marcarlas como "Build Variable" (build-time), no solo
#    como runtime, o el bundle saldrá sin ellas.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_AUTH_EMAIL
ARG VITE_AUTH_PASSWORD
ARG VITE_OPENCODE_MODEL
ARG VITE_OPENCODE_BASE_URL
ARG VITE_MODELO_PDF
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AUTH_EMAIL=$VITE_AUTH_EMAIL \
    VITE_AUTH_PASSWORD=$VITE_AUTH_PASSWORD \
    VITE_OPENCODE_MODEL=$VITE_OPENCODE_MODEL \
    VITE_OPENCODE_BASE_URL=$VITE_OPENCODE_BASE_URL \
    VITE_MODELO_PDF=$VITE_MODELO_PDF

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ============================================================
# 2) RUNTIME — sirve el build + rutas /api con Node/Express
# ============================================================
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Las keys de servidor (OPENCODE_API_KEY, PDF_MODEL_API_KEY, etc.) se inyectan
# como variables de runtime en Coolify; NO van en la imagen.

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY api ./api
COPY server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
