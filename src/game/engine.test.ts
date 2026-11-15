import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReviveBoardClear,
  canPlacePiece,
  createEmptyGrid,
  generateSmartTray,
  getClearPreview,
  hasAnyValidMove,
  placePieceAndResolve,
} from './engine';
import { GRID_SIZE, TrayPiece } from './models';

function makePiece(id: string, matrix: number[][], colorId = 'sapphire'): TrayPiece {
  return {
    uid: `test_${id}`,
    templateId: id,
    label: id,
    matrix,
    colorId,
  };
}

test('canPlacePiece rejects out-of-bounds and overlapping cells', () => {
  const grid = createEmptyGrid();
  grid[3][3] = 'ruby';

  const bar2x2 = makePiece('2x2', [
    [1, 1],
    [1, 1],
  ]);

  assert.equal(canPlacePiece(grid, bar2x2, 0, 0), true);
  assert.equal(canPlacePiece(grid, bar2x2, 7, 7), false);
  assert.equal(canPlacePiece(grid, bar2x2, -1, 0), false);
  assert.equal(canPlacePiece(grid, bar2x2, 2, 2), false); // overlaps (3,3)
  assert.equal(canPlacePiece(grid, bar2x2, 2, 4), true);
});

test('getClearPreview detects simultaneous row and column clears', () => {
  const grid = createEmptyGrid();
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== 4) grid[2][c] = 'emerald';
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r !== 2) grid[r][4] = 'amber';
  }

  const dot = makePiece('1x1', [[1]]);
  const preview = getClearPreview(grid, dot, 2, 4);
  assert.deepEqual(preview.rowsToClear, [2]);
  assert.deepEqual(preview.colsToClear, [4]);
});

test('placePieceAndResolve clears full row+col, increments combo streak, and computes points', () => {
  const grid = createEmptyGrid();
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== 0) grid[0][c] = 'sapphire';
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r !== 0) grid[r][0] = 'sapphire';
  }
  grid[7][7] = 'amber'; // Keep one cell so it is not a full-board perfect clear

  const dot = makePiece('1x1', [[1]], 'ruby');
  const result = placePieceAndResolve(grid, dot, 0, 0, 1);

  assert.equal(result.linesCleared, 2);
  assert.equal(result.nextComboStreak, 2);
  assert.equal(result.clearedCells.length, 15);
  assert.equal(result.calloutText, 'COMBO x2!');
  // 1 cell placed (10) + 100 * (2^2) * 2 = 810
  assert.equal(result.pointsEarned, 810);
});

test('placePieceAndResolve awards PERFECT CLEAR bonus when board becomes empty', () => {
  const grid = createEmptyGrid();
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== 0) grid[0][c] = 'sapphire';
  }
  const dot = makePiece('1x1', [[1]], 'ruby');
  const result = placePieceAndResolve(grid, dot, 0, 0, 0);
  assert.equal(result.calloutText, 'PERFECT CLEAR!');
  assert.equal(result.pointsEarned, 10 + 100 + 500);
});

test('hasAnyValidMove detects game over when no tray piece fits', () => {
  const grid = createEmptyGrid();
  // Checkerboard fill: no 1x2 or 2x1 fits anywhere
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if ((r + c) % 2 === 0) {
        grid[r][c] = 'cyan';
      }
    }
  }

  const bar = makePiece('1x2', [[1, 1]]);
  assert.equal(hasAnyValidMove(grid, [bar, null, null]), false);

  const dot = makePiece('1x1', [[1]]);
  assert.equal(hasAnyValidMove(grid, [bar, dot, null]), true);
});

test('applyReviveBoardClear clears center 4x4 and provides three 1x1 pieces', () => {
  const grid = createEmptyGrid();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      grid[r][c] = 'amethyst';
    }
  }

  const { nextGrid, reviveTray, clearedCells } = applyReviveBoardClear(grid);
  assert.equal(clearedCells.length, 16);
  assert.equal(reviveTray.length, 3);
  for (const piece of reviveTray) {
    assert.deepEqual(piece.matrix, [[1]]);
  }
  for (let r = 2; r <= 5; r++) {
    for (let c = 2; c <= 5; c++) {
      assert.equal(nextGrid[r][c], null);
    }
  }
  assert.equal(nextGrid[0][0], 'amethyst');
});

test('generateSmartTray favors a playable piece on a crowded board', () => {
  const grid = createEmptyGrid();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      grid[r][c] = 'ruby';
    }
  }
  // Leave only a single 1x1 opening at (4,4)
  grid[4][4] = null;

  const tray = generateSmartTray(grid, false, () => 0.5);
  assert.equal(tray.length, 3);
  assert.equal(hasAnyValidMove(grid, tray), true);
});
