#!/bin/zsh
# Double-click to start the p5.js AI Editor: the editor (port 3000) and the hub
# (port 3001) in this one window. Claude's MCP server is started by the Claude
# app and connects on its own. Keep this window open; close it to stop.
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js isn't installed. Get it from https://nodejs.org, then double-click this again."
  read -k1 "?Press any key to close…"
  exit 1
fi

node scripts/studio.mjs
