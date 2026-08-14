#!/bin/bash
set -e

APP_VERSION=$(grep -oP "APP_VERSION:\s*'([^']+)'" index.html | head -1 | sed -E "s/.*'([^']+)'.*/\1/")
if [ -z "$APP_VERSION" ]; then
  APP_VERSION="v0"
fi

GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")

NEW_VERSION="${APP_VERSION}-${GIT_HASH}"

sed -i -E "s/^const CACHE_VERSION = .*/const CACHE_VERSION = '${NEW_VERSION}';/" sw.js

echo "Updated sw.js CACHE_VERSION to: ${NEW_VERSION}"
