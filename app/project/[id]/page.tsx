'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Editor from '@/components/editor-ui/Editor';
import Preview from '@/components/editor-ui/Preview';
import FileExplorer from '@/components/editor-ui/FileExplorer';
import ProjectManager from '@/components/editor-ui/ProjectManager';
import WebSocketListener from '@/components/editor-ui/WebSocketListener';
import Tabs from '@/components/editor-ui/Tabs';
import Console, { LogMessage } from '@/components/editor-ui/Console';
import { Project, ProjectFile, DEFAULT_PROJECT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelLeft } from 'lucide-react';

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [enableWsListener, setEnableWsListener] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<LogMessage[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const [isRunning, setIsRunning] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load project from localStorage
  useEffect(() => {
    const loadProject = () => {
      try {
        // First try to load from saved projects
        const savedProjects = localStorage.getItem('p5_projects');
        if (savedProjects) {
          const projects = JSON.parse(savedProjects);
          const foundProject = projects.find((p: Project) => p.id === projectId);

          if (foundProject) {
            // Ensure the project has openTabs property
            if (!foundProject.openTabs) {
              foundProject.openTabs = foundProject.files.map((f: ProjectFile) => f.id);
            }
            setProject(foundProject);
            localStorage.setItem('current_project', JSON.stringify(foundProject));
            setLoading(false);
            return;
          }
        }

        // If not found in saved projects, check current project
        const currentProject = localStorage.getItem('current_project');
        if (currentProject) {
          const parsed = JSON.parse(currentProject);
          if (parsed.id === projectId) {
            setProject(parsed);
            setLoading(false);
            return;
          }
        }

        // If project not found, redirect to dashboard
        console.error('Project not found:', projectId);
        router.push('/');
      } catch (error) {
        console.error('Error loading project:', error);
        router.push('/');
      }
    };

    loadProject();
  }, [projectId, router]);

  // Auto-save project changes
  useEffect(() => {
    if (project) {
      try {
        localStorage.setItem('current_project', JSON.stringify(project));

        // Also update in saved projects if it exists there
        const savedProjects = localStorage.getItem('p5_projects');
        if (savedProjects) {
          const projects = JSON.parse(savedProjects);
          const index = projects.findIndex((p: Project) => p.id === project.id);
          if (index !== -1) {
            projects[index] = project;
            localStorage.setItem('p5_projects', JSON.stringify(projects));
          }
        }
      } catch (error) {
        console.error('Error saving project:', error);
      }
    }
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
      <header className="h-12 flex items-center justify-between gap-3 px-1 shrink-0">
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
            className="ml-1.5 h-8 px-2 -mx-0 rounded-lg bg-transparent text-[13px] font-semibold text-foreground outline-none hover:bg-white/[0.04] focus:bg-white/[0.06] min-w-0 w-64 truncate transition-colors"
            title="Rename project"
            spellCheck={false}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <ProjectManager
            currentProject={project}
            onProjectChange={setProject}
          />

          <button
            onClick={() => setEnableWsListener(!enableWsListener)}
            title={enableWsListener ? 'Disconnect Claude (MCP)' : 'Let Claude control the editor (MCP)'}
            className={`flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium transition-colors ${enableWsListener
              ? 'bg-primary/[0.12] text-primary hover:bg-primary/[0.18]'
              : 'bg-white/[0.05] text-foreground hover:bg-white/[0.1]'
              }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${enableWsListener ? 'bg-primary' : 'bg-muted-foreground/60'}`} />
            {enableWsListener ? 'MCP connected' : 'Enable MCP'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-2 min-h-0">
        {/* File Explorer Sidebar */}
        {sidebarOpen && (
          <aside className="panel w-56 shrink-0 hidden md:flex flex-col">
            <FileExplorer
              project={project}
              onProjectChange={setProject}
              onFileSelect={handleFileSelect}
            />
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col md:flex-row gap-2 min-w-0 min-h-0">
          {/* Editor Section with Console */}
          <div className="w-full h-1/2 md:h-full md:w-1/2 md:max-w-[400px] md:shrink-0 flex flex-col min-w-0 min-h-0">
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

            {/* Resize handle: the gap between the two panels */}
            <div
              className="group h-2 shrink-0 cursor-row-resize flex items-center justify-center"
              onMouseDown={(e) => {
                const startY = e.clientY;
                const startHeight = consoleHeight;

                const handleMouseMove = (e: MouseEvent) => {
                  const deltaY = startY - e.clientY;
                  const newHeight = Math.max(50, Math.min(500, startHeight + deltaY));
                  setConsoleHeight(newHeight);
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <div className="h-0.5 w-8 rounded-full bg-white/0 group-hover:bg-white/20 transition-colors" />
            </div>

            {/* Console */}
            <div style={{ height: `${consoleHeight}px` }} className="panel shrink-0 min-w-0">
              <Console
                messages={consoleMessages}
                onClear={clearConsole}
              />
            </div>
          </div>

          {/* Preview Section */}
          <div className="panel w-full h-1/2 md:h-full md:flex-1 min-w-0 bg-black">
            <Preview
              project={project}
              onConsoleMessage={handleConsoleMessage}
              isRunning={isRunning}
            />
          </div>
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
        />
      )}
    </div>
  );
} 