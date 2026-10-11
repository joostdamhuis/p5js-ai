import { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface TabsProps {
  project: Project;
  onFileSelect: (fileId: string) => void;
  onCloseTab?: (fileId: string) => void;
}

const Tabs = ({ project, onFileSelect, onCloseTab }: TabsProps) => {
  const activeFileId = project.activeFile;

  // Get only the files that are in the openTabs array
  const openFiles = project.files.filter(file =>
    project.openTabs.includes(file.id)
  );

  return (
    <div className="flex items-center gap-1.5 h-11 px-1.5 shrink-0">
      {/* File tabs */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
        {openFiles.map((file) => {
          const isActive = activeFileId === file.id;
          return (
            <div
              key={file.id}
              onClick={() => onFileSelect(file.id)}
              className={cn(
                "group flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-[7px] text-[13px] font-medium cursor-pointer whitespace-nowrap transition-colors",
                isActive
                  ? "bg-[rgb(var(--ink)/0.05)] text-foreground"
                  : "text-muted-foreground hover:bg-[rgb(var(--ink)/0.1)] hover:text-foreground"
              )}
            >
              <span className="truncate max-w-[120px]">{file.name}</span>

              {onCloseTab && (
                <button
                  className={cn(
                    "p-0.5 rounded hover:bg-[rgb(var(--ink)/0.1)] transition-opacity",
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

    </div>
  );
};

export default Tabs;
