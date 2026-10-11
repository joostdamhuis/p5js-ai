import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, DEFAULT_PROJECT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Save, Plus, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ProjectManagerProps {
  currentProject: Project;
  onProjectChange: (project: Project) => void;
}

// Always read the list fresh: the page autosaves into it while you edit,
// so a copy kept in state goes stale and would overwrite those edits.
const readProjects = (): Project[] => {
  try {
    return JSON.parse(localStorage.getItem('p5_projects') || '[]');
  } catch {
    return [];
  }
};

const ProjectManager = ({ currentProject, onProjectChange }: ProjectManagerProps) => {
  const router = useRouter();
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSaveProject = useCallback(() => {
    const projects = readProjects();
    const updatedProject = { ...currentProject, lastModified: Date.now() };
    const existingIndex = projects.findIndex(p => p.id === currentProject.id);

    if (existingIndex >= 0) projects[existingIndex] = updatedProject;
    else projects.push(updatedProject);

    localStorage.setItem('p5_projects', JSON.stringify(projects));
    onProjectChange(updatedProject);

    setJustSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1500);
  }, [currentProject, onProjectChange]);

  // Cmd/Ctrl + S saves
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveProject]);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const handleNewProject = () => {
    const projects = readProjects();
    const newProject = {
      ...DEFAULT_PROJECT,
      id: `project-${Date.now()}`,
      name: `Untitled Project ${projects.length + 1}`,
      lastModified: Date.now()
    };

    localStorage.setItem('p5_projects', JSON.stringify([...projects, newProject]));
    router.push(`/project/${newProject.id}`);
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSaveProject}
        title="Save project (⌘S). Changes also save automatically."
        className={justSaved ? 'text-foreground' : undefined}
      >
        {justSaved ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Save className="h-3.5 w-3.5" />}
        {justSaved ? 'Saved' : 'Save'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleNewProject}
        title="New project"
      >
        <Plus className="h-3.5 w-3.5" />
        New
      </Button>
    </div>
  );
};

export default ProjectManager;
