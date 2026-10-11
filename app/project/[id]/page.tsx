'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Editor from '@/components/editor-ui/Editor';
import Preview from '@/components/editor-ui/Preview';
import ProjectManager from '@/components/editor-ui/ProjectManager';
import WebSocketListener, { McpStatus } from '@/components/editor-ui/WebSocketListener';
import Tabs from '@/components/editor-ui/Tabs';
import Console, { LogMessage } from '@/components/editor-ui/Console';
import ResizeHandle from '@/components/editor-ui/ResizeHandle';
import ConnectionStatus from '@/components/editor-ui/ConnectionStatus';
import FontsMenu from '@/components/editor-ui/FontsMenu';
import { Project, ProjectFile, DEFAULT_PROJECT } from '@/lib/types';
import { fetchProject, saveProject, cacheProject } from '@/lib/projects';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelBottom, Columns3, Code2, SquareTerminal, SlidersHorizontal, Play } from 'lucide-react';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

const LAYOUT_KEY = 'p5_layout';
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
  const [dockToolsEl, setDockToolsEl] = useState<HTMLElement | null>(null);
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
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ consoleHeight, codeWidth, controlsWidth, layout: layoutMode, showCode, showConsole, showControls }));
    } catch {}
  }, [consoleHeight, codeWidth, controlsWidth, layoutMode, showCode, showConsole, showControls]);

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
          <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
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
      className="h-8 px-2 rounded-lg bg-transparent text-[13px] font-semibold text-foreground outline-none hover:bg-white/[0.05] focus:bg-white/[0.1] min-w-0 w-56 truncate transition-colors"
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
          <Editor file={activeFile} onChange={handleFileChange} />
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
    />
  );

  const controlsPanel = (
    <div className="flex-1 overflow-y-auto min-h-0">
      <DialRoot mode="inline" theme="dark" productionEnabled />
      {!hasDials && (
        <div className="px-3 pb-3">
          <h3 className="h-11 flex items-center text-[13px] font-semibold text-foreground">Controls</h3>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Sliders for your sketch show up here. Add a <code className="font-mono text-foreground/80">dials</code> line
            at the top of your sketch, or ask Claude for a sketch with controls.
          </p>
          <pre className="mt-3 rounded-lg bg-white/[0.05] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-muted-foreground overflow-x-auto">{`const dial = dials({
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
    const floating = 'panel !bg-[#212121]/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col';
    const dockToggle = (on: boolean, toggle: () => void, label: string, icon: React.ReactNode) => (
      <button
        onClick={toggle}
        title={`${on ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={on}
        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${on ? 'bg-white/[0.11] text-foreground' : 'text-muted-foreground hover:bg-white/[0.1] hover:text-foreground'}`}
      >
        {icon}
      </button>
    );
    const divider = <span className="mx-1 h-5 w-px bg-white/10" />;

    return (
      <div className="h-screen relative bg-black overflow-hidden">
        <div className="absolute inset-0">{preview}</div>

        {/* Top corners */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5 p-1 rounded-xl bg-[#212121]/85 backdrop-blur-xl border border-white/10">
          {backButton}
          {nameInput}
        </div>
        <div className="absolute top-2 right-2 z-20">{connection}</div>

        {/* Left: files and code + console */}
        <div className="absolute left-2 top-14 bottom-20 z-10 flex gap-2 pointer-events-none">
          {(showCode || showConsole) && (
            <div className="flex flex-col min-h-0 pointer-events-auto" style={{ width: codeWidth }}>
              {showCode && <div className={`${floating} flex-1 min-h-0`}>{codePanel}</div>}
              {showCode && showConsole && consoleHandle}
              {showConsole && (
                <div className={`${floating} shrink-0 ${showCode ? '' : 'mt-auto'}`} style={{ height: consoleHeight }}>{consolePanel}</div>
              )}
            </div>
          )}
        </div>

        {/* Right: controls */}
        {showControls && (
          <aside className={`${floating} absolute right-2 top-14 bottom-20 z-10`} style={{ width: controlsWidth }}>
            {controlsPanel}
          </aside>
        )}

        {/* The dock */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 p-1.5 rounded-2xl bg-[#212121]/90 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {dockToggle(showCode, () => setShowCode(!showCode), 'code', <Code2 className="w-4 h-4" />)}
          {dockToggle(showConsole, () => setShowConsole(!showConsole), 'console', <SquareTerminal className="w-4 h-4" />)}
          {dockToggle(showControls, () => setShowControls(!showControls), 'controls', <SlidersHorizontal className="w-4 h-4" />)}
          <FontsMenu project={project} onProjectChange={setProject} />
          {divider}
          <button
            onClick={isRunning ? handleStop : handleStart}
            title={isRunning ? 'Stop sketch' : 'Run sketch'}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium transition-colors ${isRunning ? 'bg-white/[0.05] text-foreground hover:bg-white/[0.1]' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
          >
            {isRunning ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Stop</> : <><Play className="h-3.5 w-3.5" />Run</>}
          </button>
          {divider}
          <span ref={setDockToolsEl} className="flex items-center" />
          {divider}
          <ProjectManager currentProject={project} onProjectChange={setProject} />
          {divider}
          {layoutSwitch}
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