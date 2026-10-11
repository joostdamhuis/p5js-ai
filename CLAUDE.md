# p5.js AI Editor

Local Next.js app for live p5.js sketching, controlled by Claude through an MCP.

## Running it
Three parts, all must run:
- WebSocket hub, port 3001: `node websocket-bridge-server.js` (repo root)
- Editor, port 3000: `npm run dev -- -p 3000`
- MCP server, `p5js-mcp-server-ts/` (`npm run start`): started by the Claude app itself, connects to the hub

`start-p5.command` starts the hub and editor (it frees ports 3000-3002 first). After launch, click “Enable MCP” in the editor.
If the editor lands on 3001, something held port 3000: kill ports and restart.
`test-websocket-server.js` is a manual test tool, not the hub. It also binds 3001, so if MCP commands don't reach the editor, check `ps -p $(lsof -ti tcp:3001 -sTCP:LISTEN)`: it must be `websocket-bridge-server.js`, and the browser (Google/Safari) must show up in `lsof -iTCP:3001`.

## Structure
- `app/globals.css`: Tailwind v4 + shadcn color tokens; one file controls the whole theme
- `app/layout.tsx`: fonts (Space Grotesk UI, JetBrains Mono code) and dark mode on `<html>`
- `app/project/[id]/page.tsx`: the editor page layout (sidebar, code column, preview)
- `components/editor-ui/`: Editor.tsx (Monaco, the one in use), CodeEditor.tsx (older unused Monaco wrapper), Preview.tsx, CodePreview.tsx, Console.tsx, WebSocketListener.tsx
- `lib/monaco-theme.ts`: “studio” Monaco theme; hex values mirror the dark studio tokens

## Design so far
- Visual language uses DialKit's exact dark tokens: page #141414, panels #212121 (= --dial-glass-bg), menus #2a2a2a, borders 10% white, text 95% / secondary 60% white, fills 5% (rest) / 10% (hover) / 11% (active), 13px/500 type, 8px control radius, almost no divider lines. Amber (#f5a524) is the only accent: running dot, MCP-connected state, Run button, code keywords
- Layout: floating rounded `panel`s (custom `@utility panel` in globals.css: #212121, 12px radius, 10% white border) with 8px gaps on the near-black page. Header is borderless; editable project name lives there
- Preview should be fully black (sketch style.css is black; panel bg-white → bg-black)
- Code column is half width, capped at 400px (md:max-w-[400px]); preview takes the rest
- Code colors: amber keywords, warm sand strings, muted italic comments; Monaco bg matches panel (#212121)
- Icons are monochrome (no per-file-type colors); secondary actions appear on hover

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
