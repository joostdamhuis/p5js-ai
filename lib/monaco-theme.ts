import type { Monaco } from '@monaco-editor/react';

// Matches the "dark studio" tokens in app/globals.css
export const STUDIO_THEME = 'studio';

export const defineStudioTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(STUDIO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'c8cddb' },
      { token: 'comment', foreground: '5c6480', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f5a524' },
      { token: 'string', foreground: 'd7c9a7' },
      { token: 'number', foreground: 'e8a87c' },
      { token: 'regexp', foreground: 'e8a87c' },
      { token: 'type', foreground: '9fb0d0' },
      { token: 'identifier', foreground: 'c8cddb' },
      { token: 'delimiter', foreground: '8b92a6' },
      { token: 'tag', foreground: 'f5a524' },
      { token: 'attribute.name', foreground: '9fb0d0' },
      { token: 'attribute.value', foreground: 'd7c9a7' },
    ],
    colors: {
      'editor.background': '#0c0f17',
      'editor.foreground': '#c8cddb',
      'editorLineNumber.foreground': '#3a4157',
      'editorLineNumber.activeForeground': '#8b92a6',
      'editorCursor.foreground': '#f5a524',
      'editor.selectionBackground': '#f5a52433',
      'editor.inactiveSelectionBackground': '#f5a5241a',
      'editor.lineHighlightBackground': '#ffffff06',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#ffffff0a',
      'editorIndentGuide.activeBackground1': '#ffffff1f',
      'editorBracketMatch.background': '#f5a5241f',
      'editorBracketMatch.border': '#f5a52466',
      'editorWidget.background': '#121623',
      'editorWidget.border': '#ffffff12',
      'editorSuggestWidget.selectedBackground': '#1a1f2e',
      'scrollbarSlider.background': '#ffffff10',
      'scrollbarSlider.hoverBackground': '#ffffff1c',
      'scrollbarSlider.activeBackground': '#ffffff28',
    },
  });
};
