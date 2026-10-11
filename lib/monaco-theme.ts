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
      { token: 'keyword', foreground: 'c4b5fd' },
      { token: 'string', foreground: 'b5d4a8' },
      { token: 'number', foreground: 'f0c38e' },
      { token: 'regexp', foreground: 'f0c38e' },
      { token: 'type', foreground: '9cc4f0' },
      { token: 'identifier', foreground: 'd4d4d4' },
      { token: 'delimiter', foreground: 'a6a6a6' },
      { token: 'tag', foreground: 'c4b5fd' },
      { token: 'attribute.name', foreground: '9cc4f0' },
      { token: 'attribute.value', foreground: 'b5d4a8' },
    ],
    colors: {
      'editor.background': '#212121',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#555555',
      'editorLineNumber.activeForeground': '#a6a6a6',
      'editorCursor.foreground': '#ffffff',
      'editor.selectionBackground': '#ffffff26',
      'editor.inactiveSelectionBackground': '#ffffff14',
      'editor.lineHighlightBackground': '#ffffff0d',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#ffffff0a',
      'editorIndentGuide.activeBackground1': '#ffffff1f',
      'editorBracketMatch.background': '#ffffff14',
      'editorBracketMatch.border': '#ffffff40',
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
