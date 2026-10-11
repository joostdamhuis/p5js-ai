import type { Monaco } from '@monaco-editor/react';

// Matches the "dark studio" tokens in app/globals.css
export const STUDIO_THEME = 'studio';

export const defineStudioTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(STUDIO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd4d4d4' },
      { token: 'comment', foreground: '7a7a7a', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f5a524' },
      { token: 'string', foreground: 'd7c9a7' },
      { token: 'number', foreground: 'e8a87c' },
      { token: 'regexp', foreground: 'e8a87c' },
      { token: 'type', foreground: '9fb0d0' },
      { token: 'identifier', foreground: 'd4d4d4' },
      { token: 'delimiter', foreground: 'a6a6a6' },
      { token: 'tag', foreground: 'f5a524' },
      { token: 'attribute.name', foreground: '9fb0d0' },
      { token: 'attribute.value', foreground: 'd7c9a7' },
    ],
    colors: {
      'editor.background': '#212121',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#555555',
      'editorLineNumber.activeForeground': '#a6a6a6',
      'editorCursor.foreground': '#f5a524',
      'editor.selectionBackground': '#f5a52433',
      'editor.inactiveSelectionBackground': '#f5a5241a',
      'editor.lineHighlightBackground': '#ffffff0d',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#ffffff0a',
      'editorIndentGuide.activeBackground1': '#ffffff1f',
      'editorBracketMatch.background': '#f5a5241f',
      'editorBracketMatch.border': '#f5a52466',
      'editorWidget.background': '#2a2a2a',
      'editorWidget.border': '#ffffff12',
      'editorSuggestWidget.selectedBackground': '#ffffff14',
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#ffffff10',
      'scrollbarSlider.hoverBackground': '#ffffff1c',
      'scrollbarSlider.activeBackground': '#ffffff28',
    },
  });
};
