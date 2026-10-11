import { useRef, useEffect } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { ProjectFile, FileType } from '@/lib/types';
import { STUDIO_THEME, defineStudioTheme } from '@/lib/monaco-theme';

interface EditorProps {
  file: ProjectFile;
  onChange: (value: string) => void;
  height?: string;
  className?: string;
  // Reports the code's full height, so a panel can fit its content
  onContentHeightChange?: (height: number) => void;
}

// Map file types to Monaco language
const getLanguage = (type: FileType): string => {
  switch (type) {
    case 'js':
      return 'javascript';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    default:
      return 'plaintext';
  }
};

const Editor = ({
  file,
  onChange,
  height = '100%',
  className,
  onContentHeightChange
}: EditorProps) => {
  const editorRef = useRef<any>(null);
  const onContentHeightRef = useRef(onContentHeightChange);
  onContentHeightRef.current = onContentHeightChange;

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Geist Mono may finish loading after Monaco measured its glyphs
    document.fonts.ready.then(() => monaco.editor.remeasureFonts());

    const report = () => onContentHeightRef.current?.(editor.getContentHeight());
    report();
    editor.onDidContentSizeChange(report);

    // Add p5.js intellisense (would require p5.d.ts to be loaded)
    // This is a placeholder for future enhancement
  };

  return (
    <div className={cn("w-full h-full overflow-hidden", className)}>
      <MonacoEditor
        height={height}
        language={getLanguage(file.type)}
        value={file.content}
        onChange={(value) => onChange(value || '')}
        beforeMount={defineStudioTheme}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontFamily: "'Geist Mono', monospace",
          fontWeight: '400',
          fontSize: 13,
          lineHeight: 22,
          tabSize: 2,
          automaticLayout: true,
          wordWrap: 'on',
          padding: { top: 8, bottom: 8 },
          overviewRulerBorder: false,
          bracketPairColorization: { enabled: false },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'none',
          stickyScroll: { enabled: false },
          wrappingIndent: 'indent',
          guides: { indentation: false },
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          matchBrackets: 'never',
          lightbulb: { enabled: 'off' as never },
          unicodeHighlight: { ambiguousCharacters: false },
          renderValidationDecorations: 'off',
          lineNumbersMinChars: 3,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          lineNumbers: 'on',
          roundedSelection: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
        }}
        theme={STUDIO_THEME}
      />
    </div>
  );
};

export default Editor; 