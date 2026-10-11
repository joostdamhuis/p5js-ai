import type { Monaco } from '@monaco-editor/react';

// Matches the "dark studio" tokens in app/globals.css
export const STUDIO_THEME = 'studio';

export const defineStudioTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme(STUDIO_THEME, {
    base: 'vs-dark',
    // Don't inherit vs-dark's token colors (blue keywords, green numbers…)
    inherit: false,
    // Calm white tones: almost everything one soft white,
    // only text in quotes and comments step back
    rules: [
      { token: '', foreground: 'd0d0d0' },
      { token: 'string', foreground: '9e9e9e' },
      { token: 'attribute.value', foreground: '9e9e9e' },
      { token: 'regexp', foreground: '9e9e9e' },
      { token: 'comment', foreground: '6a6a6a', fontStyle: 'italic' },
      { token: 'comment.doc', foreground: '6a6a6a', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#212121',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#4a4a4a',
      'editorLineNumber.activeForeground': '#a6a6a6',
      'editorCursor.foreground': '#ffffff',
      'editor.selectionBackground': '#ffffff26',
      'editor.inactiveSelectionBackground': '#ffffff14',
      'editor.lineHighlightBackground': '#00000000',
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
