import { Plus, Trash2, Type } from 'lucide-react';
import { Project } from '@/lib/types';
import { removeFont, fontFamily } from '@/lib/projects';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

interface FontsMenuProps {
  project: Project;
  onProjectChange: (project: Project) => void;
  className?: string;
}

// Same list as a submenu (for the dock's More menu). The file picker lives
// outside the menu (onAdd), because menu content unmounts when it closes.
export const FontsSubmenu = ({ project, onProjectChange, onAdd }: FontsMenuProps & { onAdd: () => void }) => {
  const fonts = project.fonts ?? [];
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Type className="mr-2 h-4 w-4" />
        Fonts{fonts.length ? ` (${fonts.length})` : ''}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-60">
        {fonts.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
            No fonts yet. Use them with textFont(&apos;Name&apos;).
          </div>
        ) : (
          fonts.map((font) => (
            <DropdownMenuItem
              key={font}
              onSelect={(e) => e.preventDefault()}
              className="group flex items-center justify-between gap-2"
              title={`Use in your sketch: textFont('${fontFamily(font)}')`}
            >
              <span className="truncate">{fontFamily(font)}</span>
              <button
                title="Remove font"
                className="opacity-0 group-hover:opacity-70 hover:!opacity-100"
                onClick={async () => {
                  await removeFont(project.id, font);
                  onProjectChange({ ...project, fonts: fonts.filter(f => f !== font), lastModified: Date.now() });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add font
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
