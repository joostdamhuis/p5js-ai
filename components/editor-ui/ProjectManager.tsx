import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, DEFAULT_PROJECT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Save, Plus, Check, Loader2, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { fetchProjects, saveProject, publishSketches } from '@/lib/projects';

interface ProjectManagerProps {
  currentProject: Project;
  onProjectChange: (project: Project) => void;
  // Dock: just a round Save icon (New lives in the dock's More menu)
  compact?: boolean;
}

const ProjectManager = ({ currentProject, onProjectChange, compact }: ProjectManagerProps) => {
  const router = useRouter();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'pushed' | 'local' | 'failed'>('idle');
  const [saveNote, setSaveNote] = useState('');
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Writes to the sketches folder, then commits and pushes it to GitHub.
  // (Autosave only writes the folder.)
  const handleSaveProject = useCallback(async () => {
    const updatedProject = { ...currentProject, lastModified: Date.now() };
    onProjectChange(updatedProject);
    clearTimeout(savedTimer.current);
    setSaveState('saving');
    setSaveNote('');
    try {
      await saveProject(updatedProject);
      // Fresh dashboard thumbnail of what's on the canvas right now
      window.dispatchEvent(new Event('p5:capture-thumbnail'));
      const result = await publishSketches(updatedProject.name);
      if (result.status === 'saved-locally') {
        setSaveState('local');
        setSaveNote(result.reason);
      } else {
        setSaveState('pushed');
      }
    } catch (error) {
      console.error(error);
      setSaveState('failed');
    }
    savedTimer.current = setTimeout(() => setSaveState('idle'), 2500);
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

  if (compact) {
    return (
      <button
        onClick={handleSaveProject}
        disabled={saveState === 'saving'}
        title={saveState === 'local'
          ? `Saved on this Mac, not on GitHub: ${saveNote}`
          : saveState === 'pushed' ? 'Saved to GitHub' : 'Save and back up to GitHub (⌘S)'}
        className={cn(
          'h-9 w-9 flex items-center justify-center rounded-[9px] transition-colors hover:bg-[rgb(var(--ink)/0.1)]',
          saveState === 'local' ? 'text-amber-300' : saveState === 'failed' ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" />
          : saveState === 'pushed' ? <Check className="h-4 w-4 text-foreground" />
            : saveState === 'local' ? <CloudOff className="h-4 w-4" />
              : <Save className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSaveProject}
        disabled={saveState === 'saving'}
        title={saveState === 'local'
          ? `Saved on this Mac, not on GitHub: ${saveNote}`
          : 'Save and back up to GitHub (⌘S). Changes also save to this Mac automatically.'}
        className={cn(
          'min-w-[76px]',
          (saveState === 'pushed' || saveState === 'saving') && 'text-foreground',
          saveState === 'local' && 'text-amber-300',
          saveState === 'failed' && 'text-red-400'
        )}
      >
        {saveState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : saveState === 'pushed' ? <Check className="h-3.5 w-3.5 text-foreground" />
            : saveState === 'local' ? <CloudOff className="h-3.5 w-3.5" />
              : <Save className="h-3.5 w-3.5" />}
        {saveState === 'saving' ? 'Saving…'
          : saveState === 'pushed' ? 'Saved to GitHub'
            : saveState === 'local' ? 'Saved on Mac'
              : saveState === 'failed' ? 'Save failed'
                : 'Save'}
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
