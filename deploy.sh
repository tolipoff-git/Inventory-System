#!/bin/bash
# Manual redeploy helper for the 5S Inventory System Worker.
#
# Why: the normal release path is a push to `main`, where the Cloudflare Workers
# Git integration builds and deploys this repository. This script exists for an
# operator-initiated redeploy from a workstation; it mirrors exactly those steps.
#
# The v98 placeholder scheme ($INVENTORY_KV_BINDING / $ALLOWED_ORIGIN substituted
# into a temp config) is gone: namespace ids and ALLOWED_ORIGIN are committed
# configuration in wrangler.jsonc. Secrets never belong here — use
# `npx wrangler secret put <NAME>` if one is ever introduced.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")

echo "Starting deployment of 5S Inventory System v${VERSION}"

echo "Building production bundle..."
bash build.sh

echo "Deploying to Cloudflare Workers..."
npx wrangler deploy --config wrangler.jsonc

echo "Deployment complete — https://inventory-system.tolipoff.workers.dev"
