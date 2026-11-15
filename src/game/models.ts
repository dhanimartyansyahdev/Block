export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface BlockColor {
  id: string;
  name: string;
  base: string;
  light: string;
  dark: string;
  highlight: string;
  glow: string;
}

export const BLOCK_COLORS: readonly BlockColor[] = [
  {
    id: 'sapphire',
    name: 'Sapphire',
    base: '#3B82F6',
    light: '#60A5FA',
    dark: '#1D4ED8',
    highlight: '#BFDBFE',
    glow: 'rgba(59, 130, 246, 0.45)',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    base: '#EF4444',
    light: '#F87171',
    dark: '#B91C1C',
    highlight: '#FECACA',
    glow: 'rgba(239, 68, 68, 0.45)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    base: '#10B981',
    light: '#34D399',
    dark: '#047857',
    highlight: '#A7F3D0',
    glow: 'rgba(16, 185, 129, 0.45)',
  },
  {
    id: 'amber',
    name: 'Amber',
    base: '#F59E0B',
    light: '#FBBF24',
    dark: '#B45309',
    highlight: '#FDE68A',
    glow: 'rgba(245, 158, 11, 0.45)',
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    base: '#8B5CF6',
    light: '#A78BFA',
    dark: '#6D28D9',
    highlight: '#DDD6FE',
    glow: 'rgba(139, 92, 246, 0.45)',
  },
  {
    id: 'cyan',
    name: 'Cyan',
    base: '#06B6D4',
    light: '#22D3EE',
    dark: '#0E7490',
    highlight: '#A5F3FC',
    glow: 'rgba(6, 182, 212, 0.45)',
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    base: '#F97316',
    light: '#FB923C',
    dark: '#C2410C',
    highlight: '#FED7AA',
    glow: 'rgba(249, 115, 22, 0.45)',
  },
] as const;

export const COLOR_BY_ID: Record<string, BlockColor> = Object.fromEntries(
  BLOCK_COLORS.map((c) => [c.id, c]),
);

export interface PieceTemplate {
  id: string;
  label: string;
  matrix: number[][];
  weight: number;
  easy: boolean;
}

export const PIECE_TEMPLATES: readonly PieceTemplate[] = [
  // Single & Lines
  { id: '1x1', label: '1×1 Dot', matrix: [[1]], weight: 6, easy: true },
  { id: '1x2', label: '1×2 Bar', matrix: [[1, 1]], weight: 8, easy: true },
  { id: '2x1', label: '2×1 Bar', matrix: [[1], [1]], weight: 8, easy: true },
  { id: '1x3', label: '1×3 Line', matrix: [[1, 1, 1]], weight: 7, easy: true },
  { id: '3x1', label: '3×1 Line', matrix: [[1], [1], [1]], weight: 7, easy: true },
  { id: '1x4', label: '1×4 Line', matrix: [[1, 1, 1, 1]], weight: 5, easy: false },
  { id: '4x1', label: '4×1 Line', matrix: [[1], [1], [1], [1]], weight: 5, easy: false },
  { id: '1x5', label: '1×5 Line', matrix: [[1, 1, 1, 1, 1]], weight: 3, easy: false },
  { id: '5x1', label: '5×1 Line', matrix: [[1], [1], [1], [1], [1]], weight: 3, easy: false },

  // Squares
  {
    id: '2x2',
    label: '2×2 Square',
    matrix: [
      [1, 1],
      [1, 1],
    ],
    weight: 9,
    easy: true,
  },
  {
    id: '3x3',
    label: '3×3 Block',
    matrix: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    weight: 3,
    easy: false,
  },

  // Small 2x2 Corners (3 cells)
  {
    id: 'c3_tl',
    label: 'Mini Corner',
    matrix: [
      [1, 1],
      [1, 0],
    ],
    weight: 6,
    easy: true,
  },
  {
    id: 'c3_tr',
    label: 'Mini Corner',
    matrix: [
      [1, 1],
      [0, 1],
    ],
    weight: 6,
    easy: true,
  },
  {
    id: 'c3_bl',
    label: 'Mini Corner',
    matrix: [
      [1, 0],
      [1, 1],
    ],
    weight: 6,
    easy: true,
  },
  {
    id: 'c3_br',
    label: 'Mini Corner',
    matrix: [
      [0, 1],
      [1, 1],
    ],
    weight: 6,
    easy: true,
  },

  // L-shapes (4 cells)
  {
    id: 'L_up',
    label: 'L-Shape',
    matrix: [
      [1, 0],
      [1, 0],
      [1, 1],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'L_right',
    label: 'L-Shape',
    matrix: [
      [1, 1, 1],
      [1, 0, 0],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'L_down',
    label: 'L-Shape',
    matrix: [
      [1, 1],
      [0, 1],
      [0, 1],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'L_left',
    label: 'L-Shape',
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    weight: 5,
    easy: false,
  },

  // J-shapes (4 cells)
  {
    id: 'J_up',
    label: 'J-Shape',
    matrix: [
      [0, 1],
      [0, 1],
      [1, 1],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'J_right',
    label: 'J-Shape',
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'J_down',
    label: 'J-Shape',
    matrix: [
      [1, 1],
      [1, 0],
      [1, 0],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'J_left',
    label: 'J-Shape',
    matrix: [
      [1, 1, 1],
      [0, 0, 1],
    ],
    weight: 5,
    easy: false,
  },

  // Big 3x3 L-corners (5 cells)
  {
    id: 'L3_bl',
    label: 'Big Corner',
    matrix: [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
    ],
    weight: 2,
    easy: false,
  },
  {
    id: 'L3_tl',
    label: 'Big Corner',
    matrix: [
      [1, 1, 1],
      [1, 0, 0],
      [1, 0, 0],
    ],
    weight: 2,
    easy: false,
  },

  // T-shapes (4 cells)
  {
    id: 'T_up',
    label: 'T-Shape',
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'T_down',
    label: 'T-Shape',
    matrix: [
      [1, 1, 1],
      [0, 1, 0],
    ],
    weight: 5,
    easy: false,
  },
  {
    id: 'T_right',
    label: 'T-Shape',
    matrix: [
      [1, 0],
      [1, 1],
      [1, 0],
    ],
    weight: 4,
    easy: false,
  },
  {
    id: 'T_left',
    label: 'T-Shape',
    matrix: [
      [0, 1],
      [1, 1],
      [0, 1],
    ],
    weight: 4,
    easy: false,
  },

  // Z & S shapes (4 cells)
  {
    id: 'Z_h',
    label: 'Z-Shape',
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    weight: 4,
    easy: false,
  },
  {
    id: 'Z_v',
    label: 'Z-Shape',
    matrix: [
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    weight: 4,
    easy: false,
  },
  {
    id: 'S_h',
    label: 'S-Shape',
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    weight: 4,
    easy: false,
  },
  {
    id: 'S_v',
    label: 'S-Shape',
    matrix: [
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    weight: 4,
    easy: false,
  },
] as const;

export interface TrayPiece {
  uid: string;
  templateId: string;
  label: string;
  matrix: number[][];
  colorId: string;
}

export type GridCell = string | null; // colorId or null
export type BoardGrid = GridCell[][];

export interface SavedGameState {
  grid: BoardGrid;
  tray: (TrayPiece | null)[];
  score: number;
  highScore: number;
  comboStreak: number;
  reviveUsed: boolean;
  linesClearedTotal: number;
}

export const GRID_SIZE = 8;
export const STORAGE_KEY = 'block_muddle_save_v1';
export const SETTINGS_KEY = 'block_muddle_settings_v1';
