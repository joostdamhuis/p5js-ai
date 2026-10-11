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
      // Bright enough to stay legible when the panel is tinted by the canvas
      { token: '', foreground: 'e6e6e6' },
      { token: 'string', foreground: 'b8b8b8' },
      { token: 'attribute.value', foreground: 'b8b8b8' },
      { token: 'regexp', foreground: 'b8b8b8' },
      { token: 'comment', foreground: '8f8f8f', fontStyle: 'italic' },
      { token: 'comment.doc', foreground: '8f8f8f', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#00000000',
      // Transparent so the panel's tint shows through; no blue focus outline
      'focusBorder': '#00000000',
      // No shadow under the tab bar when the code is scrolled
      'scrollbar.shadow': '#00000000',
      'editorGutter.background': '#00000000',
      'editor.foreground': '#e6e6e6',
      // White with alpha instead of grey: reads on any tint
      'editorLineNumber.foreground': '#ffffff40',
      'editorLineNumber.activeForeground': '#ffffffb3',
      // Brackets in the text colour, not yellow / pink / blue
      'editorBracketHighlight.foreground1': '#e6e6e6',
      'editorBracketHighlight.foreground2': '#e6e6e6',
      'editorBracketHighlight.foreground3': '#e6e6e6',
      'editorBracketHighlight.foreground4': '#e6e6e6',
      'editorBracketHighlight.foreground5': '#e6e6e6',
      'editorBracketHighlight.foreground6': '#e6e6e6',
      'editorBracketHighlight.unexpectedBracket.foreground': '#e6e6e6',
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

// Light version for light panels: the same calm hierarchy in black tones
export const STUDIO_LIGHT_THEME = 'studio-light';

export const defineStudioLightTheme = (monaco: Monaco) => {
  const black = (alpha: string) => `#000000${alpha}`;
  monaco.editor.defineTheme(STUDIO_LIGHT_THEME, {
    base: 'vs',
    inherit: false,
    rules: [
      { token: '', foreground: '1f1f1f' },
      { token: 'string', foreground: '555555' },
      { token: 'attribute.value', foreground: '555555' },
      { token: 'regexp', foreground: '555555' },
      { token: 'comment', foreground: '8a8a8a', fontStyle: 'italic' },
      { token: 'comment.doc', foreground: '8a8a8a', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': '#1f1f1f',
      'focusBorder': '#00000000',
      'scrollbar.shadow': '#00000000',
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': black('40'),
      'editorLineNumber.activeForeground': black('b3'),
      'editorCursor.foreground': '#000000',
      'editor.selectionBackground': black('1f'),
      'editor.inactiveSelectionBackground': black('12'),
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': black('0a'),
      'editorIndentGuide.activeBackground1': black('1a'),
      'editorBracketHighlight.foreground1': '#1f1f1f',
      'editorBracketHighlight.foreground2': '#1f1f1f',
      'editorBracketHighlight.foreground3': '#1f1f1f',
      'editorBracketHighlight.foreground4': '#1f1f1f',
      'editorBracketHighlight.foreground5': '#1f1f1f',
      'editorBracketHighlight.foreground6': '#1f1f1f',
      'editorBracketHighlight.unexpectedBracket.foreground': '#1f1f1f',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': black('1a'),
      'editorSuggestWidget.selectedBackground': black('0f'),
      'scrollbarSlider.background': black('14'),
      'scrollbarSlider.hoverBackground': black('24'),
      'scrollbarSlider.activeBackground': black('33'),
    },
  });
};
