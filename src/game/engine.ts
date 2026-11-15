import {
  BLOCK_COLORS,
  BoardGrid,
  GRID_SIZE,
  PIECE_TEMPLATES,
  PieceTemplate,
  SavedGameState,
  STORAGE_KEY,
  TrayPiece,
} from './models';

export interface ClearPreview {
  rowsToClear: number[];
  colsToClear: number[];
}

export interface PlacementResult {
  nextGrid: BoardGrid;
  clearedRows: number[];
  clearedCols: number[];
  clearedCells: Array<{ row: number; col: number; colorId: string }>;
  placedCellsCount: number;
  linesCleared: number;
  pointsEarned: number;
  nextComboStreak: number;
  calloutText: string | null;
}

let pieceUidCounter = 0;

export function createEmptyGrid(): BoardGrid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
}

export function cloneGrid(grid: BoardGrid): BoardGrid {
  return grid.map((row) => [...row]);
}

export function countOccupiedCells(grid: BoardGrid): number {
  let count = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] !== null) count++;
    }
  }
  return count;
}

export function canPlacePiece(
  grid: BoardGrid,
  piece: Pick<TrayPiece, 'matrix'>,
  startRow: number,
  startCol: number,
): boolean {
  const rows = piece.matrix.length;
  const cols = piece.matrix[0]?.length ?? 0;

  if (
    startRow < 0 ||
    startCol < 0 ||
    startRow + rows > GRID_SIZE ||
    startCol + cols > GRID_SIZE
  ) {
    return false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (piece.matrix[r][c] === 1 && grid[startRow + r][startCol + c] !== null) {
        return false;
      }
    }
  }

  return true;
}

export function canPieceFitAnywhere(
  grid: BoardGrid,
  piece: Pick<TrayPiece, 'matrix'>,
): boolean {
  const rows = piece.matrix.length;
  const cols = piece.matrix[0]?.length ?? 0;
  for (let r = 0; r <= GRID_SIZE - rows; r++) {
    for (let c = 0; c <= GRID_SIZE - cols; c++) {
      if (canPlacePiece(grid, piece, r, c)) {
        return true;
      }
    }
  }
  return false;
}

export function hasAnyValidMove(
  grid: BoardGrid,
  tray: readonly (TrayPiece | null)[],
): boolean {
  for (const piece of tray) {
    if (piece && canPieceFitAnywhere(grid, piece)) {
      return true;
    }
  }
  return false;
}

export function getClearPreview(
  grid: BoardGrid,
  piece: Pick<TrayPiece, 'matrix'>,
  startRow: number,
  startCol: number,
): ClearPreview {
  if (!canPlacePiece(grid, piece, startRow, startCol)) {
    return { rowsToClear: [], colsToClear: [] };
  }

  const simulated = cloneGrid(grid);
  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (piece.matrix[r][c] === 1) {
        simulated[startRow + r][startCol + c] = 'preview';
      }
    }
  }

  const rowsToClear: number[] = [];
  const colsToClear: number[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    if (simulated[r].every((cell) => cell !== null)) {
      rowsToClear.push(r);
    }
  }

  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (simulated[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) {
      colsToClear.push(c);
    }
  }

  return { rowsToClear, colsToClear };
}

export function getCalloutForClear(
  linesCleared: number,
  nextComboStreak: number,
): string | null {
  if (linesCleared <= 0) return null;
  if (linesCleared >= 4) return 'MUDDLE BLAST!';
  if (linesCleared === 3) {
    return nextComboStreak >= 2 ? `TRIPLE COMBO x${nextComboStreak}!` : 'MUDDLE BLAST!';
  }
  if (linesCleared === 2) {
    return nextComboStreak >= 2 ? `COMBO x${nextComboStreak}!` : 'GREAT!';
  }
  if (nextComboStreak >= 3) return `STREAK x${nextComboStreak}!`;
  if (nextComboStreak === 2) return 'COMBO x2!';
  return null;
}

export function placePieceAndResolve(
  grid: BoardGrid,
  piece: TrayPiece,
  startRow: number,
  startCol: number,
  currentComboStreak: number,
): PlacementResult {
  if (!canPlacePiece(grid, piece, startRow, startCol)) {
    throw new Error(`Invalid placement at (${startRow}, ${startCol})`);
  }

  const nextGrid = cloneGrid(grid);
  let placedCellsCount = 0;

  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (piece.matrix[r][c] === 1) {
        nextGrid[startRow + r][startCol + c] = piece.colorId;
        placedCellsCount++;
      }
    }
  }

  const clearedRows: number[] = [];
  const clearedCols: number[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    if (nextGrid[r].every((cell) => cell !== null)) {
      clearedRows.push(r);
    }
  }

  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (nextGrid[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) {
      clearedCols.push(c);
    }
  }

  const clearedCellMap = new Map<string, { row: number; col: number; colorId: string }>();
  for (const r of clearedRows) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const colorId = nextGrid[r][c];
      if (colorId) {
        clearedCellMap.set(`${r},${c}`, { row: r, col: c, colorId });
      }
    }
  }
  for (const c of clearedCols) {
    for (let r = 0; r < GRID_SIZE; r++) {
      const colorId = nextGrid[r][c];
      if (colorId) {
        clearedCellMap.set(`${r},${c}`, { row: r, col: c, colorId });
      }
    }
  }

  for (const cell of clearedCellMap.values()) {
    nextGrid[cell.row][cell.col] = null;
  }

  const linesCleared = clearedRows.length + clearedCols.length;
  const nextComboStreak = linesCleared > 0 ? currentComboStreak + 1 : 0;

  // Score math: 10 pts per cell placed + escalating line-clear bonus * combo multiplier
  const placementPoints = placedCellsCount * 10;
  let lineBonus = 0;
  if (linesCleared > 0) {
    const multiLineFactor = linesCleared * linesCleared; // 1->1, 2->4, 3->9, 4->16
    const comboMultiplier = Math.max(1, nextComboStreak);
    lineBonus = 100 * multiLineFactor * comboMultiplier;
  }

  // Board full clear bonus!
  const remainingOccupied = countOccupiedCells(nextGrid);
  const fullBoardClearBonus = linesCleared > 0 && remainingOccupied === 0 ? 500 : 0;

  const calloutText =
    fullBoardClearBonus > 0
      ? 'PERFECT CLEAR!'
      : getCalloutForClear(linesCleared, nextComboStreak);

  return {
    nextGrid,
    clearedRows,
    clearedCols,
    clearedCells: Array.from(clearedCellMap.values()),
    placedCellsCount,
    linesCleared,
    pointsEarned: placementPoints + lineBonus + fullBoardClearBonus,
    nextComboStreak,
    calloutText,
  };
}

function createTrayPieceFromTemplate(
  template: PieceTemplate,
  rng: () => number = Math.random,
): TrayPiece {
  pieceUidCounter++;
  const color = BLOCK_COLORS[Math.floor(rng() * BLOCK_COLORS.length)];
  return {
    uid: `piece_${Date.now()}_${pieceUidCounter}_${Math.floor(rng() * 10000)}`,
    templateId: template.id,
    label: template.label,
    matrix: template.matrix.map((row) => [...row]),
    colorId: color.id,
  };
}

function pickWeightedTemplate(
  templates: readonly PieceTemplate[],
  rng: () => number = Math.random,
): PieceTemplate {
  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  for (const t of templates) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return templates[0];
}

export function generateSmartTray(
  grid: BoardGrid,
  easyMode = false,
  rng: () => number = Math.random,
): TrayPiece[] {
  const pool = easyMode
    ? PIECE_TEMPLATES.filter((t) => t.easy)
    : PIECE_TEMPLATES;

  const occupiedRatio = countOccupiedCells(grid) / (GRID_SIZE * GRID_SIZE);
  const fittingTemplates = pool.filter((t) => canPieceFitAnywhere(grid, t));
  const easyFittingTemplates = PIECE_TEMPLATES.filter(
    (t) => t.easy && canPieceFitAnywhere(grid, t),
  );

  const pieces: TrayPiece[] = [];

  for (let i = 0; i < 3; i++) {
    // When board is crowded (>= 45% full) or on slot 0, strongly favor a playable piece
    if (i === 0 && fittingTemplates.length > 0 && (occupiedRatio >= 0.35 || easyMode)) {
      const candidatePool =
        occupiedRatio >= 0.55 && easyFittingTemplates.length > 0
          ? easyFittingTemplates
          : fittingTemplates;
      pieces.push(createTrayPieceFromTemplate(pickWeightedTemplate(candidatePool, rng), rng));
    } else if (occupiedRatio >= 0.6 && easyFittingTemplates.length > 0) {
      pieces.push(createTrayPieceFromTemplate(pickWeightedTemplate(easyFittingTemplates, rng), rng));
    } else {
      pieces.push(createTrayPieceFromTemplate(pickWeightedTemplate(pool, rng), rng));
    }
  }

  // Guarantee at least one playable piece if any template fits on the board
  if (!hasAnyValidMove(grid, pieces) && fittingTemplates.length > 0) {
    const replacement =
      easyFittingTemplates.length > 0
        ? pickWeightedTemplate(easyFittingTemplates, rng)
        : pickWeightedTemplate(fittingTemplates, rng);
    pieces[0] = createTrayPieceFromTemplate(replacement, rng);
  }

  return pieces;
}

export function applyReviveBoardClear(grid: BoardGrid): {
  nextGrid: BoardGrid;
  reviveTray: TrayPiece[];
  clearedCells: Array<{ row: number; col: number; colorId: string }>;
} {
  const nextGrid = cloneGrid(grid);
  const clearedCells: Array<{ row: number; col: number; colorId: string }> = [];

  // Clear center 4x4 region: rows 2..5, cols 2..5
  for (let r = 2; r <= 5; r++) {
    for (let c = 2; c <= 5; c++) {
      const existing = nextGrid[r][c];
      if (existing !== null) {
        clearedCells.push({ row: r, col: c, colorId: existing });
        nextGrid[r][c] = null;
      }
    }
  }

  const oneByOne = PIECE_TEMPLATES.find((t) => t.id === '1x1') ?? PIECE_TEMPLATES[0];
  const reviveTray: TrayPiece[] = [
    createTrayPieceFromTemplate(oneByOne),
    createTrayPieceFromTemplate(oneByOne),
    createTrayPieceFromTemplate(oneByOne),
  ];

  return { nextGrid, reviveTray, clearedCells };
}

export function saveGameStateToStorage(state: SavedGameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota/storage errors in restricted environments
  }
}

export function loadGameStateFromStorage(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameState;
    if (
      !Array.isArray(parsed.grid) ||
      parsed.grid.length !== GRID_SIZE ||
      !Array.isArray(parsed.tray) ||
      parsed.tray.length !== 3 ||
      typeof parsed.score !== 'number' ||
      typeof parsed.highScore !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
