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

## Sketch dials (DialKit)
Sketches can declare live controls; the editor shows a DialKit panel (bottom right of the preview) and pushes values into the running sketch. Use this in sketches Joost asks for whenever there are values worth tweaking.
```js
const dial = dials({
  count: [40, 1, 200, 1],   // [default, min, max, step?] slider
  speed: 1.5,               // number: slider, range inferred
  color: '#f5a524',         // hex: color picker
  trails: true,             // boolean: toggle
  mode: { type: 'select', options: ['dots', 'lines'], default: 'dots' },
  reset: { type: 'action' },
  shape: { size: [24, 2, 80], _collapsed: true },  // folder
}, { onAction: (name) => { if (name === 'reset') background(0); } });
// read dial.count, dial.shape.size etc. inside draw(); call dials() once, top level
```
- Slider positions survive code edits (values are re-sent after each reload); defaults in code only apply to new controls
- Bridge: `dialsBridge` script in Preview.tsx (inside the iframe) ↔ SketchDials.tsx (useDialKit + DialRoot), via postMessage
- Panel only shows while the sketch calls dials(); hidden otherwise

## Git
- Remote: github.com/joostdamhuis/p5js-ai-editor (private). Forked from github.com/adilmoujahid/p5js-ai-editor, no upstream remote kept
- Claude commits; Joost pushes with GitHub Desktop (“Push origin”). The CLI has no GitHub credentials, so `git push`/`fetch` fail here

## Working style
- Joost also edits code manually; re-read files before editing
- In replies: no em dashes unless needed, curly quotes
