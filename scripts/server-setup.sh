#!/usr/bin/env bash
# Configuration initiale (et idempotente) du VPS pour TocToc :
#   - dossier /srv/apps/toctoc
#   - rôle + base « toctoc » dans le conteneur Postgres partagé (réseau docker « infra »)
#   - fichier .env (mot de passe généré sur le serveur, jamais transmis)
#   - site Caddy toctoc.jibhey.fr → 127.0.0.1:4321 (HTTPS automatique)
# Usage : scripts/server-setup.sh   (relançable sans risque)
set -euo pipefail

SERVER=${SERVER:-jibhey.fr}
DOMAIN=${DOMAIN:-toctoc.jibhey.fr}
DEST=/srv/apps/toctoc
PORT=4321

ssh "$SERVER" DEST="$DEST" DOMAIN="$DOMAIN" PORT="$PORT" 'bash -s' <<'REMOTE'
set -euo pipefail

echo "→ dossier $DEST"
mkdir -p "$DEST"

echo "→ base de données"
docker network inspect infra >/dev/null
docker exec postgres pg_isready -U postgres >/dev/null
if [ ! -f "$DEST/.env" ]; then
  umask 077
  PASS=$(openssl rand -hex 24)
  docker exec -i postgres psql -U postgres -v ON_ERROR_STOP=1 -q -v pass="$PASS" <<'SQL'
SELECT format('CREATE ROLE toctoc LOGIN PASSWORD %L', :'pass')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'toctoc') \gexec
SELECT format('ALTER ROLE toctoc WITH LOGIN PASSWORD %L', :'pass') \gexec
SELECT 'CREATE DATABASE toctoc OWNER toctoc'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'toctoc') \gexec
REVOKE ALL ON DATABASE toctoc FROM PUBLIC;
SQL
  printf 'DATABASE_URL=postgres://toctoc:%s@postgres:5432/toctoc\n' "$PASS" > "$DEST/.env"
  chmod 600 "$DEST/.env"
  echo "  base « toctoc » prête, .env créé"
else
  echo "  .env déjà présent : identifiants conservés"
fi

echo "→ Caddy ($DOMAIN)"
SITE=/etc/caddy/sites/toctoc.caddy
TMP=$(mktemp)
# 'wasm-unsafe-eval' : nécessaire à PGlite (PostgreSQL compilé en WebAssembly).
cat > "$TMP" <<CADDY
$DOMAIN {
	import security
	header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
if ! sudo cmp -s "$TMP" "$SITE"; then
  BACKUP=$(mktemp)
  sudo cp "$SITE" "$BACKUP" 2>/dev/null || : > "$BACKUP"
  sudo install -m 644 "$TMP" "$SITE"
  if ! sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    # config invalide : on remet l'état précédent sans toucher au Caddy en service
    if [ -s "$BACKUP" ]; then sudo install -m 644 "$BACKUP" "$SITE"; else sudo rm -f "$SITE"; fi
    echo "  ✗ configuration Caddy invalide, rien n'a été rechargé" >&2
    exit 1
  fi
  rm -f "$BACKUP"
  sudo systemctl reload caddy
  echo "  site installé et Caddy rechargé"
else
  echo "  site déjà à jour"
fi
rm -f "$TMP"
REMOTE

echo "✓ serveur prêt — lancer ./deploy.sh"
