import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { DialConfig } from 'dialkit';
import { cn } from '@/lib/utils';
import { Download, ChevronDown, Square, Share, Image as ImageIcon, Video, Crop } from 'lucide-react';
import { CANVAS_SIZES, getCanvasSize } from '@/lib/canvas-sizes';
import { fontFamily, fontUrl } from '@/lib/projects';
import { buildFramerComponent } from '@/lib/framer-export';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Project } from '@/lib/types';
import { LogMessage } from './Console';
import SketchControls from './SketchControls';
import { findAutoDials, instrumentAutoDials } from '@/lib/auto-dials';

// Keeps every sketch centred in the preview and filling it: full-window
// canvases follow the preview's size, fixed-size ones are centred and scaled
// down to fit. Added at the end of <head> so it wins over the sketch's CSS.
const frameFit = `
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #000;
    }
    body {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    canvas {
      display: block;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain;
    }
  </style>
  <script>
    (function() {
      // Fixed canvas sizes: render at 1x so exports are exactly the chosen pixels
      if (window.__fixedSize) {
        window.addEventListener('load', function() {
          setTimeout(function() { if (typeof pixelDensity === 'function') pixelDensity(1); }, 0);
        });
      }
      let lastW = window.innerWidth;
      let lastH = window.innerHeight;
      window.addEventListener('resize', function() {
        // Only for full-window sketches that don't handle resizing themselves
        const fullWindow = typeof width !== 'undefined' && width === lastW && height === lastH;
        if (fullWindow && typeof window.windowResized !== 'function' && typeof resizeCanvas === 'function') {
          resizeCanvas(window.innerWidth, window.innerHeight);
        }
        lastW = window.innerWidth;
        lastH = window.innerHeight;
      });
    })();
  </script>
`;

// Gives sketches a global dials(config) that returns a live values object.
// The config is sent to the editor, which shows a DialKit panel and posts
// slider values back into the sketch.
const dialsBridge = `
  <script>
    (function() {
      let dial = null;
      let onAction = null;

      function defaults(config) {
        const out = {};
        for (const key in config) {
          if (key === '_collapsed') continue;
          const c = config[key];
          if (Array.isArray(c)) out[key] = c[0];
          else if (c && typeof c === 'object') {
            if (c.type === 'action') continue;
            if (c.type === 'select') {
              const first = c.options && c.options[0];
              out[key] = c.default !== undefined ? c.default : (first && first.value !== undefined ? first.value : first);
            }
            else if (c.type === 'color' || c.type === 'text' || c.type === 'image') out[key] = c.default !== undefined ? c.default : '';
            else if (c.type) out[key] = c;
            else out[key] = defaults(c);
          }
          else out[key] = c;
        }
        return out;
      }

      // Update in place so the sketch's reference to dial stays valid
      function assign(target, source) {
        for (const key in source) {
          if (!(key in target)) continue;
          const t = target[key];
          const s = source[key];
          const isFolder = t && typeof t === 'object' && !t.type && s && typeof s === 'object';
          if (isFolder) assign(t, s);
          else target[key] = s;
        }
      }

      window.dials = function(config, options) {
        dial = defaults(config);
        onAction = options && options.onAction;
        window.parent.postMessage({ source: 'p5js-dials', type: 'config', config: JSON.parse(JSON.stringify(config)) }, '*');
        return dial;
      };

      window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data || data.source !== 'p5js-editor-dials') return;
        if (data.type === 'values' && dial) assign(dial, data.values);
        // Pause: stop drawing and freeze the clock, so millis() picks up where it left off
        if (data.type === 'pause' || data.type === 'resume') {
          const now = window.__realNow || (window.__realNow = performance.now.bind(performance));
          if (window.__pauseOffset === undefined) {
            window.__pauseOffset = 0;
            performance.now = function() { return (window.__pausedAt !== undefined ? window.__pausedAt : now()) - window.__pauseOffset; };
          }
          if (data.type === 'pause' && window.__pausedAt === undefined) {
            window.__pausedAt = now();
            if (typeof noLoop === 'function') noLoop();
          }
          if (data.type === 'resume' && window.__pausedAt !== undefined) {
            window.__pauseOffset += now() - window.__pausedAt;
            window.__pausedAt = undefined;
            if (typeof loop === 'function') loop();
          }
        }
        // Smart toggles: plain settings found in the code (lib/auto-dials.ts)
        if (data.type === 'autoValues' && window.__autoDials) {
          for (const key in data.values) {
            if (window.__autoDials[key]) window.__autoDials[key](data.values[key]);
          }
        }
        // Snapshot: full-size PNG for downloads, small JPEG for dashboard thumbnails
        if (data.type === 'snapshot') {
          const canvas = document.querySelector('canvas');
          let dataUrl = null;
          if (canvas && data.purpose === 'thumbnail') {
            const scale = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
            const small = document.createElement('canvas');
            small.width = Math.round(canvas.width * scale);
            small.height = Math.round(canvas.height * scale);
            const ctx = small.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, small.width, small.height);
            ctx.drawImage(canvas, 0, 0, small.width, small.height);
            dataUrl = small.toDataURL('image/jpeg', 0.8);
          } else if (canvas) {
            dataUrl = canvas.toDataURL('image/png');
          }
          window.parent.postMessage({ source: 'p5js-dials', type: 'snapshot', purpose: data.purpose, dataUrl }, '*');
        }
        // Ambient tint: average colour of the canvas, from a 16x16 copy
        if (data.type === 'ambientSample') {
          const canvas = document.querySelector('canvas');
          if (!canvas || !canvas.width) return;
          const tiny = window.__ambientCanvas || (window.__ambientCanvas = document.createElement('canvas'));
          tiny.width = tiny.height = 16;
          const ctx = tiny.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(canvas, 0, 0, 16, 16);
          const px = ctx.getImageData(0, 0, 16, 16).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
          const n = px.length / 4;
          window.parent.postMessage({ source: 'p5js-dials', type: 'ambient', r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }, '*');
        }
        // Video: record the canvas with MediaRecorder (MP4 when the browser can, else WebM)
        if (data.type === 'recordStart' && !window.__recorder) {
          const canvas = document.querySelector('canvas');
          const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
          const mime = window.MediaRecorder && types.find(function(t) { return MediaRecorder.isTypeSupported(t); });
          if (!canvas || !mime) {
            window.parent.postMessage({ source: 'p5js-dials', type: 'recordError', reason: canvas ? 'This browser can’t record video' : 'No canvas to record' }, '*');
            return;
          }
          // Length: 'loop' asks the sketch for one cycle via loopLength(), a number is seconds
          let seconds = null;
          if (data.length === 'loop') {
            seconds = typeof window.loopLength === 'function' ? Number(window.loopLength()) : NaN;
            if (!(seconds > 0)) {
              window.parent.postMessage({ source: 'p5js-dials', type: 'recordError', reason: 'This sketch has no loopLength(), so it can’t record one loop' }, '*');
              return;
            }
          } else if (typeof data.length === 'number') {
            seconds = data.length;
          }
          const chunks = [];
          const recorder = new MediaRecorder(canvas.captureStream(60), { mimeType: mime, videoBitsPerSecond: 16000000 });
          recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
          recorder.onstop = function() {
            window.__recorder = null;
            window.parent.postMessage({ source: 'p5js-dials', type: 'recording', blob: new Blob(chunks, { type: mime }), mime: mime }, '*');
          };
          window.__recorder = recorder;
          recorder.start(250);
          if (seconds) setTimeout(function() { if (window.__recorder === recorder) recorder.stop(); }, seconds * 1000);
          window.parent.postMessage({ source: 'p5js-dials', type: 'recordStarted', seconds: seconds }, '*');
        }
        if (data.type === 'recordStop' && window.__recorder) window.__recorder.stop();
        if (data.type === 'action') {
          if (onAction) onAction(data.action);
          else if (typeof window.dialAction === 'function') window.dialAction(data.action);
        }
      });

      window.addEventListener('load', function() {
        if (!dial) window.parent.postMessage({ source: 'p5js-dials', type: 'none' }, '*');
      });
    })();
  </script>
`;

const formatElapsed = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

interface PreviewProps {
  project: Project;
  height?: string;
  className?: string;
  onConsoleMessage?: (message: LogMessage) => void;
  isRunning?: boolean;
  // Freezes the running sketch on its current frame
  isPaused?: boolean;
  // Tells the page whether the running sketch declares any dials
  onDialsChange?: (hasDials: boolean) => void;
  // Control positions are stored with the project
  onControlsChange?: (values: Record<string, unknown>) => void;
  onCanvasSizeChange?: (id: string) => void;
  // Average canvas colour, about twice a second (for tinting the panels)
  onAmbientColor?: (rgb: [number, number, number]) => void;
  // Dock layout: render the canvas toolbar into this element instead of on the canvas
  toolbarTarget?: HTMLElement | null;
}

const Preview = ({ project, height = '100%', className, onConsoleMessage, isRunning = true, isPaused = false, onDialsChange, onControlsChange, onCanvasSizeChange, toolbarTarget, onAmbientColor }: PreviewProps) => {
  const size = getCanvasSize(project.canvasSize);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(1);
  const [recording, setRecording] = useState<{ since: number; seconds?: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [recordNote, setRecordNote] = useState('');

  // Scale a fixed-size canvas down to fit the panel
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !size.w || !size.h) return;
    const fit = () => setFrameScale(Math.min(1, (el.clientWidth - 24) / size.w!, (el.clientHeight - 24) / size.h!));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [size.w, size.h, isRunning]);

  // Recording timer, and a 2 minute safety stop
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - recording.since > 120_000) postToSketchRef.current({ type: 'recordStop' });
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const postToSketchRef = useRef<(message: Record<string, unknown>) => void>(() => {});
  const [dialConfig, setDialConfig] = useState<DialConfig | null>(null);
  // Current name and id, read inside the message listener
  const projectName = useRef(project.name);
  projectName.current = project.name;
  const projectId = useRef(project.id);
  projectId.current = project.id;

  // Saves a file named after the sketch and the local time
  const downloadFile = (href: string, ext: string) => {
    const name = projectName.current.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketch';
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const link = document.createElement('a');
    link.download = `${name}-${stamp}.${ext}`;
    link.href = href;
    link.click();
  };

  // Plain settings at the top of the sketch's JS files become controls too
  const jsCode = project.files.filter(f => f.type === 'js').map(f => f.content).join('\n');
  const autoDials = useMemo(() => findAutoDials(jsCode), [jsCode]);
  const latestAutoValues = useRef<unknown>(null);

  const hasDials = isRunning && (dialConfig !== null || autoDials.length > 0);

  useEffect(() => {
    onDialsChange?.(hasDials);
  }, [hasDials, onDialsChange]);
  const dialConfigJson = useRef<string | null>(null);
  const latestDialValues = useRef<unknown>(null);

  const postToSketch = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'p5js-editor-dials', ...message }, '*');
  }, []);
  postToSketchRef.current = postToSketch;

  // Only the files' names and contents matter for the running sketch, so
  // switching tabs or renaming the project doesn't restart the animation
  // Font files, loaded once as data: URLs to embed in the sketch frame
  const [fontData, setFontData] = useState<Record<string, string>>({});
  const fontsKey = JSON.stringify(project.fonts ?? []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded: Record<string, string> = {};
      for (const f of project.fonts ?? []) {
        try {
          const blob = await (await fetch(fontUrl(project.id, f))).blob();
          loaded[f] = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          });
        } catch {}
      }
      if (!cancelled) setFontData(loaded);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsKey, project.id]);

  const filesKey = JSON.stringify([project.files.map(f => [f.name, f.content]), Object.keys(fontData)]);

  useEffect(() => {
    if (iframeRef.current && isRunning) {
      updateIframe();
    } else if (iframeRef.current && !isRunning) {
      // Clear the iframe when stopped
      iframeRef.current.src = 'about:blank';
      dialConfigJson.current = null;
      setDialConfig(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, isRunning, size.id]);

  useEffect(() => {
    if (isRunning) postToSketch({ type: isPaused ? 'pause' : 'resume' });
  }, [isPaused, isRunning, postToSketch]);

  // Dashboard thumbnail: capture the sketch a couple of seconds after it starts
  useEffect(() => {
    if (!isRunning) return;
    const timer = setTimeout(() => postToSketch({ type: 'snapshot', purpose: 'thumbnail' }), 2500);
    return () => clearTimeout(timer);
  }, [filesKey, isRunning, size.id, postToSketch]);

  // Ambient tint: ask the sketch for its average colour twice a second
  const onAmbientRef = useRef(onAmbientColor);
  onAmbientRef.current = onAmbientColor;
  const wantsAmbient = !!onAmbientColor;
  useEffect(() => {
    if (!isRunning || !wantsAmbient) return;
    const timer = setInterval(() => postToSketch({ type: 'ambientSample' }), 500);
    return () => clearInterval(timer);
  }, [isRunning, wantsAmbient, postToSketch]);

  // Save asks for a fresh thumbnail too
  useEffect(() => {
    const capture = () => postToSketch({ type: 'snapshot', purpose: 'thumbnail' });
    window.addEventListener('p5:capture-thumbnail', capture);
    return () => window.removeEventListener('p5:capture-thumbnail', capture);
  }, [postToSketch]);

  // Show the dials panel for whatever controls the running sketch declares
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'p5js-dials') return;

      if (data.type === 'none') {
        dialConfigJson.current = null;
        setDialConfig(null);
      }
      if (data.type === 'config') {
        const json = JSON.stringify(data.config);
        if (json !== dialConfigJson.current) {
          dialConfigJson.current = json;
          setDialConfig(data.config);
        }
        // The sketch just reloaded: hand it the current slider positions
        if (latestDialValues.current) {
          postToSketch({ type: 'values', values: latestDialValues.current });
        }
      }
      if (data.type === 'snapshot' && data.dataUrl && data.purpose === 'thumbnail') {
        fetch(`/api/sketches/${encodeURIComponent(projectId.current)}/thumbnail`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: data.dataUrl }),
        }).catch(() => {});
      } else if (data.type === 'snapshot' && data.dataUrl) {
        downloadFile(data.dataUrl, 'png');
      }
      if (data.type === 'ambient') {
        onAmbientRef.current?.([data.r, data.g, data.b]);
      }
      if (data.type === 'recordStarted') {
        setRecordNote('');
        setRecording({ since: Date.now(), seconds: data.seconds || undefined });
      }
      if (data.type === 'recordError') {
        setRecording(null);
        setRecordNote(data.reason);
      }
      if (data.type === 'recording' && data.blob) {
        setRecording(null);
        const url = URL.createObjectURL(data.blob);
        downloadFile(url, String(data.mime).includes('mp4') ? 'mp4' : 'webm');
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      if (data.type === 'autoReady' && latestAutoValues.current) {
        postToSketch({ type: 'autoValues', values: latestAutoValues.current });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [postToSketch]);

  const updateIframe = () => {
    if (!iframeRef.current || !isRunning) return;

    // Get HTML file
    const htmlFile = project.files.find(file => file.name === 'index.html');

    // Handle HTML processing
    let htmlContent = '';

    if (htmlFile) {
      // Start with existing HTML
      htmlContent = htmlFile.content;

      // Process the HTML to replace script src references with actual content
      project.files.forEach(file => {
        if (file.type === 'js' && file.name !== 'index.html') {
          // Look for script tags referencing this file
          const scriptRegex = new RegExp(`<script[^>]*src=["']${file.name}["'][^>]*>.*?</script>`, 'g');
          if (scriptRegex.test(htmlContent)) {
            // Replace reference with inline script
            htmlContent = htmlContent.replace(
              scriptRegex,
              () => `<script>${instrumentAutoDials(file.content, findAutoDials(file.content))}</script>`
            );
          }
        }

        if (file.type === 'css' && file.name !== 'index.html') {
          // Look for CSS links referencing this file
          const cssRegex = new RegExp(`<link[^>]*href=["']${file.name}["'][^>]*>`, 'g');
          if (cssRegex.test(htmlContent)) {
            // Replace reference with inline style
            htmlContent = htmlContent.replace(
              cssRegex,
              () => `<style>${file.content}</style>`
            );
          }
        }
      });
    } else {
      // If no HTML file exists, create a simple one with all scripts
      const cssFile = project.files.find(file => file.type === 'css');
      const jsFiles = project.files.filter(file => file.type === 'js');

      const cssContent = cssFile ? `<style>${cssFile.content}</style>` : '';
      const jsContent = jsFiles
        .map(file => `<script>${instrumentAutoDials(file.content, findAutoDials(file.content))}</script>`)
        .join('\n');

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${project.name}</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>
          ${cssContent}
        </head>
        <body>
          ${jsContent}
        </body>
        </html>
      `;
    }

    // Add console interceptor script
    const consoleInterceptor = `
      <script>
        (function() {
          const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
          };

          // Override console methods
          console.log = function() {
            const args = Array.from(arguments);
            originalConsole.log.apply(console, args);
            sendConsoleMessage('log', args);
          };
          
          console.warn = function() {
            const args = Array.from(arguments);
            originalConsole.warn.apply(console, args);
            sendConsoleMessage('warning', args);
          };
          
          console.error = function() {
            const args = Array.from(arguments);
            originalConsole.error.apply(console, args);
            sendConsoleMessage('error', args);
          };
          
          console.info = function() {
            const args = Array.from(arguments);
            originalConsole.info.apply(console, args);
            sendConsoleMessage('info', args);
          };

          // Send message to parent
          function sendConsoleMessage(type, args) {
            try {
              const content = args.map(arg => {
                if (typeof arg === 'object') {
                  try {
                    return JSON.stringify(arg);
                  } catch (e) {
                    return String(arg);
                  }
                }
                return String(arg);
              }).join(' ');
              
              window.parent.postMessage({
                source: 'p5js-console',
                type: type,
                content: content,
                timestamp: Date.now()
              }, '*');
            } catch (e) {
              originalConsole.error('Error sending console message:', e);
            }
          }

          // Capture global errors
          window.addEventListener('error', function(event) {
            // Just the message: the file name is the whole sketch as a data: URL
            sendConsoleMessage('error', [event.message]);
          });
        })();
      </script>
    `;

    // Add p5.js library if not present
    if (!htmlContent.includes('p5.js') && !htmlContent.includes('p5.min.js')) {
      const headEndIndex = htmlContent.indexOf('</head>');
      if (headEndIndex !== -1) {
        htmlContent =
          htmlContent.slice(0, headEndIndex) +
          '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>\n' +
          htmlContent.slice(headEndIndex);
      }
    }

    // Insert console interceptor at the beginning of head
    const headStartIndex = htmlContent.indexOf('<head>') + 6;
    if (headStartIndex > 5) {
      htmlContent =
        htmlContent.slice(0, headStartIndex) +
        consoleInterceptor +
        dialsBridge +
        htmlContent.slice(headStartIndex);
    }

    // Centre and fit the canvas, after the sketch's own styles
    const headCloseIndex = htmlContent.indexOf('</head>');
    if (headCloseIndex !== -1) {
      const sizeFlag = size.w ? '<script>window.__fixedSize = true;</script>' : '';
      // Uploaded fonts: usable as textFont('<file name without extension>')
      // Embedded as data: URLs, because the sealed-off sketch frame may not be allowed to fetch them
      const loadedFonts = (project.fonts ?? []).filter(f => fontData[f]);
      const fontFaces = loadedFonts.length
        ? `<style>${loadedFonts.map(f =>
          `@font-face { font-family: "${fontFamily(f)}"; src: url("${fontData[f]}"); font-display: block; }`
        ).join('\n')}</style>`
        : '';
      htmlContent = htmlContent.slice(0, headCloseIndex) + sizeFlag + fontFaces + frameFit + htmlContent.slice(headCloseIndex);
    }

    // Use data URI to avoid cross-origin issues
    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    iframeRef.current.src = dataUri;
  };

  // Set up message listener for console messages
  useEffect(() => {
    if (!onConsoleMessage) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'p5js-console') {
        onConsoleMessage({
          id: `console-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: event.data.type,
          content: event.data.content,
          timestamp: event.data.timestamp
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConsoleMessage]);

  if (!isRunning) {
    return (
      <div
        className={cn(
          "w-full h-full overflow-auto bg-black flex items-center justify-center",
          className
        )}
      >
        <div className="text-center">
          <div className="text-[13px] font-medium text-muted-foreground">Sketch stopped</div>
          <div className="text-[12px] text-muted-foreground/60 mt-1">Press Run to start it again</div>
        </div>
      </div>
    );
  }

  const copyForFramer = async () => {
    const code = buildFramerComponent(project, dialConfig, fontData);
    try {
      await navigator.clipboard.writeText(code);
      setRecordNote('Copied. In Framer: Assets → Code → New code file, then paste');
    } catch {
      setRecordNote('Couldn’t copy. Click the canvas once and try again');
    }
    setTimeout(() => setRecordNote(''), 6000);
  };

  // Dock: one Export button (a red timer while recording) holding everything
  const dockExport = recording ? (
    <button
      onClick={() => postToSketch({ type: 'recordStop' })}
      title="Stop and download the video"
      className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium tabular-nums bg-red-500 text-white hover:bg-red-500/90 transition-colors"
    >
      <Square className="h-3 w-3 fill-current" />
      {formatElapsed(now - recording.since)}
      {recording.seconds ? ` / ${formatElapsed(recording.seconds * 1000)}` : ''}
    </button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Export"
          aria-label="Export"
          className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-[rgb(var(--ink)/0.1)] hover:text-foreground data-[state=open]:bg-[rgb(var(--ink)/0.11)] data-[state=open]:text-foreground transition-colors"
        >
          <Share className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-56">
        <DropdownMenuItem onClick={() => postToSketch({ type: 'snapshot', purpose: 'download' })}>
          <ImageIcon className="mr-2 h-4 w-4" />
          Image (PNG)
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Video className="mr-2 h-4 w-4" />
            Video
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => postToSketch({ type: 'recordStart', length: 'loop' })}>One perfect loop</DropdownMenuItem>
            <DropdownMenuItem onClick={() => postToSketch({ type: 'recordStart' })}>Until I stop</DropdownMenuItem>
            <DropdownMenuSeparator />
            {[3, 5, 10].map(sec => (
              <DropdownMenuItem key={sec} onClick={() => postToSketch({ type: 'recordStart', length: sec })}>{sec} seconds</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={copyForFramer}>
          <svg viewBox="0 0 14 21" className="mr-2 h-3.5 w-4 fill-current" aria-hidden><path d="M0 0h14v7H7zM0 7h7l7 7H7v7l-7-7z" /></svg>
          Copy for Framer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Crop className="mr-2 h-4 w-4" />
            Size: {size.short}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={size.id} onValueChange={(id) => onCanvasSizeChange?.(id)}>
              {CANVAS_SIZES.map(s => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>{s.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Toolbar buttons: dark chips on the canvas, plain buttons inside the dock
  const itemBg = toolbarTarget ? 'bg-transparent hover:bg-[rgb(var(--ink)/0.1)]' : 'bg-[var(--chrome)] hover:bg-[var(--chrome-raised)]';
  const toolbarItems = (
    <>
        <div className="relative">
          <select
            value={size.id}
            onChange={(e) => onCanvasSizeChange?.(e.target.value)}
            disabled={!!recording}
            title="Canvas size"
            className={`appearance-none h-8 pl-2.5 pr-7 rounded-lg ${itemBg} text-[13px] font-medium text-foreground outline-none cursor-pointer`}
          >
            {CANVAS_SIZES.map(s => <option key={s.id} value={s.id}>{toolbarTarget ? s.short : s.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {recording ? (
          <button
            onClick={() => postToSketch({ type: 'recordStop' })}
            title="Stop and download the video"
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium tabular-nums bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <Square className="h-3 w-3 fill-current" />
            {formatElapsed(now - recording.since)}
            {recording.seconds ? ` / ${formatElapsed(recording.seconds * 1000)}` : ''}
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Record a video of the canvas"
                className={`flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-lg text-[13px] font-medium text-foreground ${itemBg} data-[state=open]:bg-[rgb(var(--ink)/0.11)] transition-colors`}
              >
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Record
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => postToSketch({ type: 'recordStart', length: 'loop' })}>
                One perfect loop
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => postToSketch({ type: 'recordStart' })}>
                Until I stop
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {[3, 5, 10].map(sec => (
                <DropdownMenuItem key={sec} onClick={() => postToSketch({ type: 'recordStart', length: sec })}>
                  {sec} seconds
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          onClick={copyForFramer}
          title="Copy this sketch as a Framer code component, with its controls as Framer properties"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg ${itemBg} text-[13px] font-medium text-foreground`}
        >
          <svg viewBox="0 0 14 21" className="h-3 w-3 fill-current" aria-hidden><path d="M0 0h14v7H7zM0 7h7l7 7H7v7l-7-7z" /></svg>
          Framer
        </button>
        <button
          onClick={() => postToSketch({ type: 'snapshot', purpose: 'download' })}
          title="Download this frame as a PNG"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg ${itemBg} text-[13px] font-medium text-foreground`}
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </button>
    </>
  );

  return (
    <div
      className={cn(
        "group relative w-full h-full overflow-hidden bg-black",
        className
      )}
    >
      {/* Canvas toolbar: on the canvas (on hover, always while recording), or in the dock */}
      {toolbarTarget
        ? createPortal(dockExport, toolbarTarget)
        : (
          <div className={cn(
            "absolute top-2 right-2 z-10 flex items-center gap-1 transition-opacity",
            recording ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100"
          )}>
            {toolbarItems}
          </div>
        )}
      {recordNote && (
        <div className={cn(
          "absolute z-30 rounded-lg bg-[var(--chrome)] px-2.5 py-1.5 text-[12px] text-muted-foreground",
          toolbarTarget ? "bottom-20 left-1/2 -translate-x-1/2" : "top-12 right-2"
        )}>
          {recordNote}
        </div>
      )}

      <div ref={frameRef} className="absolute inset-0">
        <iframe
          ref={iframeRef}
          title="Preview"
          sandbox="allow-scripts allow-same-origin"
          className={size.w ? "absolute left-1/2 top-1/2 block outline outline-1 outline-[rgb(var(--ink)/0.15)]" : "block w-full h-full"}
          style={size.w
            ? { width: size.w, height: size.h, transform: `translate(-50%, -50%) scale(${frameScale})`, transformOrigin: 'center' }
            : { height }}
        />
      </div>
      {hasDials && (
        <SketchControls
          dialConfig={dialConfig}
          autoDials={autoDials}
          postToSketch={postToSketch}
          latestDialValues={latestDialValues}
          latestAutoValues={latestAutoValues}
          savedValues={project.controls}
          onValuesChange={onControlsChange}
        />
      )}
    </div>
  );
};

export default Preview; 