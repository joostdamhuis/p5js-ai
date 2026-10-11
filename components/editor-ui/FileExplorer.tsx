import { useState } from 'react';
import { Project, ProjectFile, getFileTypeFromName, FileType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { uploadFont, removeFont, fontFamily } from '@/lib/projects';
import {
  FileText,
  FileCode,
  File,
  FileImage,
  FileAudio,
  Plus,
  Trash2,
  Download,
  Upload,
  MoreHorizontal,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface FileExplorerProps {
  project: Project;
  onProjectChange: (project: Project) => void;
  onFileSelect: (fileId: string) => void;
}

const FileTypeIcon = ({ type }: { type: FileType }) => {
  switch (type) {
    case 'js':
      return <FileCode className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    case 'html':
      return <FileCode className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    case 'css':
      return <File className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    case 'jpg':
    case 'png':
    case 'gif':
      return <FileImage className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    case 'mp3':
    case 'wav':
      return <FileAudio className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    case 'json':
      return <File className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
    default:
      return <FileText className="w-3.5 h-3.5 mr-2 shrink-0 opacity-60" />;
  }
};

const FileExplorer = ({ project, onProjectChange, onFileSelect }: FileExplorerProps) => {
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [fileToRename, setFileToRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleFileSelect = (fileId: string) => {
    onFileSelect(fileId);
  };

  const handleAddFile = () => {
    if (!newFileName) return;

    // Generate unique ID
    const fileId = `file-${Date.now()}`;
    const fileType = getFileTypeFromName(newFileName);

    // Create default content based on file type
    let defaultContent = '';
    if (fileType === 'js') {
      defaultContent = '// Your code goes here\n';
    } else if (fileType === 'html') {
      defaultContent = '<!DOCTYPE html>\n<html>\n<head>\n  <title>Page Title</title>\n</head>\n<body>\n\n</body>\n</html>';
    } else if (fileType === 'css') {
      defaultContent = '/* Your styles go here */\n';
    }

    const newFile: ProjectFile = {
      id: fileId,
      name: newFileName,
      content: defaultContent,
      type: fileType,
      lastModified: Date.now()
    };

    onProjectChange({
      ...project,
      files: [...project.files, newFile],
      activeFile: fileId,
      openTabs: [...project.openTabs, fileId],
      lastModified: Date.now()
    });

    setNewFileName('');
    setShowNewFileInput(false);
  };

  const handleDeleteFile = (fileId: string) => {
    const updatedFiles = project.files.filter(file => file.id !== fileId);

    // Remove from open tabs
    const updatedOpenTabs = project.openTabs.filter(id => id !== fileId);

    let activeFile = project.activeFile;
    if (project.activeFile === fileId) {
      activeFile = updatedOpenTabs.length > 0 ? updatedOpenTabs[0] : undefined;
    }

    onProjectChange({
      ...project,
      files: updatedFiles,
      openTabs: updatedOpenTabs,
      activeFile,
      lastModified: Date.now()
    });
  };

  const handleRenameFile = (fileId: string, newName: string) => {
    if (!newName.trim()) return;

    // Make sure the file extension is preserved
    let finalName = newName;
    const oldFile = project.files.find(f => f.id === fileId);

    if (oldFile) {
      const oldExt = oldFile.name.split('.').pop();
      const newExt = newName.split('.').pop();

      // If new name doesn't have an extension but old one did, add it
      if (oldExt && oldExt !== newExt) {
        finalName = `${newName}.${oldExt}`;
      }

      // Update the file type based on the new name
      const fileType = getFileTypeFromName(finalName);

      const updatedFiles = project.files.map(file => {
        if (file.id === fileId) {
          return {
            ...file,
            name: finalName,
            type: fileType,
            lastModified: Date.now()
          };
        }

        // Check for references to this file in HTML
        if (file.type === 'html' && oldFile) {
          let content = file.content;

          // Update script src attributes
          if (oldFile.type === 'js') {
            content = content.replace(
              new RegExp(`src=["']${oldFile.name}["']`, 'g'),
              `src="${finalName}"`
            );
          }

          // Update link href attributes
          if (oldFile.type === 'css') {
            content = content.replace(
              new RegExp(`href=["']${oldFile.name}["']`, 'g'),
              `href="${finalName}"`
            );
          }

          if (content !== file.content) {
            return {
              ...file,
              content,
              lastModified: Date.now()
            };
          }
        }

        return file;
      });

      onProjectChange({
        ...project,
        files: updatedFiles,
        lastModified: Date.now()
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Fonts are stored as files next to the sketch, not opened in the editor
    if (/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      e.target.value = '';
      try {
        await uploadFont(project.id, file);
        const fonts = Array.from(new Set([...(project.fonts ?? []), file.name]));
        onProjectChange({ ...project, fonts, lastModified: Date.now() });
      } catch (error) {
        alert(`Couldn't add the font: ${(error as Error).message}`);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const fileId = `file-${Date.now()}`;
        const fileType = getFileTypeFromName(file.name);

        const newFile: ProjectFile = {
          id: fileId,
          name: file.name,
          content,
          type: fileType,
          lastModified: Date.now()
        };

        onProjectChange({
          ...project,
          files: [...project.files, newFile],
          activeFile: fileId,
          lastModified: Date.now()
        });
      }
    };
    reader.readAsText(file);

    // Reset the file input
    e.target.value = '';
  };

  const handleDownloadProject = () => {
    // Create a zip file with all project files
    alert('Project download functionality will be implemented');
    // For now we could just download the active file
    if (project.activeFile) {
      const activeFile = project.files.find(file => file.id === project.activeFile);
      if (activeFile) {
        const element = document.createElement('a');
        const file = new Blob([activeFile.content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = activeFile.name;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }
    }
  };

  const startRenameFile = (fileId: string, currentName: string) => {
    setFileToRename(fileId);
    setRenameValue(currentName);
  };

  const completeRename = () => {
    if (fileToRename && renameValue.trim()) {
      handleRenameFile(fileToRename, renameValue);
    }
    setFileToRename(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between h-11 pl-3 pr-1.5 shrink-0">
        <h3 className="text-[13px] font-semibold text-foreground">Files</h3>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => document.getElementById('file-upload')?.click()}
            className="h-7 w-7"
            title="Upload a file or a font (.ttf, .otf, .woff)"
          >
            <Upload className="h-3.5 w-3.5" />
            <input
              id="file-upload"
              type="file"
              accept=".js,.html,.css,.txt,.json,.ttf,.otf,.woff,.woff2"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadProject}
            className="h-7 w-7"
            title="Download project"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNewFileInput(true)}
            className="h-7 w-7"
            title="Add new file"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showNewFileInput && (
        <div className="px-3 pb-1 flex items-center">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="filename.ext"
            className="h-8 text-[13px] rounded-lg bg-white/[0.05] border-none"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAddFile()}
            onBlur={() => {
              if (!newFileName) setShowNewFileInput(false);
              else handleAddFile();
            }}
          />
        </div>
      )}

      <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-px">
        {project.files.map((file) => (
          <div
            key={file.id}
            onClick={() => handleFileSelect(file.id)}
            className={cn(
              "group flex items-center justify-between h-8 pl-2.5 pr-1 rounded-lg cursor-pointer text-[13px] font-medium relative transition-colors",
              project.activeFile === file.id
                ? "bg-white/[0.11] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            )}
          >
            <div className="flex items-center overflow-hidden">
              <FileTypeIcon type={file.type} />
              <span className="truncate">{file.name}</span>
            </div>

            {fileToRename === file.id ? (
              <div className="absolute inset-0 flex items-center bg-card z-10">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') completeRename();
                    else if (e.key === 'Escape') setFileToRename(null);
                  }}
                  onBlur={completeRename}
                  className="h-8 text-[13px] rounded-lg bg-white/[0.11] border-none"
                />
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-70 hover:!opacity-100 data-[state=open]:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenameFile(file.id, file.name);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Rename</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        {(project.fonts?.length ?? 0) > 0 && (
          <>
            <h3 className="pt-4 pb-1.5 text-[13px] font-semibold text-foreground">Fonts</h3>
            {project.fonts!.map((font) => (
              <div
                key={font}
                className="group flex items-center justify-between h-8 pl-2.5 pr-1 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors"
                title={`Use in your sketch: textFont('${fontFamily(font)}')`}
              >
                <div className="flex items-center overflow-hidden">
                  <span className="w-3.5 mr-2 shrink-0 text-[11px] font-semibold opacity-60">Aa</span>
                  <span className="truncate">{fontFamily(font)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-70 hover:!opacity-100"
                  title="Remove font"
                  onClick={async () => {
                    await removeFont(project.id, font);
                    onProjectChange({ ...project, fonts: (project.fonts ?? []).filter(f => f !== font), lastModified: Date.now() });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default FileExplorer; 