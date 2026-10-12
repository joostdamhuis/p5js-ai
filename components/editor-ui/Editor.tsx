import { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { ProjectFile, FileType } from '@/lib/types';
import { STUDIO_THEME, STUDIO_LIGHT_THEME, defineStudioTheme, defineStudioLightTheme } from '@/lib/monaco-theme';

interface EditorProps {
  file: ProjectFile;
  onChange: (value: string) => void;
  height?: string;
  className?: string;
  // Reports the code's full height, so a panel can fit its content
  onContentHeightChange?: (height: number) => void;
  // Light panels (over a light canvas)
  light?: boolean;
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
  onContentHeightChange,
  light
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

  // Changes from outside (Controls panel, Claude): edit only the characters that
  // differ, instead of replacing the whole file. A full replace re-renders every
  // line, which made the code flicker while dragging a control.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    const current: string = model.getValue();
    const next = file.content;
    if (current === next) return;
    let start = 0;
    const max = Math.min(current.length, next.length);
    while (start < max && current[start] === next[start]) start++;
    let end = 0;
    while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end]) end++;
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(current.length - end);
    model.pushEditOperations(
      [],
      [{ range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column }, text: next.slice(start, next.length - end) }],
      () => null
    );
  }, [file.content]);

  return (
    <div className={cn("w-full h-full overflow-hidden", className)}>
      <MonacoEditor
        height={height}
        language={getLanguage(file.type)}
        // One model per file; outside changes go through the effect above
        path={file.id}
        defaultValue={file.content}
        onChange={(value) => onChange(value || '')}
        beforeMount={(monaco) => { defineStudioTheme(monaco); defineStudioLightTheme(monaco); }}
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
          // Room for three-digit line numbers without touching the panel edge
          lineNumbersMinChars: 4,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
          lineNumbers: 'on',
          roundedSelection: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
        }}
        theme={light ? STUDIO_LIGHT_THEME : STUDIO_THEME}
      />
    </div>
  );
};

export default Editor; 