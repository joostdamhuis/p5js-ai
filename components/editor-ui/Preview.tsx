import { useEffect, useRef, useState, useCallback } from 'react';
import type { DialConfig } from 'dialkit';
import { cn } from '@/lib/utils';
import { Project } from '@/lib/types';
import { LogMessage } from './Console';
import SketchDials from './SketchDials';

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

interface PreviewProps {
  project: Project;
  height?: string;
  className?: string;
  onConsoleMessage?: (message: LogMessage) => void;
  isRunning?: boolean;
}

const Preview = ({ project, height = '100%', className, onConsoleMessage, isRunning = true }: PreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [dialConfig, setDialConfig] = useState<DialConfig | null>(null);
  const dialConfigJson = useRef<string | null>(null);
  const latestDialValues = useRef<unknown>(null);

  const postToSketch = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'p5js-editor-dials', ...message }, '*');
  }, []);

  useEffect(() => {
    if (iframeRef.current && isRunning) {
      updateIframe();
    } else if (iframeRef.current && !isRunning) {
      // Clear the iframe when stopped
      iframeRef.current.src = 'about:blank';
      dialConfigJson.current = null;
      setDialConfig(null);
    }
  }, [project, isRunning]);

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
              `<script>${file.content}</script>`
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
              `<style>${file.content}</style>`
            );
          }
        }
      });
    } else {
      // If no HTML file exists, create a simple one with all scripts
      const cssFile = project.files.find(file => file.type === 'css');
      const jsFiles = project.files.filter(file => file.type === 'js');

      const cssContent = cssFile ? `<style>${cssFile.content}</style>` : '';
      const jsContent = jsFiles.map(file => `<script>${file.content}</script>`).join('\n');

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
            sendConsoleMessage('error', [event.message + ' at ' + event.filename + ':' + event.lineno]);
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
        <div className="text-center text-muted-foreground">
          <div className="text-lg mb-2">⏸️</div>
          <div className="text-sm">Code execution stopped</div>
          <div className="text-xs mt-1">Click Start to run your sketch</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full h-full overflow-auto bg-black",
        className
      )}
      style={{
        overflowX: 'auto',
        overflowY: 'auto'
      }}
    >
      <iframe
        ref={iframeRef}
        className="min-w-full min-h-full"
        style={{ height, width: '100%' }}
        title="Preview"
        sandbox="allow-scripts allow-same-origin"
      />
      {dialConfig && (
        <SketchDials
          config={dialConfig}
          postToSketch={postToSketch}
          latestValues={latestDialValues}
        />
      )}
    </div>
  );
};

export default Preview; 