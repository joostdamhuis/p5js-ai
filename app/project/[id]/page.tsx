'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Editor from '@/components/editor-ui/Editor';
import Preview from '@/components/editor-ui/Preview';
import FileExplorer from '@/components/editor-ui/FileExplorer';
import ProjectManager from '@/components/editor-ui/ProjectManager';
import WebSocketListener, { McpStatus } from '@/components/editor-ui/WebSocketListener';
import Tabs from '@/components/editor-ui/Tabs';
import Console, { LogMessage } from '@/components/editor-ui/Console';
import ResizeHandle from '@/components/editor-ui/ResizeHandle';
import ConnectionStatus from '@/components/editor-ui/ConnectionStatus';
import { Project, ProjectFile, DEFAULT_PROJECT } from '@/lib/types';
import { fetchProject, saveProject, cacheProject } from '@/lib/projects';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelLeft } from 'lucide-react';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

const LAYOUT_KEY = 'p5_layout';
const MCP_KEY = 'p5_mcp';
const LAYOUT_DEFAULTS = { consoleHeight: 200, sidebarWidth: 224, codeWidth: 400, controlsWidth: 280 };

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Claude (MCP) is on by default; turning it off is remembered
  const [enableWsListener, setEnableWsListener] = useState(true);
  const [consoleMessages, setConsoleMessages] = useState<LogMessage[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(LAYOUT_DEFAULTS.consoleHeight);
  const [sidebarWidth, setSidebarWidth] = useState(LAYOUT_DEFAULTS.sidebarWidth);
  const [codeWidth, setCodeWidth] = useState(LAYOUT_DEFAULTS.codeWidth);
  const [controlsWidth, setControlsWidth] = useState(LAYOUT_DEFAULTS.controlsWidth);
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

  // Panel sizes are remembered per browser
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
      if (saved.consoleHeight) setConsoleHeight(saved.consoleHeight);
      if (saved.sidebarWidth) setSidebarWidth(saved.sidebarWidth);
      if (saved.codeWidth) setCodeWidth(saved.codeWidth);
      if (saved.controlsWidth) setControlsWidth(saved.controlsWidth);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ consoleHeight, sidebarWidth, codeWidth, controlsWidth }));
    } catch {}
  }, [consoleHeight, sidebarWidth, codeWidth, controlsWidth]);

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
        setSidebarOpen(!sidebarOpen);
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  const activeFile = project.activeFile
    ? project.files.find(f => f.id === project.activeFile)
    : null;

  return (
    <div className="h-screen bg-background flex flex-col p-2 pt-0 overflow-hidden">
      <header className="h-12 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-0.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackToDashboard}
            title="All projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide files' : 'Show files'}
            className={sidebarOpen ? 'text-foreground' : undefined}
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
          <input
            value={project.name}
            onChange={(e) => setProject({ ...project, name: e.target.value, lastModified: Date.now() })}
            className="ml-1.5 h-8 px-2 -mx-0 rounded-lg bg-transparent text-[13px] font-semibold text-foreground outline-none hover:bg-white/[0.05] focus:bg-white/[0.1] min-w-0 w-64 truncate transition-colors"
            title="Rename project"
            spellCheck={false}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <ProjectManager
            currentProject={project}
            onProjectChange={setProject}
          />

          <ConnectionStatus
            enabled={enableWsListener}
            onEnabledChange={setMcpEnabled}
            status={mcpStatus}
          />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* File Explorer Sidebar */}
        {sidebarOpen && (
          <>
            <aside className="panel shrink-0 hidden md:flex flex-col" style={{ width: sidebarWidth }}>
              <FileExplorer
                project={project}
                onProjectChange={setProject}
                onFileSelect={handleFileSelect}
              />
            </aside>
            <ResizeHandle
              axis="x"
              value={sidebarWidth}
              onChange={setSidebarWidth}
              min={160}
              max={420}
              onReset={() => setSidebarWidth(LAYOUT_DEFAULTS.sidebarWidth)}
              className="hidden md:flex"
            />
          </>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-0 min-w-0 min-h-0">
          {/* Editor Section with Console */}
          <div
            className="w-full h-1/2 md:h-full md:w-[var(--code-w)] md:shrink-0 flex flex-col min-w-0 min-h-0"
            style={{ '--code-w': `${codeWidth}px` } as React.CSSProperties}
          >
            <div className="panel flex-1 flex flex-col min-h-0">
              <Tabs
                project={project}
                onFileSelect={handleFileSelect}
                onCloseTab={handleCloseTab}
                isRunning={isRunning}
                onStart={handleStart}
                onStop={handleStop}
              />
              {activeFile ? (
                <div className="flex-1 overflow-hidden min-w-0">
                  <Editor
                    file={activeFile}
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground/60">
                  Open a file from the sidebar
                </div>
              )}
            </div>

            {/* Resize handle: the gap between code and console */}
            <ResizeHandle
              axis="y"
              value={consoleHeight}
              onChange={setConsoleHeight}
              min={50}
              max={600}
              invert
              onReset={() => setConsoleHeight(LAYOUT_DEFAULTS.consoleHeight)}
            />

            {/* Console */}
            <div style={{ height: `${consoleHeight}px` }} className="panel shrink-0 min-w-0">
              <Console
                messages={consoleMessages}
                onClear={clearConsole}
              />
            </div>
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
          <div className="panel w-full h-1/2 md:h-full md:flex-1 min-w-0 bg-black">
            <Preview
              project={project}
              onConsoleMessage={handleConsoleMessage}
              isRunning={isRunning}
              onDialsChange={setHasDials}
            />
          </div>

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
          </aside>
        </div>
      </div>

      {enableWsListener && (
        <WebSocketListener
          onCodeUpdate={handleCodeUpdate}
          onExecutionControl={handleExecutionControl}
          onConsoleControl={handleConsoleControl}
          onFileControl={handleFileControl}
          onLayoutControl={handleLayoutControl}
          onNavigationControl={handleNavigationControl}
          onStatusChange={setMcpStatus}
        />
      )}
    </div>
  );
} 