# p5.js AI Editor

Local Next.js app for live p5.js sketching, controlled by Claude through an MCP.

## Running it
- Double-click `start-p5.command` (or `npm run studio`): runs `scripts/studio.mjs`, which builds the MCP server if needed, stops old editor/hub processes from this repo on 3000/3001 (refuses to touch other apps), starts hub + editor in one window, restarts them if they crash, and opens the browser
- Hub: `websocket-bridge-server.js`, always port 3001 (no fallback ports). Clients `identify` as 'editor' or 'claude'; hub broadcasts `hubStatus` {editors, claude}; GET http://localhost:3001 returns the same JSON
- MCP server (`p5js-mcp-server-ts/`, built to dist/) is started by the Claude app (claude_desktop_config.json → dist/index.js). Reconnects forever. After rebuilding it, the Claude app must be restarted to load the new build
- Editor: Claude/MCP is on by default (`p5_mcp` in localStorage remembers "off"). Header pill shows Claude connected / Waiting for Claude / Hub offline; clicking it opens a checklist with fixes (ConnectionStatus.tsx)

## Structure
- `app/globals.css`: Tailwind v4 + shadcn color tokens; one file controls the whole theme
- `app/layout.tsx`: fonts (system font / SF Pro for UI, Geist Mono 13px/500 for code; both match DialKit) and dark mode on `<html>`
- `app/project/[id]/page.tsx`: the editor page layout (sidebar, code column, preview)
- `components/editor-ui/`: Editor.tsx (Monaco), Preview.tsx (sketch iframe + bridge), SketchControls.tsx, Console.tsx, WebSocketListener.tsx, ConnectionStatus.tsx, ResizeHandle.tsx
- `lib/monaco-theme.ts`: “studio” Monaco theme; hex values mirror the dark studio tokens

## Design so far
- Visual language uses DialKit's exact dark tokens: page #141414, panels #212121 (= --dial-glass-bg), menus #2a2a2a, borders 10% white, text 95% / secondary 60% white, fills 5% (rest) / 10% (hover) / 11% (active), 13px/500 type, 8px control radius, almost no divider lines. White is the accent, as in DialKit (primary = #fff on #212121 text): Run and New buttons. Status dots are emerald (sketch running, MCP connected). No amber
- Layout: floating rounded `panel`s (custom `@utility panel` in globals.css: #212121, 12px radius, 10% white border) with 8px gaps on the near-black page. Header is borderless; editable project name lives there
- Preview should be fully black (sketch style.css is black; panel bg-white → bg-black)
- Two layouts (saved as `layout` in `p5_layout`); `dock` is the default. `dock`: canvas fills the window; Code, Console, Controls float as translucent panels. Pill dock, bottom centre: Code and Controls toggles | round Run/Stop | Export menu (PNG, Video submenu, Copy for Framer, Size submenu; red timer while recording, rendered by Preview via `toolbarTarget` portal) | Save icon | More (Console, Fonts submenu, New sketch, Columns layout). Both layouts render the same panel pieces from page.tsx
- No Files panel (removed). Fonts live in the "Aa" menu (FontsMenu.tsx) in the dock / top bar
- Columns layout: code (400px) | preview (flex) | Controls (280px); resizable via `ResizeHandle` in the 8px gaps (double-click resets), sizes kept in localStorage `p5_layout`
- Preview centres every sketch: `frameFit` in Preview.tsx (body flex-centre, canvas max 100% + object-fit contain, auto resizeCanvas for full-window sketches without windowResized). Prefer createCanvas(windowWidth, windowHeight)
- MCP connection status lives in the header MCP button (connected / Connecting… / offline); WebSocketListener renders nothing

## Sketch storage
- Sketches are real files: `sketches/<slug-of-name>/` with sketch.js, index.html, style.css + project.json (id, name, tabs, file list). Committed to git, so pushing backs them up
- Server: `lib/sketch-store.ts` (fs) behind `app/api/sketches` (GET list) and `app/api/sketches/[id]` (GET/PUT/DELETE); localhost-only (`guard.ts`), file names sanitised, folder renamed with the project
- Client: `lib/projects.ts` (fetchProjects / fetchProject / saveProject / deleteProject). localStorage is only a cache/fallback; first dashboard load imports browser-only projects once (`p5_imported_to_disk` flag)
- Editor autosaves to disk 700ms after the last change. Save / ⌘S writes immediately and then publishes: `lib/sketch-publish.ts` commits only `sketches/` ("Save sketch: <name>") and pushes with the repo-only deploy key `~/.ssh/p5js_editor_deploy` (write access, added on GitHub by Joost), then moves origin/main so GitHub Desktop stays in sync. Failures leave it saved locally with a reason on the button tooltip
- Claude can edit sketches by editing those files, but the open editor won't reload them until the page is refreshed
- Code colors: calm white tones, theme does not inherit vs-dark: code #e6e6e6, strings #b8b8b8, comments #8f8f8f italic; line numbers white at 25% / 70% (alpha so they read on any ambient tint); bracket colours forced to the text colour. Regular weight, no line highlight, no sticky scroll, no squiggles or occurrence highlights, wrapped lines indented; white cursor and selection; Monaco bg matches panel (#212121)
- Icons are monochrome (no per-file-type colors); secondary actions appear on hover
- Everything follows DialKit's panel: `panel` and `dial-surface` utilities in globals.css (#212121, 10% white border, 14px corners, no shadow, 20px blur; see-through at `--surface-alpha` (70%) so the canvas shows through; DialKit's --dial-glass-bg is transparent and its pinned header blurs). Controls inside use 8px corners (rounded-lg), no full pills except dots and switches. Menus (ui/dropdown-menu) are DialKit's dropdown: #2a2a2a, 10px corners, 32px rows at 13px/500
- Light panels: over a light canvas (luminance > 0.62, back below 0.5) the page sets html[data-surface="light"]: chrome variables flip (`--ink` 0 0 0, `--chrome` #fafafa, light --card/--foreground etc. in globals.css), DialKit gets theme="light", Monaco uses `studio-light`. Use `rgb(var(--ink)/x)` for overlays, never white/[x], so both modes work
- Ambient tint (More → Adapt panels to canvas, on by default): Preview asks the sketch for its average colour (16×16 sample) every 500ms; page sets `--ambient` on :root (registered @property, 1s transition); `panel`, `dial-surface` and menus mix 18% of it into their grey. Monaco and DialKit's inner panel backgrounds are transparent so the tint shows
- Panel rules: 8px control radius (--radius 0.5rem), 14px panel radius, 44px panel header (h-11) with 13px/600 white title, 12px content inset (px-3); DialKit's inline panel is overridden in globals.css to match. Top bar buttons align with panel edges

## Sketch dials (DialKit)
Sketches can declare live controls; the editor shows them in the docked Controls column (right of the preview, `<DialRoot mode="inline">` in page.tsx) and pushes values into the running sketch. Always include dials in sketches for Joost; the starter sketch for new projects (DEFAULT_PROJECT in lib/types.ts) already has them.
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
- Bridge: `dialsBridge` script in Preview.tsx (inside the iframe) ↔ SketchControls.tsx, via postMessage. dials() controls and smart toggles share ONE DialKit panel named "Sketch" (one header, one preset row); values are split back by key. Preview reports `onDialsChange` so the page can show an empty state
- Control positions are saved with the project (`controls` in project.json, keyed like DialKit values) and restored on open; SketchControls retries the restore until each control shows its saved value (DialKit re-registers panels in dev StrictMode)
- Canvas toolbar (top right on hover): size picker, Record, PNG. Files are named `<sketch-name>-<local time>.<ext>`
  - Sizes (`lib/canvas-sizes.ts`, saved as `canvasSize` in project.json): Fit window, 1080×1080, 1080×1350, 1080×1920, 1920×1080. Fixed sizes make the iframe exactly that size (scaled down with a CSS transform) and set pixelDensity(1), so windowWidth/Height, PNGs and videos match the preset
  - Record: MediaRecorder on canvas.captureStream(60) inside the iframe (MP4 if supported, else WebM), Blob posted back; 2 min safety stop
- Dashboard thumbnails: 2.5s after a sketch (re)starts the iframe sends a 480px JPEG, saved as `sketches/<slug>/thumbnail.jpg` via `/api/sketches/[id]/thumbnail` (gitignored); cards fall back to code
- Controls column is always visible (lg+); shows an empty state with a snippet when the sketch has no dials

## Fonts and loops
- Fonts: upload .ttf/.otf/.woff/.woff2 via the "Aa" menu; stored in the sketch folder (committed), listed in project.json `fonts`, served by `/api/sketches/[id]/fonts/[name]`. Preview embeds them as data: URLs in @font-face (the sandboxed frame can't fetch them). Use `textFont('<file name without extension>')`; get_sketch lists them
- Perfect loops: animated sketches should define `function loopLength()` returning one cycle in seconds (e.g. `2 / speed` when the phase is `millis()/1000 * speed * PI`). Record → One perfect loop records exactly that long; also Until I stop, 3/5/10 seconds
- Only the editor tab used last obeys Claude's commands and answers get_sketch (`p5_active_editor_tab` in localStorage)
- Saving keeps controls/canvasSize/fonts already on disk when a client doesn't send them

## Export to Framer
- Canvas toolbar "Framer" copies a code component (`lib/framer-export.ts`): sketch JS + fonts embedded, runs in an iframe (p5 1.9 from cdnjs), fills its Framer frame
- dials() keys become property controls `d_<key>` (folders → ControlType.Object, select → Enum, hex → Color, text → String; actions/springs skipped); smart toggles become `c_<NAME>`. Defaults = current editor values
- In Framer: Assets → Code → New code file, paste, drag onto the canvas

## Fixing errors (get_sketch)
- MCP tool `get_sketch` returns every file, the last 50 console lines, control values and canvas size. Flow: MCP emits `requestSketchState` → hub → editors answer `sketchState` (visible tab preferred)
- Console "Fix with Claude" (shown when there's an error) copies `Fix the error in my p5.js sketch "<name>": <error>` for Joost to paste. When asked to fix: call get_sketch first, then update_code with the whole file
- Sketch error messages show only the message (the data: URL file name is dropped)
- Save also refreshes the dashboard thumbnail (`p5:capture-thumbnail` window event)

## Smart toggles (automatic controls)
- Any unindented `const NAME = <number | '#hex' | true/false>` in a sketch's JS becomes a control in a "Variables" panel, no dials() needed (`lib/auto-dials.ts`, shown in the same panel by `SketchControls.tsx`). ALL_CAPS names get friendly labels ("MAX_COUNT" → "Max count")
- Before running, the code is rewritten in memory only: those consts become `let` plus a setter (`window.__autoDials`); files on disk are untouched. `let`/`var` are ignored (usually state)
- Editing the value in code moves the control; control tweaks survive reloads
- When writing sketches for Joost: put tweakable settings as top-level consts (simplest), or use dials() for ranges, dropdowns, folders, buttons

## Git
- Remote: github.com/joostdamhuis/p5js-ai-editor (private). Forked from github.com/adilmoujahid/p5js-ai-editor, no upstream remote kept
- Claude commits code; Joost pushes code with GitHub Desktop (“Push origin”). The editor's Save pushes sketches itself via the deploy key. Claude should not push with the deploy key on its own

## Working style
- Joost also edits code manually; re-read files before editing
- In replies: no em dashes unless needed, curly quotes
