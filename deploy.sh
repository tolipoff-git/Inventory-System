#!/bin/bash
set -euo pipefail

# ============================================================================
# 5S Inventory System — Deploy Script
# ============================================================================

# Secrets are NOT stored in git. Required environment variables:
#   INVENTORY_KV_BINDING  — KV namespace id (wrangler kv namespace list)
#   ALLOWED_ORIGIN        — CORS allowlist for the PWA, e.g. https://inventory.pages.dev
#   SYNC_SECRET           — Bearer token for /api/sync (wrangler secret put SYNC_SECRET)
# Set them in your shell / CI before running this script:
#   export INVENTORY_KV_BINDING=<namespace-id>
#   export ALLOWED_ORIGIN=https://inventory.pages.dev
#   echo "$SYNC_SECRET" | npx wrangler secret put SYNC_SECRET

if [ -z "${INVENTORY_KV_BINDING:-}" ]; then
  echo "❌ INVENTORY_KV_BINDING is not set. Aborting." >&2
  exit 1
fi
if [ -z "${ALLOWED_ORIGIN:-}" ]; then
  echo "❌ ALLOWED_ORIGIN is not set. Aborting." >&2
  exit 1
fi

echo "🚀 Starting deployment of 5S Inventory System v98..."

# Step 1: Build the application
echo "📦 Building production bundle..."
./build.sh

# Step 2: Substitute secret placeholders into a temporary wrangler config
# (wrangler has no env interpolation for kv namespace ids, so we do it here —
# the committed wrangler.jsonc keeps only "$INVENTORY_KV_BINDING" placeholders).
# The temp file must stay inside the repo root so wrangler resolves the
# relative `main` and `assets.directory` paths correctly.
TMP_WRANGLER=".wrangler-subst.$$.jsonc"
sed -e "s|\$INVENTORY_KV_BINDING|${INVENTORY_KV_BINDING}|g" \
    -e "s|\$ALLOWED_ORIGIN|${ALLOWED_ORIGIN}|g" \
    wrangler.jsonc > "$TMP_WRANGLER"

# Step 3: Deploy to Cloudflare Workers with Wrangler
echo "☁️  Deploying to Cloudflare Workers..."
# Remove the temp config even when deploy fails (set -e exits on error).
trap 'rm -f "$TMP_WRANGLER"' EXIT
npx wrangler deploy --config "$TMP_WRANGLER"
trap - EXIT
rm -f "$TMP_WRANGLER"

# Step 4: Verify deployment
echo "✅ Deployment complete!"
echo ""
echo "📊 Application: 5S Inventory System"
echo "📋 Version: v98"
echo "🔗 URL: https://inventory-system.tolipoff.workers.dev"
echo ""
echo "💡 Run 'npm run deploy' or './deploy.sh' to redeploy"