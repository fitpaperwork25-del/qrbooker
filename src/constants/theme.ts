export const ACCENT  = "#E8C547"; // gold
export const BG      = "#080808"; // near black
export const SURFACE = "#111111"; // card background
export const BORDER  = "rgba(255,255,255,0.08)";
export const TEXT    = "#F0EDE8"; // off white
export const MUTED   = "#666666"; // secondary text
export const GREEN   = "#4CAF50";
export const RED     = "#f44336";

export const theme = {
  accent:  ACCENT,
  bg:      BG,
  surface: SURFACE,
  border:  BORDER,
  text:    TEXT,
  muted:   MUTED,
  green:   GREEN,
  red:     RED,
} as const;

export type Theme = typeof theme;
