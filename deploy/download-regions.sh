#!/usr/bin/env bash
# Downloads/refreshes Geofabrik regions, indexes them, then restarts the map data server.
# Usage: deploy/download-regions.sh [REGION ...]   (defaults to California)
# The running server keeps serving old data until the new indexes are ready.
set -euo pipefail

SERVICE=dorifto-map-data
REGIONS=("$@")
if ((!${#REGIONS[@]})); then
  REGIONS=(north-america/us/california)
fi
cd "$(dirname "$0")/.."

for region in "${REGIONS[@]}"; do
  echo "=== $region ==="
  node scripts/import-osm-region.mjs "$region"
done

echo "Building indexes..."
node --disable-warning=ExperimentalWarning scripts/serve-map-data.mjs --all --index-only

if [[ -f /etc/systemd/system/$SERVICE.service ]]; then
  sudo systemctl restart "$SERVICE"
  echo "Restarted $SERVICE. Logs: journalctl -u $SERVICE -f"
fi
