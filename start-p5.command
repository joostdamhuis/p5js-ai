#!/bin/zsh
# Starts the p5.js AI Editor (port 3000) and the WebSocket hub (port 3001).
# The MCP server is started by the Claude app itself and connects to the hub.
EDITOR_DIR="$HOME/Documents/p5js-ai-editor"

# Free the ports so the hub gets 3001 and the editor gets 3000
for port in 3000 3001 3002; do
  pid=$(lsof -ti :$port); [ -n "$pid" ] && kill $pid 2>/dev/null
done
sleep 1

cd "$EDITOR_DIR"
[ -d node_modules ] || npm install

osascript -e "tell app \"Terminal\" to do script \"cd '$EDITOR_DIR' && node websocket-bridge-server.js\""
osascript -e "tell app \"Terminal\" to do script \"cd '$EDITOR_DIR' && npm run dev -- -p 3000\""

sleep 5
open "http://localhost:3000"
