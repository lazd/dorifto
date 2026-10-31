#!/usr/bin/env bash
# Sets up the dorifto map data server as a systemd service on Ubuntu.
# Usage: deploy/setup.sh [DOMAIN]
#   Installs Caddy as an HTTPS reverse proxy for DOMAIN (default backroads.lazd.net)
#   with automatic certificates. Pass an empty string to skip Caddy.
# Env: PORT (default 8787). Re-run after moving the repo or upgrading Node.
set -euo pipefail

SERVICE=dorifto-map-data
PORT=${PORT:-8787}
DOMAIN=${1-backroads.lazd.net}
REPO=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)
RUN_AS=$(id -un)

if [[ $EUID -eq 0 ]]; then
  echo "Run as the user that owns the repo (sudo is used where needed)." >&2
  exit 1
fi
if ! "$NODE" --input-type=module -e "await import('node:sqlite')" 2>/dev/null; then
  echo "Node $("$NODE" --version) lacks node:sqlite; install Node >=22.13." >&2
  exit 1
fi

echo "Installing osmium-tool..."
sudo apt-get update -q
sudo apt-get install -y -q osmium-tool

echo "Installing npm dependencies..."
(cd "$REPO" && npm ci --omit=dev --no-audit --no-fund)
mkdir -p "$REPO/data-imports/geofabrik"

echo "Writing /etc/systemd/system/$SERVICE.service..."
sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<EOF
[Unit]
Description=Dorifto map data server
After=network-online.target
Wants=network-online.target
# Never give up restarting
StartLimitIntervalSec=0

[Service]
User=$RUN_AS
WorkingDirectory=$REPO
ExecStart=$NODE --disable-warning=ExperimentalWarning scripts/serve-map-data.mjs --all --port $PORT --max-coverage-misses 10000
Environment=NODE_ENV=production
Restart=always
RestartSec=5
SyslogIdentifier=$SERVICE
# Hardening: read-only filesystem except the map data directory
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$REPO/data-imports

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE"

if [[ -n $DOMAIN ]]; then
  echo "Installing Caddy for https://$DOMAIN..."
  if ! command -v caddy >/dev/null; then
    sudo apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
      sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt |
      sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update -q
    sudo apt-get install -y -q caddy
  fi
  sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
  sudo systemctl enable caddy
  sudo systemctl reload-or-restart caddy
fi

if [[ -n $(find "$REPO/data-imports/geofabrik" -name network.osm.pbf -print -quit) ]]; then
  sudo systemctl restart "$SERVICE"
  echo "Started $SERVICE. Logs: journalctl -u $SERVICE -f"
else
  echo "No regions imported yet; run deploy/download-regions.sh to download and start serving."
fi
