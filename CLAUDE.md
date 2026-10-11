# p5.js AI Editor

Local Next.js app for live p5.js sketching, controlled by Claude through an MCP.

## Running it
Three parts, all must run:
- WebSocket hub, port 3001: `node websocket-bridge-server.js` (repo root)
- Editor, port 3000: `npm run dev -- -p 3000`
- MCP server, `p5js-mcp-server-ts/` (`npm run start`): started by the Claude app itself, connects to the hub

`start-p5.command` starts the hub and editor (it frees ports 3000-3002 first). After launch, click “Enable MCP” in the editor.
If the editor lands on 3001, something held port 3000: kill ports and restart.
`test-websocket-server.js` is a manual test tool, not the hub.

## Structure
- `app/globals.css`: Tailwind v4 + shadcn color tokens; one file controls the whole theme
- `app/layout.tsx`: fonts (Space Grotesk UI, JetBrains Mono code) and dark mode on `<html>`
- `app/project/[id]/page.tsx`: the editor page layout (sidebar, code column, preview)
- `components/editor-ui/`: Editor.tsx (Monaco, the one in use), CodeEditor.tsx (older unused Monaco wrapper), Preview.tsx, CodePreview.tsx, Console.tsx, WebSocketListener.tsx
- `lib/monaco-theme.ts`: “studio” Monaco theme; hex values mirror the dark studio tokens

## Design so far
- “Dark studio” theme: deep blue-black, soft text, one warm amber accent (`.dark` override block at end of globals.css)
- Preview should be fully black (sketch style.css is black; panel bg-white → bg-black)
- Code column is half width, capped at 400px (md:max-w-[400px]); preview takes the rest
- Code colors: amber keywords, warm sand strings, muted italic comments

## Working style
- Joost also edits code manually; re-read files before editing
- In replies: no em dashes unless needed, curly quotes
