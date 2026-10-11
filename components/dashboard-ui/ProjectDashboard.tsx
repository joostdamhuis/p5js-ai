import { useState, useEffect } from 'react';
import { Project, DEFAULT_PROJECT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Plus,
  FolderOpen,
  Trash2,
  FileCode,
  Copy,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { fetchProjects, saveProject, deleteProject } from '@/lib/projects';

interface ProjectDashboardProps {
  onProjectSelect?: (project: Project) => void;
}

const ProjectDashboard = ({ onProjectSelect }: ProjectDashboardProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const router = useRouter();

  // Load projects from the sketches folder
  useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  const handleCreateProject = async () => {
    const newProject: Project = {
      ...DEFAULT_PROJECT,
      id: `project-${Date.now()}`,
      name: `Untitled Project ${projects.length + 1}`,
      lastModified: Date.now()
    };

    await saveProject(newProject).catch((error) => console.error(error));
    router.push(`/project/${newProject.id}`);
  };

  const handleOpenProject = (project: Project) => {
    router.push(`/project/${project.id}`);
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects(projects.filter(p => p.id !== projectId));
    deleteProject(projectId).catch((error) => console.error(error));
  };

  const handleDuplicateProject = (project: Project) => {
    const duplicatedProject: Project = {
      ...project,
      id: `project-${Date.now()}`,
      name: `${project.name} (Copy)`,
      lastModified: Date.now()
    };
    setProjects([...projects, duplicatedProject]);
    saveProject(duplicatedProject).catch((error) => console.error(error));
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getProjectPreview = (project: Project) => {
    const jsFile = project.files.find(f => f.type === 'js');
    if (jsFile) {
      const lines = jsFile.content.split('\n').slice(0, 3);
      return lines.join('\n');
    }
    return 'No JavaScript files';
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[15px] font-semibold">p5.js AI Editor</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {projects.length === 0
                ? 'Sketches you make will show up here'
                : `${projects.length} ${projects.length === 1 ? 'sketch' : 'sketches'}`}
            </p>
          </div>
          {projects.length > 0 && (
            <Button onClick={handleCreateProject} size="sm">
              <Plus className="h-3.5 w-3.5" />
              New sketch
            </Button>
          )}
        </header>

        {projects.length === 0 ? (
          <div className="panel flex flex-col items-center text-center py-20 px-6">
            <div className="w-10 h-10 mb-4 rounded-xl bg-white/[0.05] flex items-center justify-center">
              <FileCode className="w-4 h-4 text-muted-foreground" />
            </div>
            <h2 className="text-[13px] font-semibold">No sketches yet</h2>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5 max-w-xs">
              Start one and draw with code, or ask Claude to make one for you.
            </p>
            <Button onClick={handleCreateProject} size="sm">
              <Plus className="h-3.5 w-3.5" />
              New sketch
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleOpenProject(project)}
                className="panel group cursor-pointer p-1.5 transition-colors hover:bg-[#262626]"
              >
                <div className="rounded-lg bg-black/40 px-3 py-2.5 h-24 overflow-hidden">
                  <pre className="text-[11px] leading-[1.6] text-muted-foreground/70 font-mono overflow-hidden">
                    {getProjectPreview(project)}
                  </pre>
                </div>

                <div className="flex items-center justify-between gap-2 pl-2 pr-0.5 pt-2 pb-0.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{project.name}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {formatDate(project.lastModified)} · {project.files.length} files
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        title="More"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => handleOpenProject(project)}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateProject(project)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectDashboard; 