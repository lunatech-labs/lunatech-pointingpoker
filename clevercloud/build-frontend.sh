#!/usr/bin/env bash
# Clever's CC_PRE_BUILD_HOOK and CI both run this before sbt, so the page is built before the server.
set -euo pipefail
# --no-audit drops the registry call that once stalled for npm's full 300s fetch-timeout.
npm ci --include=dev --prefer-offline --no-audit --no-fund --fetch-timeout=60000
npm run build
