import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { X, Play } from 'lucide-react';

interface TabsProps {
  project: Project;
  onFileSelect: (fileId: string) => void;
  onCloseTab?: (fileId: string) => void;
  isRunning?: boolean;
  onStart?: () => void;
  onStop?: () => void;
}

const Tabs = ({ project, onFileSelect, onCloseTab, isRunning = false, onStart, onStop }: TabsProps) => {
  const activeFileId = project.activeFile;

  // Get only the files that are in the openTabs array
  const openFiles = project.files.filter(file =>
    project.openTabs.includes(file.id)
  );

  return (
    <div className="flex items-center gap-2 h-11 px-1.5 shrink-0">
      {/* File tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
        {openFiles.map((file) => {
          const isActive = activeFileId === file.id;
          return (
            <div
              key={file.id}
              onClick={() => onFileSelect(file.id)}
              className={cn(
                "group flex items-center gap-1 h-8 pl-2.5 pr-1 rounded-lg text-[13px] font-medium cursor-pointer whitespace-nowrap transition-colors",
                isActive
                  ? "bg-white/[0.11] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              )}
            >
              <span className="truncate max-w-[120px]">{file.name}</span>

              {onCloseTab && (
                <button
                  className={cn(
                    "p-0.5 rounded hover:bg-white/10 transition-opacity",
                    isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(file.id);
                  }}
                  title="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Run toggle: green dot while the sketch runs */}
      {onStart && onStop && (
        <button
          onClick={isRunning ? onStop : onStart}
          title={isRunning ? 'Stop sketch' : 'Run sketch'}
          className={cn(
            "flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium shrink-0 transition-colors",
            isRunning
              ? "bg-white/[0.05] text-foreground hover:bg-white/[0.1]"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isRunning ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default Tabs;
