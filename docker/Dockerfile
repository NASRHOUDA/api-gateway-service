# ---- Étape de build : installation des dépendances ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# ---- Étape finale : image d'exécution allégée ----
FROM node:22-alpine
WORKDIR /app

# Patch des paquets système Alpine (CVE niveau OS)
RUN apk update && apk upgrade --no-cache

# On copie uniquement le résultat du build (node_modules + code)
COPY --from=builder --chown=node:node /app ./

# On retire les outils npm/npx/corepack/yarn embarqués dans l'image de base
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-v* 2>/dev/null || true

USER node

EXPOSE 5000
CMD ["node", "app.js"]
