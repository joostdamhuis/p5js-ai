import { useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Project } from '@/lib/types';
import { uploadFont, removeFont, fontFamily } from '@/lib/projects';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FontsMenuProps {
  project: Project;
  onProjectChange: (project: Project) => void;
  className?: string;
}

// "Aa" button: the sketch's uploaded fonts, add one, or remove one.
// Sketches use them with textFont('<name>').
const FontsMenu = ({ project, onProjectChange, className }: FontsMenuProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const fonts = project.fonts ?? [];

  const addFont = async (file: File) => {
    try {
      await uploadFont(project.id, file);
      onProjectChange({ ...project, fonts: Array.from(new Set([...fonts, file.name])), lastModified: Date.now() });
    } catch (error) {
      alert(`Couldn't add the font: ${(error as Error).message}`);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) addFont(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title="Fonts"
            className={className ?? 'h-8 w-8 flex items-center justify-center rounded-lg text-[12px] font-semibold text-muted-foreground hover:bg-white/[0.1] hover:text-foreground data-[state=open]:bg-white/[0.11] data-[state=open]:text-foreground transition-colors'}
          >
            Aa
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-64">
          {fonts.length === 0 ? (
            <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
              No fonts yet. Add a .ttf, .otf or .woff file and use it with textFont(&apos;Name&apos;).
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
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <Plus className="mr-2 h-4 w-4" />
            Add font
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default FontsMenu;
