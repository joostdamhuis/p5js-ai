import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, DEFAULT_PROJECT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Save, Plus, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { fetchProjects, saveProject } from '@/lib/projects';

interface ProjectManagerProps {
  currentProject: Project;
  onProjectChange: (project: Project) => void;
}

const ProjectManager = ({ currentProject, onProjectChange }: ProjectManagerProps) => {
  const router = useRouter();
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Writes straight to the sketches folder (autosave also does this after typing)
  const handleSaveProject = useCallback(async () => {
    const updatedProject = { ...currentProject, lastModified: Date.now() };
    onProjectChange(updatedProject);
    try {
      await saveProject(updatedProject);
      setSaveState('saved');
    } catch (error) {
      console.error(error);
      setSaveState('failed');
    }
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState('idle'), 1800);
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

  const handleNewProject = async () => {
    const count = (await fetchProjects()).length;
    const newProject = {
      ...DEFAULT_PROJECT,
      id: `project-${Date.now()}`,
      name: `Untitled Project ${count + 1}`,
      lastModified: Date.now()
    };
    await saveProject(newProject).catch((error) => console.error(error));
    router.push(`/project/${newProject.id}`);
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSaveProject}
        title="Save to the sketches folder (⌘S). Changes also save automatically."
        className={saveState === 'saved' ? 'text-foreground' : saveState === 'failed' ? 'text-red-400' : undefined}
      >
        {saveState === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Save className="h-3.5 w-3.5" />}
        {saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Save failed' : 'Save'}
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
