#!/bin/bash
set -e

# ============================================================================
# 5S Inventory System — Deploy Script
# ============================================================================

echo "🚀 Starting deployment of 5S Inventory System v98..."

# Step 1: Build the application
echo "📦 Building production bundle..."
./build.sh

# Step 2: Deploy to Cloudflare Workers with Wrangler
echo "☁️  Deploying to Cloudflare Workers..."
npx wrangler deploy

# Step 3: Verify deployment
echo "✅ Deployment complete!"
echo ""
echo "📊 Application: 5S Inventory System"
echo "📋 Version: v98"
echo "🔗 URL: https://inventory-system.tolipoff.workers.dev"
echo ""
echo "💡 Run 'npm run deploy' or './deploy.sh' to redeploy"
