'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Editor from '@/components/editor-ui/Editor';
import Preview from '@/components/editor-ui/Preview';
import ProjectManager from '@/components/editor-ui/ProjectManager';
import WebSocketListener, { McpStatus } from '@/components/editor-ui/WebSocketListener';
import Tabs from '@/components/editor-ui/Tabs';
import Console, { LogMessage } from '@/components/editor-ui/Console';
import ResizeHandle from '@/components/editor-ui/ResizeHandle';
import ConnectionStatus from '@/components/editor-ui/ConnectionStatus';
import FontsMenu, { FontsSubmenu } from '@/components/editor-ui/FontsMenu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Project, ProjectFile, DEFAULT_PROJECT } from '@/lib/types';
import { fetchProject, fetchProjects, saveProject, cacheProject, uploadFont } from '@/lib/projects';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelBottom, Columns3, PanelsLeftRight, Play, Square, MoreHorizontal, Plus } from 'lucide-react';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

const LAYOUT_KEY = 'p5_layout';

// How see-through the glass can be over this canvas colour while its dimmer
// (secondary) text still reaches 4.5:1 contrast. Mirrors the CSS: neutral glass
// (dark grey or near-white) at this opacity over the blurred canvas.
const SURFACE_ALPHA_MIN = 0.55;
const SURFACE_ALPHA_MAX = 0.94;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => a[i] * t + b[i] * (1 - t)) as RGB;
const relLum = ([r, g, b]: RGB) => {
  const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: RGB, b: RGB) => {
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
function surfaceAlphaFor(canvas: RGB, light: boolean) {
  const base: RGB = light ? [255, 255, 255] : [0, 0, 0];
  const ink: RGB = light ? [0, 0, 0] : [255, 255, 255];
  const tinted = base;
  // Whole-percent steps (adding 0.02 repeatedly drifts past the maximum)
  for (let pct = SURFACE_ALPHA_MIN * 100; pct <= SURFACE_ALPHA_MAX * 100; pct += 2) {
    const alpha = pct / 100;
    const surface = mix(tinted, canvas, alpha);
    const secondaryText = mix(ink, surface, light ? 0.55 : 0.6);
    if (contrast(secondaryText, surface) >= 4.5) return alpha;
  }
  return SURFACE_ALPHA_MAX;
}
const MCP_KEY = 'p5_mcp';
const LAYOUT_DEFAULTS = { consoleHeight: 200, codeWidth: 400, controlsWidth: 280 };

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  // Claude (MCP) is on by default; turning it off is remembered
  const [enableWsListener, setEnableWsListener] = useState(true);
  const [consoleMessages, setConsoleMessages] = useState<LogMessage[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(LAYOUT_DEFAULTS.consoleHeight);
  const [codeWidth, setCodeWidth] = useState(LAYOUT_DEFAULTS.codeWidth);
  const [controlsWidth, setControlsWidth] = useState(LAYOUT_DEFAULTS.controlsWidth);
  // Layout: 'columns' (panels side by side) or 'dock' (full canvas, floating panels, one dock)
  const [layoutMode, setLayoutMode] = useState<'columns' | 'dock'>('dock');
  const [showCode, setShowCode] = useState(true);
  const [showConsole, setShowConsole] = useState(false);
  const [showControls, setShowControls] = useState(true);
  // Panels take on a tint of the canvas's colour
  const [tintPanels, setTintPanels] = useState(true);
  const [dockToolsEl, setDockToolsEl] = useState<HTMLElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  // Height of the code itself, so the floating code panel can fit it
  const [codeContentHeight, setCodeContentHeight] = useState(320);
  const [isRunning, setIsRunning] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasDials, setHasDials] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<McpStatus>('connecting');

  useEffect(() => {
    try {
      if (localStorage.getItem(MCP_KEY) === 'off') setEnableWsListener(false);
    } catch {}
  }, []);

  const setMcpEnabled = (enabled: boolean) => {
    setEnableWsListener(enabled);
    try {
      localStorage.setItem(MCP_KEY, enabled ? 'on' : 'off');
    } catch {}
  };

  // The editor fills the window exactly; the page itself never scrolls
  useEffect(() => {
    const { documentElement: html, body } = document;
    html.style.overflow = body.style.overflow = 'hidden';
    return () => { html.style.overflow = body.style.overflow = ''; };
  }, []);

  // Panel sizes are remembered per browser
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
      if (saved.consoleHeight) setConsoleHeight(saved.consoleHeight);
      if (saved.codeWidth) setCodeWidth(saved.codeWidth);
      if (saved.controlsWidth) setControlsWidth(saved.controlsWidth);
      if (saved.layout === 'dock' || saved.layout === 'columns') setLayoutMode(saved.layout);
      if (typeof saved.showCode === 'boolean') setShowCode(saved.showCode);
      if (typeof saved.showConsole === 'boolean') setShowConsole(saved.showConsole);
      if (typeof saved.showControls === 'boolean') setShowControls(saved.showControls);
      if (typeof saved.tintPanels === 'boolean') setTintPanels(saved.tintPanels);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ consoleHeight, codeWidth, controlsWidth, layout: layoutMode, showCode, showConsole, showControls, tintPanels }));
    } catch {}
  }, [consoleHeight, codeWidth, controlsWidth, layoutMode, showCode, showConsole, showControls, tintPanels]);

  // Load the project from the sketches folder (falls back to this browser's copy)
  useEffect(() => {
    let cancelled = false;
    fetchProject(projectId).then((found) => {
      if (cancelled) return;
      if (!found) {
        console.error('Project not found:', projectId);
        router.push('/');
        return;
      }
      if (!found.openTabs) found.openTabs = found.files.map((f: ProjectFile) => f.id);
      setProject(found);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId, router]);

  // Autosave: browser copy right away, sketches folder shortly after typing stops
  useEffect(() => {
    if (!project) return;
    cacheProject(project);
    const timer = setTimeout(() => {
      saveProject(project).catch((error) => console.error('Autosave failed:', error));
    }, 700);
    return () => clearTimeout(timer);
  }, [project]);

  // Control positions are saved with the project (autosave picks them up)
  const handleControlsChange = useCallback((controls: Record<string, unknown>) => {
    setProject(prev => {
      if (!prev) return prev;
      // Merge, so controls that haven't appeared yet keep their saved values
      const merged = { ...(prev.controls ?? {}), ...controls };
      if (JSON.stringify(prev.controls ?? {}) === JSON.stringify(merged)) return prev;
      return { ...prev, controls: merged };
    });
  }, []);

  // What Claude sees when it calls get_sketch
  const getSketchState = () => project ? {
    projectName: project.name,
    activeFile: project.files.find(f => f.id === project.activeFile)?.name,
    files: project.files.map(f => ({ name: f.name, content: f.content })),
    console: consoleMessages.slice(-50).map(m => ({ type: m.type, content: m.content })),
    controls: project.controls,
    canvasSize: project.canvasSize,
    // Use as textFont('<name without extension>')
    fonts: project.fonts ?? [],
  } : {};

  // Ambient tint: the canvas colour as --ambient on :root (CSS fades it).
  // Over a light canvas the panels switch to light (with a little hysteresis
  // so a canvas near the threshold doesn't flip back and forth)
  const [lightSurface, setLightSurface] = useState(false);
  const lightRef = useRef(false);
  const setAmbient = useCallback(([r, g, b]: [number, number, number]) => {
    const root = document.documentElement;
    root.style.setProperty('--ambient', `rgb(${r} ${g} ${b})`);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const light = lightRef.current ? luminance > 0.5 : luminance > 0.62;
    lightRef.current = light;
    setLightSurface(light);
    root.style.setProperty('--surface-alpha', `${Math.round(surfaceAlphaFor([r, g, b], light) * 100)}%`);
  }, []);
  useEffect(() => {
    if (!tintPanels) {
      document.documentElement.style.removeProperty('--ambient');
      document.documentElement.style.removeProperty('--surface-alpha');
      lightRef.current = false;
      setLightSurface(false);
    }
    return () => {
      document.documentElement.style.removeProperty('--ambient');
      document.documentElement.style.removeProperty('--surface-alpha');
    };
  }, [tintPanels]);
  useEffect(() => {
    if (lightSurface) document.documentElement.dataset.surface = 'light';
    else delete document.documentElement.dataset.surface;
    return () => { delete document.documentElement.dataset.surface; };
  }, [lightSurface]);

  const createNewSketch = async () => {
    const count = (await fetchProjects()).length;
    const newProject = { ...DEFAULT_PROJECT, id: `project-${Date.now()}`, name: `Untitled Project ${count + 1}`, lastModified: Date.now() };
    await saveProject(newProject).catch((error) => console.error(error));
    router.push(`/project/${newProject.id}`);
  };

  // Handle file selection
  const handleFileSelect = (fileId: string) => {
    if (!project) return;

    const updatedOpenTabs = project.openTabs.includes(fileId)
      ? project.openTabs
      : [...project.openTabs, fileId];

    setProject({
      ...project,
      activeFile: fileId,
      openTabs: updatedOpenTabs
    });
  };

  // Handle file content changes
  const handleFileChange = (content: string) => {
    if (!project || !project.activeFile) return;

    const updatedFiles = project.files.map(file => {
      if (file.id === project.activeFile) {
        return {
          ...file,
          content,
          lastModified: Date.now()
        };
      }
      return file;
    });

    setProject({
      ...project,
      files: updatedFiles,
      lastModified: Date.now()
    });
  };

  // Handle closing a tab
  const handleCloseTab = (fileId: string) => {
    if (!project) return;

    const updatedOpenTabs = project.openTabs.filter(id => id !== fileId);

    let activeFile = project.activeFile;
    if (project.activeFile === fileId) {
      activeFile = updatedOpenTabs.length > 0 ? updatedOpenTabs[0] : undefined;
    }

    setProject({
      ...project,
      openTabs: updatedOpenTabs,
      activeFile,
      lastModified: Date.now()
    });
  };

  // Handle updates from WebSocket
  const handleCodeUpdate = (code: string) => {
    if (!project || !project.activeFile) return;

    const updatedFiles = project.files.map(file => {
      if (file.id === project.activeFile) {
        return {
          ...file,
          content: code,
          lastModified: Date.now()
        };
      }
      return file;
    });

    setProject({
      ...project,
      files: updatedFiles,
      lastModified: Date.now()
    });
  };

  // WebSocket execution control handler
  const handleExecutionControl = (action: 'start' | 'stop' | 'toggle') => {
    switch (action) {
      case 'start':
        handleStart();
        break;
      case 'stop':
        handleStop();
        break;
      case 'toggle':
        if (isRunning) {
          handleStop();
        } else {
          handleStart();
        }
        break;
    }
  };

  // WebSocket console control handler
  const handleConsoleControl = (action: 'clear' | 'message' | 'height', data?: any) => {
    switch (action) {
      case 'clear':
        clearConsole();
        break;
      case 'message':
        if (data) {
          handleConsoleMessage(data);
        }
        break;
      case 'height':
        if (typeof data === 'number') {
          setConsoleHeight(Math.max(50, Math.min(500, data)));
        }
        break;
    }
  };

  // WebSocket file control handler
  const handleFileControl = (action: 'select' | 'close' | 'create' | 'delete', data?: any) => {
    if (!project) return;

    switch (action) {
      case 'select':
        if (typeof data === 'string') {
          const fileExists = project.files.find(f => f.id === data);
          if (fileExists) {
            handleFileSelect(data);
          }
        }
        break;
      case 'close':
        if (typeof data === 'string') {
          handleCloseTab(data);
        }
        break;
      case 'create':
        if (data && data.name && data.content) {
          const newFile = {
            id: data.name,
            name: data.name,
            type: 'js' as const,
            content: data.content,
            lastModified: Date.now()
          };

          const updatedFiles = [...project.files, newFile];
          const updatedOpenTabs = [...project.openTabs, newFile.id];

          setProject({
            ...project,
            files: updatedFiles,
            openTabs: updatedOpenTabs,
            activeFile: newFile.id,
            lastModified: Date.now()
          });
        }
        break;
      case 'delete':
        if (typeof data === 'string') {
          const updatedFiles = project.files.filter(f => f.id !== data);
          const updatedOpenTabs = project.openTabs.filter(id => id !== data);

          let activeFile = project.activeFile;
          if (project.activeFile === data) {
            activeFile = updatedOpenTabs.length > 0 ? updatedOpenTabs[0] : undefined;
          }

          setProject({
            ...project,
            files: updatedFiles,
            openTabs: updatedOpenTabs,
            activeFile,
            lastModified: Date.now()
          });
        }
        break;
    }
  };

  // WebSocket layout control handler
  const handleLayoutControl = (action: 'sidebar' | 'projectName', data?: any) => {
    switch (action) {
      case 'sidebar':
        setShowCode(prev => !prev);
        break;
      case 'projectName':
        if (typeof data === 'string' && project) {
          setProject({
            ...project,
            name: data,
            lastModified: Date.now()
          });
        }
        break;
    }
  };

  // WebSocket navigation control handler
  const handleNavigationControl = (action: 'dashboard') => {
    switch (action) {
      case 'dashboard':
        handleBackToDashboard();
        break;
    }
  };

  // Handle console messages
  const handleConsoleMessage = (message: LogMessage) => {
    setConsoleMessages(prevMessages => [...prevMessages, message]);
  };

  // Clear console messages
  const clearConsole = () => {
    setConsoleMessages([]);
  };

  // Handle start execution
  const handleStart = () => {
    setIsRunning(true);
    clearConsole();
  };

  // Handle stop execution
  const handleStop = () => {
    setIsRunning(false);
  };

  // Go back to dashboard
  const handleBackToDashboard = () => {
    router.push('/');
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[rgb(var(--ink)/0.2)] border-t-white/70 animate-spin" />
          Loading sketch…
        </div>
      </div>
    );
  }

  const activeFile = project.activeFile
    ? project.files.find(f => f.id === project.activeFile)
    : null;

  // ---- Pieces shared by both layouts ----

  const nameInput = (
    <input
      value={project.name}
      onChange={(e) => setProject({ ...project, name: e.target.value, lastModified: Date.now() })}
      className="h-8 px-2 rounded-lg bg-transparent text-[13px] font-semibold text-foreground outline-none hover:bg-[rgb(var(--ink)/0.05)] focus:bg-[rgb(var(--ink)/0.1)] min-w-0 w-56 truncate transition-colors"
      title="Rename project"
      spellCheck={false}
    />
  );

  const backButton = (
    <Button variant="ghost" size="icon" onClick={handleBackToDashboard} title="All projects">
      <ArrowLeft className="w-4 h-4" />
    </Button>
  );

  const connection = (
    <ConnectionStatus enabled={enableWsListener} onEnabledChange={setMcpEnabled} status={mcpStatus} />
  );

  const layoutSwitch = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLayoutMode(layoutMode === 'dock' ? 'columns' : 'dock')}
      title={layoutMode === 'dock' ? 'Switch to columns layout' : 'Switch to dock layout'}
    >
      {layoutMode === 'dock' ? <Columns3 className="w-4 h-4" /> : <PanelBottom className="w-4 h-4" />}
    </Button>
  );

  const codePanel = (
    <>
      <Tabs
        project={project}
        onFileSelect={handleFileSelect}
        onCloseTab={handleCloseTab}
        isRunning={isRunning}
        // In the dock layout Run/Stop lives in the dock
        onStart={layoutMode === 'dock' ? undefined : handleStart}
        onStop={layoutMode === 'dock' ? undefined : handleStop}
      />
      {activeFile ? (
        <div className="flex-1 overflow-hidden min-w-0">
          <Editor file={activeFile} onChange={handleFileChange} onContentHeightChange={setCodeContentHeight} light={lightSurface} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground/60">
          Open a file
        </div>
      )}
    </>
  );

  const consolePanel = (
    <Console messages={consoleMessages} onClear={clearConsole} sketchName={project.name} />
  );

  const consoleHandle = (
    <ResizeHandle
      axis="y"
      value={consoleHeight}
      onChange={setConsoleHeight}
      min={50}
      max={600}
      invert
      onReset={() => setConsoleHeight(LAYOUT_DEFAULTS.consoleHeight)}
    />
  );

  const preview = (
    <Preview
      project={project}
      onConsoleMessage={handleConsoleMessage}
      isRunning={isRunning}
      onDialsChange={setHasDials}
      onControlsChange={handleControlsChange}
      onCanvasSizeChange={(canvasSize) => setProject(prev => prev ? { ...prev, canvasSize, lastModified: Date.now() } : prev)}
      toolbarTarget={layoutMode === 'dock' ? dockToolsEl : undefined}
      onAmbientColor={tintPanels ? setAmbient : undefined}
    />
  );

  const controlsPanel = (
    <div className="flex-1 overflow-y-auto min-h-0">
      <DialRoot mode="inline" theme={lightSurface ? 'light' : 'dark'} productionEnabled />
      {!hasDials && (
        <div className="px-3 pb-3">
          <h3 className="h-11 flex items-center text-[13px] font-semibold text-foreground">Controls</h3>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Sliders for your sketch show up here. Add a <code className="font-mono text-foreground/80">dials</code> line
            at the top of your sketch, or ask Claude for a sketch with controls.
          </p>
          <pre className="mt-3 rounded-lg bg-[rgb(var(--ink)/0.05)] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-muted-foreground overflow-x-auto">{`const dial = dials({
  size: [24, 2, 80],
  color: '#ffffff',
});

// then use dial.size`}</pre>
        </div>
      )}
    </div>
  );

  const listener = enableWsListener && (
    <WebSocketListener
      onCodeUpdate={handleCodeUpdate}
      onExecutionControl={handleExecutionControl}
      onConsoleControl={handleConsoleControl}
      onFileControl={handleFileControl}
      onLayoutControl={handleLayoutControl}
      onNavigationControl={handleNavigationControl}
      onStatusChange={setMcpStatus}
      getSketchState={getSketchState}
    />
  );

  // ---- Dock layout: the canvas fills the window, panels float, one dock ----

  if (layoutMode === 'dock') {
    const floating = 'panel flex flex-col';
    const dockToggle = (on: boolean, toggle: () => void, label: string, icon: React.ReactNode) => (
      <button
        onClick={toggle}
        title={`${on ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={on}
        className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${on ? 'bg-[rgb(var(--ink)/0.11)] text-foreground' : 'text-muted-foreground hover:bg-[rgb(var(--ink)/0.1)] hover:text-foreground'}`}
      >
        {icon}
      </button>
    );

    return (
      <div className="h-screen relative bg-black overflow-hidden">
        <div className="absolute inset-0">{preview}</div>

        {/* Top corners */}
        <div className="dial-surface absolute top-3 left-3 z-20 flex items-center p-1 pr-1.5">
          <button
            onClick={handleBackToDashboard}
            title="All projects"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-[rgb(var(--ink)/0.1)] hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <input
            value={project.name}
            onChange={(e) => setProject({ ...project, name: e.target.value, lastModified: Date.now() })}
            className="h-8 px-2 rounded-lg bg-transparent text-[13px] font-medium text-foreground outline-none hover:bg-[rgb(var(--ink)/0.05)] focus:bg-[rgb(var(--ink)/0.1)] [field-sizing:content] min-w-[4ch] max-w-64 transition-colors"
            title="Rename project"
            spellCheck={false}
          />
        </div>
        <div className="absolute top-3 right-3 z-20">
          <ConnectionStatus enabled={enableWsListener} onEnabledChange={setMcpEnabled} status={mcpStatus} pill popupWidth={controlsWidth} />
        </div>

        {/* Side panels stay mounted and slide in/out from their edge */}
        {/* Left: code + console, top-aligned with Controls, as tall as their content */}
        <div
          className="absolute left-3 top-16 z-10 flex flex-col max-h-[calc(100vh-9rem)] transition-transform duration-[350ms] ease-[cubic-bezier(0.34,1.25,0.64,1)]"
          style={{
            width: codeWidth,
            transform: `translateX(${showCode || showConsole ? '0' : 'calc(-100% - 24px)'})`,
            pointerEvents: showCode || showConsole ? 'auto' : 'none',
          }}
          aria-hidden={!(showCode || showConsole)}
        >
          {showCode && (
            // 44px tab bar + the code; shrinks (and scrolls) when there isn't room
            <div className={`${floating} shrink min-h-[140px]`} style={{ height: codeContentHeight + 44 }}>{codePanel}</div>
          )}
          {showCode && showConsole && consoleHandle}
          {showConsole && (
            <div className={`${floating} shrink-0`} style={{ height: consoleHeight }}>{consolePanel}</div>
          )}
          {/* Keep the editor mounted while sliding out, so the slide shows its content */}
          {!showCode && !showConsole && (
            <div className={`${floating} shrink min-h-[140px]`} style={{ height: codeContentHeight + 44 }}>{codePanel}</div>
          )}
        </div>

        {/* Right: controls */}
        <aside
          className={`${floating} absolute right-3 top-16 z-10 max-h-[calc(100vh-9rem)]`}
          style={{
            width: controlsWidth,
            transform: `translateX(${showControls ? '0' : 'calc(100% + 24px)'})`,
            pointerEvents: showControls ? 'auto' : 'none',
          }}
          aria-hidden={!showControls}
        >
          {controlsPanel}
        </aside>

        {/* The dock: panels left, Run/Stop in the middle, Export / Save / More right */}
        <input
          ref={fontInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await uploadFont(project.id, file);
              setProject(prev => prev ? { ...prev, fonts: Array.from(new Set([...(prev.fonts ?? []), file.name])), lastModified: Date.now() } : prev);
            } catch (error) {
              alert(`Couldn't add the font: ${(error as Error).message}`);
            }
          }}
        />
        <div className="dial-surface absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 p-1">
          {dockToggle(
            showCode || showControls,
            () => { const show = !(showCode || showControls); setShowCode(show); setShowControls(show); },
            'panels',
            <PanelsLeftRight className="w-4 h-4" />
          )}
          <button
            onClick={isRunning ? handleStop : handleStart}
            title={isRunning ? 'Stop sketch' : 'Run sketch'}
            className="mx-1 h-9 w-9 flex items-center justify-center rounded-lg bg-[rgb(var(--ink))] text-[var(--chrome)] hover:bg-[rgb(var(--ink)/0.85)] transition-colors"
          >
            {isRunning ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
          </button>
          <span ref={setDockToolsEl} className="flex items-center" />
          <ProjectManager currentProject={project} onProjectChange={setProject} compact />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="More"
                className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-[rgb(var(--ink)/0.1)] hover:text-foreground data-[state=open]:bg-[rgb(var(--ink)/0.11)] data-[state=open]:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-52">
              <DropdownMenuCheckboxItem checked={showConsole} onCheckedChange={(v) => setShowConsole(!!v)}>
                Console
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={tintPanels} onCheckedChange={(v) => setTintPanels(!!v)}>
                Adapt panels to canvas
              </DropdownMenuCheckboxItem>
              <FontsSubmenu project={project} onProjectChange={setProject} onAdd={() => fontInputRef.current?.click()} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={createNewSketch}>
                <Plus className="mr-2 h-4 w-4" />
                New sketch
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLayoutMode('columns')}>
                <Columns3 className="mr-2 h-4 w-4" />
                Columns layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {listener}
      </div>
    );
  }

  // ---- Columns layout ----

  return (
    <div className="h-screen bg-background flex flex-col p-2 pt-0 overflow-hidden">
      <header className="h-12 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-0.5 min-w-0">
          {backButton}
          <div className="ml-1.5">{nameInput}</div>
        </div>

        <div className="flex items-center gap-1.5">
          <FontsMenu project={project} onProjectChange={setProject} />
          <ProjectManager currentProject={project} onProjectChange={setProject} />
          {layoutSwitch}
          {connection}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-0 min-w-0 min-h-0">
          {/* Editor Section with Console */}
          <div
            className="w-full h-1/2 md:h-full md:w-[var(--code-w)] md:shrink-0 flex flex-col min-w-0 min-h-0"
            style={{ '--code-w': `${codeWidth}px` } as React.CSSProperties}
          >
            <div className="panel flex-1 flex flex-col min-h-0">{codePanel}</div>
            {consoleHandle}
            <div style={{ height: `${consoleHeight}px` }} className="panel shrink-0 min-w-0">{consolePanel}</div>
          </div>

          <ResizeHandle
            axis="x"
            value={codeWidth}
            onChange={setCodeWidth}
            min={260}
            max={960}
            onReset={() => setCodeWidth(LAYOUT_DEFAULTS.codeWidth)}
            className="hidden md:flex"
          />

          {/* Preview Section */}
          <div className="panel w-full h-1/2 md:h-full md:flex-1 min-w-0 bg-black">{preview}</div>

          <ResizeHandle
            axis="x"
            value={controlsWidth}
            onChange={setControlsWidth}
            min={220}
            max={520}
            invert
            onReset={() => setControlsWidth(LAYOUT_DEFAULTS.controlsWidth)}
            className="hidden lg:flex"
          />

          {/* Controls: the sketch's dials, docked */}
          <aside className="panel shrink-0 hidden lg:flex flex-col" style={{ width: controlsWidth }}>
            {controlsPanel}
          </aside>
        </div>
      </div>

      {listener}
    </div>
  );
} 