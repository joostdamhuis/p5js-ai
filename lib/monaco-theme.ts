import type { Monaco } from '@monaco-editor/react';

// Matches the "dark studio" tokens in app/globals.css
export const STUDIO_THEME = 'studio';

export const defineStudioTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(STUDIO_THEME, {
    base: 'vs-dark',
    inherit: true,
    // White tones only: hierarchy through brightness, not hue
    rules: [
      { token: '', foreground: 'c8c8c8' },
      { token: 'identifier', foreground: 'c8c8c8' },
      { token: 'keyword', foreground: 'ffffff' },
      { token: 'type', foreground: 'e6e6e6' },
      { token: 'tag', foreground: 'ffffff' },
      { token: 'attribute.name', foreground: 'c8c8c8' },
      { token: 'string', foreground: '9a9a9a' },
      { token: 'attribute.value', foreground: '9a9a9a' },
      { token: 'number', foreground: 'ffffff' },
      { token: 'regexp', foreground: '9a9a9a' },
      { token: 'delimiter', foreground: '7a7a7a' },
      { token: 'comment', foreground: '5c5c5c', fontStyle: 'italic' },
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
