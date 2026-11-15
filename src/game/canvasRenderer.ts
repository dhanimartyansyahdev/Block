import {
  BoardGrid,
  COLOR_BY_ID,
  GamePhase,
  GRID_SIZE,
  TrayPiece,
} from './models';
import { canPlacePiece, getClearPreview } from './engine';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  rotation: number;
  vRot: number;
}

interface FloatingCallout {
  active: boolean;
  text: string;
  subText: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface ClearingTileAnim {
  active: boolean;
  row: number;
  col: number;
  colorId: string;
  progress: number;
}

interface LayoutMetrics {
  width: number;
  height: number;
  boardSize: number;
  boardX: number;
  boardY: number;
  cellSize: number;
  cellGap: number;
  trayY: number;
  trayHeight: number;
  traySlotWidth: number;
  trayCentersX: [number, number, number];
  trayCenterY: number;
  trayCellSize: number;
}

export interface CanvasCallbacks {
  onAttemptPlace: (trayIndex: number, row: number, col: number) => boolean;
  onPickupPiece: () => void;
  onInvalidDrop: () => void;
}

const PARTICLE_POOL_SIZE = 240;
const CALLOUT_POOL_SIZE = 12;
const CLEARING_POOL_SIZE = 64;

const TITLE_SHOWCASE_GRID: (string | null)[][] = [
  [null, null, null, null, null, null, null, null],
  [null, 'sapphire', 'sapphire', null, null, 'amber', null, null],
  [null, 'sapphire', null, null, 'amber', 'amber', 'amber', null],
  [null, null, 'emerald', 'emerald', null, null, null, null],
  [null, null, 'emerald', 'emerald', 'ruby', null, null, null],
  [null, 'amethyst', null, null, 'ruby', 'ruby', 'cyan', null],
  [null, 'amethyst', 'amethyst', null, null, 'cyan', 'cyan', null],
  [null, null, null, null, null, null, null, null],
];

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export class BlockMuddleCanvasController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: CanvasCallbacks;

  private phase: GamePhase = 'title';
  private grid: BoardGrid = [];
  private tray: (TrayPiece | null)[] = [null, null, null];

  private metrics: LayoutMetrics = {
    width: 800,
    height: 800,
    boardSize: 400,
    boardX: 200,
    boardY: 100,
    cellSize: 46,
    cellGap: 4,
    trayY: 540,
    trayHeight: 140,
    traySlotWidth: 130,
    trayCentersX: [260, 400, 540],
    trayCenterY: 610,
    trayCellSize: 22,
  };

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private trauma = 0;

  // Tray spawn pop-in animation timers per slot
  private trayAnimScale: [number, number, number] = [1, 1, 1];
  // Board cell pop-in timers [8][8]
  private cellPopScale: number[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => 1),
  );

  // Dragging state
  private draggingIndex: number | null = null;
  private dragPointerX = 0;
  private dragPointerY = 0;
  private dragIsTouch = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private selectedTrayIndex: number | null = null; // Accessibility click-to-select fallback
  private hoverBoardCell: { row: number; col: number } | null = null;

  // Fixed-capacity pooled particle, callout, and clearing-tile buffers (Zero GC)
  private particles: Particle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 6,
    life: 0,
    maxLife: 0.5,
    color: '#F59E0B',
    rotation: 0,
    vRot: 0,
  }));
  private particleCursor = 0;

  private callouts: FloatingCallout[] = Array.from({ length: CALLOUT_POOL_SIZE }, () => ({
    active: false,
    text: '',
    subText: '',
    x: 0,
    y: 0,
    vy: -40,
    life: 0,
    maxLife: 1.0,
    color: '#FBBF24',
    scale: 1,
  }));
  private calloutCursor = 0;

  private clearingAnims: ClearingTileAnim[] = Array.from({ length: CLEARING_POOL_SIZE }, () => ({
    active: false,
    row: 0,
    col: 0,
    colorId: 'amber',
    progress: 0,
  }));
  private clearingCursor = 0;

  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: CanvasCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('2D Canvas context unavailable');
    }
    this.ctx = context;
    this.callbacks = callbacks;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.tick = this.tick.bind(this);

    this.attachEvents();
    this.measureAndResize();
    this.lastTime = performance.now();
    this.requestRender();
  }

  private requestRender(): void {
    if (this.rafId === 0) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  public updateCallbacks(callbacks: CanvasCallbacks): void {
    this.callbacks = callbacks;
  }

  public syncState(
    phase: GamePhase,
    grid: BoardGrid,
    tray: (TrayPiece | null)[],
    options?: { animateTraySpawn?: boolean; placedCells?: Array<{ row: number; col: number }> },
  ): void {
    this.phase = phase;
    this.grid = grid;
    this.tray = tray;

    if (options?.animateTraySpawn) {
      this.trayAnimScale = [0.2, 0.2, 0.2];
    }

    if (options?.placedCells) {
      for (const { row, col } of options.placedCells) {
        if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
          this.cellPopScale[row][col] = 0.55;
        }
      }
    }

    if (this.draggingIndex !== null && !this.tray[this.draggingIndex]) {
      this.draggingIndex = null;
    }
    if (this.selectedTrayIndex !== null && !this.tray[this.selectedTrayIndex]) {
      this.selectedTrayIndex = null;
    }
    this.requestRender();
  }

  public triggerLineClearFX(
    clearedCells: Array<{ row: number; col: number; colorId: string }>,
    linesCleared: number,
    calloutText: string | null,
    pointsEarned: number,
  ): void {
    if (linesCleared >= 2) {
      this.trauma = Math.min(1, this.trauma + 0.35 + linesCleared * 0.14);
    } else if (linesCleared === 1) {
      this.trauma = Math.min(1, this.trauma + 0.15);
    }

    for (const cell of clearedCells) {
      const { cx, cy } = this.getCellCenter(cell.row, cell.col);
      const color = COLOR_BY_ID[cell.colorId] ?? COLOR_BY_ID.amber;

      // Clearing shrink tile animation
      const anim = this.clearingAnims[this.clearingCursor];
      this.clearingCursor = (this.clearingCursor + 1) % CLEARING_POOL_SIZE;
      anim.active = true;
      anim.row = cell.row;
      anim.col = cell.col;
      anim.colorId = cell.colorId;
      anim.progress = 0;

      // Spawn 6 glossy shard particles per cleared cell
      const burstCount = linesCleared >= 2 ? 7 : 5;
      for (let i = 0; i < burstCount; i++) {
        const p = this.particles[this.particleCursor];
        this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 260;
        p.active = true;
        p.x = cx + (Math.random() - 0.5) * this.metrics.cellSize * 0.4;
        p.y = cy + (Math.random() - 0.5) * this.metrics.cellSize * 0.4;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 40;
        p.size = 4 + Math.random() * 6;
        p.life = 0;
        p.maxLife = 0.42 + Math.random() * 0.28;
        p.color = i % 3 === 0 ? color.highlight : color.light;
        p.rotation = Math.random() * Math.PI;
        p.vRot = (Math.random() - 0.5) * 10;
      }
    }

    if (calloutText || pointsEarned > 0) {
      const c = this.callouts[this.calloutCursor];
      this.calloutCursor = (this.calloutCursor + 1) % CALLOUT_POOL_SIZE;
      c.active = true;
      c.text = calloutText ?? `+${pointsEarned}`;
      c.subText = calloutText ? `+${pointsEarned}` : '';
      c.x = this.metrics.boardX + this.metrics.boardSize / 2;
      c.y = this.metrics.boardY + this.metrics.boardSize * 0.44;
      c.vy = -56;
      c.life = 0;
      c.maxLife = calloutText ? 1.15 : 0.75;
      c.color = linesCleared >= 2 ? '#FBBF24' : '#34D399';
      c.scale = calloutText ? 1.15 : 0.9;
    }
    this.requestRender();
  }

  public triggerReviveFX(clearedCells: Array<{ row: number; col: number; colorId: string }>): void {
    this.triggerLineClearFX(clearedCells, 2, 'REVIVED!', 0);
    this.trayAnimScale = [0.15, 0.15, 0.15];
    this.requestRender();
  }

  public selectTraySlot(index: number | null): void {
    if (index !== null && !this.tray[index]) return;
    this.selectedTrayIndex = index;
    this.requestRender();
  }

  public getSelectedTraySlot(): number | null {
    return this.selectedTrayIndex;
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
    window.removeEventListener('blur', this.handlePointerCancel);
  }

  private attachEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);
    window.addEventListener('blur', this.handlePointerCancel);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measureAndResize());
      if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }
  }

  public measureAndResize(): void {
    const parent = this.canvas.parentElement;
    const rect = parent
      ? parent.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };

    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(420, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Reserve top space for compact HUD (~72-84px) and bottom space for 3-slot tray
    const topSafe = width < 640 ? 78 : 88;
    const bottomPadding = width < 640 ? 18 : 26;
    const usableHeight = height - topSafe - bottomPadding;

    // Tray takes roughly 23% of usable height (bounded between 108px and 156px)
    const trayHeight = Math.max(108, Math.min(156, Math.floor(usableHeight * 0.24)));
    const gapBetweenBoardAndTray = width < 640 ? 18 : 26;

    const maxBoardByHeight = usableHeight - trayHeight - gapBetweenBoardAndTray;
    const maxBoardByWidth = width - (width < 640 ? 28 : 64);
    const boardSize = Math.max(232, Math.min(480, maxBoardByHeight, maxBoardByWidth));

    const totalStackHeight = boardSize + gapBetweenBoardAndTray + trayHeight;
    const stackTop = topSafe + Math.max(0, Math.floor((usableHeight - totalStackHeight) / 2));

    const boardX = Math.floor((width - boardSize) / 2);
    const boardY = stackTop;
    const innerPad = Math.max(8, Math.floor(boardSize * 0.025));
    const cellGap = Math.max(3, Math.floor(boardSize * 0.01));
    const cellSize = Math.floor(
      (boardSize - innerPad * 2 - cellGap * (GRID_SIZE - 1)) / GRID_SIZE,
    );

    const trayY = boardY + boardSize + gapBetweenBoardAndTray;
    const traySlotWidth = Math.min(150, Math.floor(boardSize / 3));
    const trayCenterX = width / 2;
    const trayCentersX: [number, number, number] = [
      trayCenterX - traySlotWidth,
      trayCenterX,
      trayCenterX + traySlotWidth,
    ];
    const trayCenterY = trayY + trayHeight / 2;
    const trayCellSize = Math.max(15, Math.min(26, Math.floor(cellSize * 0.52)));

    this.metrics = {
      width,
      height,
      boardSize,
      boardX,
      boardY,
      cellSize,
      cellGap,
      trayY,
      trayHeight,
      traySlotWidth,
      trayCentersX,
      trayCenterY,
      trayCellSize,
    };
    this.requestRender();
  }

  private getCellTopLeft(row: number, col: number): { x: number; y: number } {
    const innerPad =
      (this.metrics.boardSize -
        (this.metrics.cellSize * GRID_SIZE + this.metrics.cellGap * (GRID_SIZE - 1))) /
      2;
    return {
      x: this.metrics.boardX + innerPad + col * (this.metrics.cellSize + this.metrics.cellGap),
      y: this.metrics.boardY + innerPad + row * (this.metrics.cellSize + this.metrics.cellGap),
    };
  }

  private getCellCenter(row: number, col: number): { cx: number; cy: number } {
    const { x, y } = this.getCellTopLeft(row, col);
    return {
      cx: x + this.metrics.cellSize / 2,
      cy: y + this.metrics.cellSize / 2,
    };
  }

  private getLocalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private getDragOffsetY(): number {
    // Crucial Android/mobile UX: keep dragged block lifted above the finger/cursor
    return this.dragIsTouch ? -Math.max(64, this.metrics.cellSize * 1.45) : -Math.max(24, this.metrics.cellSize * 0.65);
  }

  private computeSnapTarget(
    piece: TrayPiece,
    pieceCenterX: number,
    pieceCenterY: number,
  ): { row: number; col: number } | null {
    const rows = piece.matrix.length;
    const cols = piece.matrix[0]?.length ?? 0;
    const step = this.metrics.cellSize + this.metrics.cellGap;

    const pieceWidth = cols * this.metrics.cellSize + (cols - 1) * this.metrics.cellGap;
    const pieceHeight = rows * this.metrics.cellSize + (rows - 1) * this.metrics.cellGap;

    const topLeftX = pieceCenterX - pieceWidth / 2;
    const topLeftY = pieceCenterY - pieceHeight / 2;

    const origin00 = this.getCellTopLeft(0, 0);
    const col = Math.round((topLeftX - origin00.x) / step);
    const row = Math.round((topLeftY - origin00.y) / step);

    if (canPlacePiece(this.grid, piece, row, col)) {
      return { row, col };
    }
    return null;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.phase !== 'playing') return;
    const { x, y } = this.getLocalCoords(e.clientX, e.clientY);

    // 1. Check if pointer pressed on one of the 3 tray slots
    for (let i = 0; i < 3; i++) {
      const piece = this.tray[i];
      if (!piece) continue;
      const cx = this.metrics.trayCentersX[i];
      const cy = this.metrics.trayCenterY;
      const halfW = this.metrics.traySlotWidth * 0.5;
      const halfH = this.metrics.trayHeight * 0.52;

      if (Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH) {
        this.draggingIndex = i;
        this.dragPointerX = x;
        this.dragPointerY = y;
        this.dragStartX = x;
        this.dragStartY = y;
        this.dragIsTouch = e.pointerType === 'touch';
        this.selectedTrayIndex = i;
        this.callbacks.onPickupPiece();
        this.requestRender();
        return;
      }
    }

    // 2. If a tray piece is already selected (click-to-place accessibility), allow clicking board cell
    if (this.selectedTrayIndex !== null && this.tray[this.selectedTrayIndex]) {
      const piece = this.tray[this.selectedTrayIndex]!;
      const snap = this.computeSnapTarget(piece, x, y);
      if (snap) {
        const placed = this.callbacks.onAttemptPlace(this.selectedTrayIndex, snap.row, snap.col);
        if (placed) {
          this.selectedTrayIndex = null;
          this.hoverBoardCell = null;
          this.requestRender();
        }
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.phase !== 'playing') return;
    const { x, y } = this.getLocalCoords(e.clientX, e.clientY);

    if (this.draggingIndex !== null) {
      this.dragPointerX = x;
      this.dragPointerY = y;
      this.requestRender();
      return;
    }

    // Update hover preview if a piece was click-selected
    if (this.selectedTrayIndex !== null && this.tray[this.selectedTrayIndex]) {
      const piece = this.tray[this.selectedTrayIndex]!;
      const nextHover = this.computeSnapTarget(piece, x, y);
      if (
        nextHover?.row !== this.hoverBoardCell?.row ||
        nextHover?.col !== this.hoverBoardCell?.col
      ) {
        this.hoverBoardCell = nextHover;
        this.requestRender();
      }
    } else if (this.hoverBoardCell !== null) {
      this.hoverBoardCell = null;
      this.requestRender();
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.draggingIndex === null) return;
    const idx = this.draggingIndex;
    const piece = this.tray[idx];
    const { x, y } = this.getLocalCoords(e.clientX, e.clientY);
    this.draggingIndex = null;

    if (!piece || this.phase !== 'playing') {
      this.requestRender();
      return;
    }

    const movedDist = Math.hypot(x - this.dragStartX, y - this.dragStartY);
    // If user barely tapped the tray piece without dragging onto the board, keep it selected for click-to-place
    if (movedDist < 10) {
      this.selectedTrayIndex = idx;
      this.requestRender();
      return;
    }

    const offsetY = this.getDragOffsetY();
    const snap = this.computeSnapTarget(piece, x, y + offsetY);
    if (snap) {
      const ok = this.callbacks.onAttemptPlace(idx, snap.row, snap.col);
      if (ok) {
        this.selectedTrayIndex = null;
        this.requestRender();
        return;
      }
    }

    this.callbacks.onInvalidDrop();
    this.requestRender();
  }

  private handlePointerCancel(): void {
    this.draggingIndex = null;
    this.hoverBoardCell = null;
    this.requestRender();
  }

  private tick(now: number): void {
    this.rafId = 0;
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    this.elapsed += dt;

    const animActive = this.updateAnimations(dt);
    this.render();

    if (animActive) {
      this.requestRender();
    }
  }

  private updateAnimations(dt: number): boolean {
    let active = false;

    // Decay camera trauma
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
      active = true;
    }

    // Ease tray spawn scale-in
    for (let i = 0; i < 3; i++) {
      if (this.trayAnimScale[i] < 1) {
        this.trayAnimScale[i] = Math.min(1, this.trayAnimScale[i] + dt * 5.2);
        active = true;
      }
    }

    // Ease placed tile pop-in
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.cellPopScale[r][c] < 1) {
          this.cellPopScale[r][c] = Math.min(1, this.cellPopScale[r][c] + dt * 6.5);
          active = true;
        }
      }
    }

    // Update particles in-place
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.vy += 420 * dt; // subtle gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      active = true;
    }

    // Update clearing tile shrink animations
    for (let i = 0; i < CLEARING_POOL_SIZE; i++) {
      const a = this.clearingAnims[i];
      if (!a.active) continue;
      a.progress += dt * 4.2;
      if (a.progress >= 1) {
        a.active = false;
      } else {
        active = true;
      }
    }

    // Update floating callouts
    for (let i = 0; i < CALLOUT_POOL_SIZE; i++) {
      const c = this.callouts[i];
      if (!c.active) continue;
      c.life += dt;
      if (c.life >= c.maxLife) {
        c.active = false;
        continue;
      }
      c.y += c.vy * dt;
      c.vy *= 0.94;
      active = true;
    }

    return active;
  }

  private drawBevelBlock(
    x: number,
    y: number,
    size: number,
    colorId: string,
    alpha = 1,
    goldGlow = false,
  ): void {
    const ctx = this.ctx;
    const color = COLOR_BY_ID[colorId] ?? COLOR_BY_ID.sapphire;
    const radius = Math.max(4, size * 0.19);
    const bevel = Math.max(2.5, size * 0.13);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (goldGlow) {
      ctx.shadowColor = 'rgba(251, 191, 36, 0.85)';
      ctx.shadowBlur = 14;
    }

    // Outer base body
    drawRoundedRectPath(ctx, x, y, size, size, radius);
    ctx.fillStyle = goldGlow ? '#F59E0B' : color.base;
    ctx.fill();

    ctx.shadowBlur = 0;

    // Top-left bright bevel facet
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.lineTo(x + size - bevel, y + bevel);
    ctx.lineTo(x + bevel, y + bevel);
    ctx.lineTo(x + bevel, y + size - bevel);
    ctx.lineTo(x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = goldGlow ? '#FDE68A' : color.light;
    ctx.fill();

    // Bottom-right deep bevel facet
    ctx.beginPath();
    ctx.moveTo(x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.lineTo(x + bevel, y + size - bevel);
    ctx.lineTo(x + size - bevel, y + size - bevel);
    ctx.lineTo(x + size - bevel, y + bevel);
    ctx.closePath();
    ctx.fillStyle = goldGlow ? '#B45309' : color.dark;
    ctx.fill();

    // Inner jewel face
    const innerPad = bevel;
    const innerSize = size - innerPad * 2;
    if (innerSize > 2) {
      drawRoundedRectPath(
        ctx,
        x + innerPad,
        y + innerPad,
        innerSize,
        innerSize,
        Math.max(2, radius * 0.55),
      );
      ctx.fillStyle = goldGlow ? '#FBBF24' : color.base;
      ctx.fill();

      // Glossy top specular strip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      drawRoundedRectPath(
        ctx,
        x + innerPad + innerSize * 0.1,
        y + innerPad + innerSize * 0.08,
        innerSize * 0.8,
        Math.max(2, innerSize * 0.22),
        Math.max(1.5, innerSize * 0.11),
      );
      ctx.fill();
    }

    ctx.restore();
  }

  private render(): void {
    const ctx = this.ctx;
    const { width, height, boardX, boardY, boardSize, cellSize, cellGap } = this.metrics;

    // 60% Neutral Deep Midnight Indigo-Slate Canvas
    ctx.fillStyle = '#0B0F1A';
    ctx.fillRect(0, 0, width, height);

    // Subtle radial ambient depth behind board (no bright neon blobs)
    const grad = ctx.createRadialGradient(
      width / 2,
      boardY + boardSize / 2,
      boardSize * 0.15,
      width / 2,
      boardY + boardSize / 2,
      Math.max(width, height) * 0.7,
    );
    grad.addColorStop(0, '#141E33');
    grad.addColorStop(1, '#0B0F1A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    // Trauma-squared screen shake
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma * 10;
      const sx = (Math.random() - 0.5) * 2 * shake;
      const sy = (Math.random() - 0.5) * 2 * shake;
      ctx.translate(sx, sy);
    }

    // Board outer container (30% structural slate)
    const boardRadius = Math.max(14, boardSize * 0.04);
    drawRoundedRectPath(ctx, boardX - 6, boardY - 6, boardSize + 12, boardSize + 12, boardRadius + 3);
    ctx.fillStyle = '#0F1626';
    ctx.fill();

    drawRoundedRectPath(ctx, boardX, boardY, boardSize, boardSize, boardRadius);
    ctx.fillStyle = '#151E31';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.stroke();

    // Active drag / selected ghost snap preview
    let activePiece: TrayPiece | null = null;
    let snapTarget: { row: number; col: number } | null = null;
    let draggedPieceCenter: { x: number; y: number } | null = null;

    if (this.phase === 'playing' && this.draggingIndex !== null && this.tray[this.draggingIndex]) {
      activePiece = this.tray[this.draggingIndex]!;
      const offsetY = this.getDragOffsetY();
      draggedPieceCenter = {
        x: this.dragPointerX,
        y: this.dragPointerY + offsetY,
      };
      snapTarget = this.computeSnapTarget(activePiece, draggedPieceCenter.x, draggedPieceCenter.y);
    } else if (
      this.phase === 'playing' &&
      this.selectedTrayIndex !== null &&
      this.tray[this.selectedTrayIndex] &&
      this.hoverBoardCell
    ) {
      activePiece = this.tray[this.selectedTrayIndex]!;
      snapTarget = this.hoverBoardCell;
    }

    const clearPreview =
      activePiece && snapTarget
        ? getClearPreview(this.grid, activePiece, snapTarget.row, snapTarget.col)
        : { rowsToClear: [], colsToClear: [] };

    const activeGrid = this.phase === 'title' ? TITLE_SHOWCASE_GRID : this.grid;

    // Draw 8x8 cell wells and placed blocks
    const cellRadius = Math.max(4, cellSize * 0.19);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const { x, y } = this.getCellTopLeft(r, c);
        const isRowClearing = clearPreview.rowsToClear.includes(r);
        const isColClearing = clearPreview.colsToClear.includes(c);
        const willClear = isRowClearing || isColClearing;

        // Subtle checkerboard tint for instant spatial alignment
        const isEven = (r + c) % 2 === 0;
        drawRoundedRectPath(ctx, x, y, cellSize, cellSize, cellRadius);
        ctx.fillStyle = isEven ? '#1C263B' : '#192236';
        ctx.fill();

        // Inner socket bevel line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const cellColor = activeGrid[r]?.[c];
        if (cellColor) {
          const popScale = this.phase === 'title' ? 1 : this.cellPopScale[r][c];
          if (popScale < 1) {
            ctx.save();
            const cx = x + cellSize / 2;
            const cy = y + cellSize / 2;
            ctx.translate(cx, cy);
            ctx.scale(popScale, popScale);
            this.drawBevelBlock(-cellSize / 2, -cellSize / 2, cellSize, cellColor, 1, willClear);
            ctx.restore();
          } else {
            this.drawBevelBlock(x, y, cellSize, cellColor, this.phase === 'title' ? 0.85 : 1, willClear);
          }
        } else if (willClear) {
          // Gold glow highlight on empty cells along a line about to clear
          drawRoundedRectPath(ctx, x, y, cellSize, cellSize, cellRadius);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Gold/glow line borders for rows & columns about to clear
    if (clearPreview.rowsToClear.length > 0 || clearPreview.colsToClear.length > 0) {
      const pulse = 0.72 + Math.sin(this.elapsed * 12) * 0.22;
      ctx.save();
      ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(245, 158, 11, 0.75)';
      ctx.shadowBlur = 12;

      for (const r of clearPreview.rowsToClear) {
        const first = this.getCellTopLeft(r, 0);
        const totalW = GRID_SIZE * cellSize + (GRID_SIZE - 1) * cellGap;
        drawRoundedRectPath(ctx, first.x - 2, first.y - 2, totalW + 4, cellSize + 4, cellRadius + 2);
        ctx.stroke();
      }
      for (const c of clearPreview.colsToClear) {
        const first = this.getCellTopLeft(0, c);
        const totalH = GRID_SIZE * cellSize + (GRID_SIZE - 1) * cellGap;
        drawRoundedRectPath(ctx, first.x - 2, first.y - 2, cellSize + 4, totalH + 4, cellRadius + 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw translucent Ghost Preview on the 8x8 grid
    if (activePiece && snapTarget) {
      for (let pr = 0; pr < activePiece.matrix.length; pr++) {
        for (let pc = 0; pc < activePiece.matrix[pr].length; pc++) {
          if (activePiece.matrix[pr][pc] === 1) {
            const { x, y } = this.getCellTopLeft(snapTarget.row + pr, snapTarget.col + pc);
            this.drawBevelBlock(
              x,
              y,
              cellSize,
              activePiece.colorId,
              0.42,
              clearPreview.rowsToClear.length > 0 || clearPreview.colsToClear.length > 0,
            );
          }
        }
      }
    }

    // Draw shrinking cleared-tile animations
    for (let i = 0; i < CLEARING_POOL_SIZE; i++) {
      const a = this.clearingAnims[i];
      if (!a.active) continue;
      const { cx, cy } = this.getCellCenter(a.row, a.col);
      const scale = Math.max(0.05, 1 - a.progress);
      const alpha = 1 - a.progress;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      this.drawBevelBlock(-cellSize / 2, -cellSize / 2, cellSize, a.colorId, alpha, true);
      ctx.restore();
    }

    // Draw Bottom 3-Slot Tray Dock (during playing / paused / gameover)
    if (this.phase !== 'title') {
      this.renderTrayDock();
    }

    // Draw actively dragged piece lifted at full board scale
    if (this.phase === 'playing' && this.draggingIndex !== null && draggedPieceCenter) {
      const piece = this.tray[this.draggingIndex];
      if (piece) {
        const rows = piece.matrix.length;
        const cols = piece.matrix[0]?.length ?? 0;
        const pw = cols * cellSize + (cols - 1) * cellGap;
        const ph = rows * cellSize + (rows - 1) * cellGap;
        const startX = draggedPieceCenter.x - pw / 2;
        const startY = draggedPieceCenter.y - ph / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 10;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (piece.matrix[r][c] === 1) {
              const bx = startX + c * (cellSize + cellGap);
              const by = startY + r * (cellSize + cellGap);
              this.drawBevelBlock(bx, by, cellSize, piece.colorId, 0.96, false);
            }
          }
        }
        ctx.restore();
      }
    }

    // Draw pooled burst particles
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const alpha = Math.max(0, 1 - t);
      const s = p.size * (1 - t * 0.45);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      drawRoundedRectPath(ctx, -s / 2, -s / 2, s, s, 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw floating combo & score callout text
    for (let i = 0; i < CALLOUT_POOL_SIZE; i++) {
      const c = this.callouts[i];
      if (!c.active) continue;
      const t = c.life / c.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.8);
      const pop = t < 0.18 ? 0.75 + (t / 0.18) * 0.35 : 1.1 - t * 0.1;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(pop * c.scale, pop * c.scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = `800 ${Math.round(Math.max(22, boardSize * 0.072))}px Outfit, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(11, 15, 26, 0.92)';
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);

      if (c.subText) {
        ctx.font = `700 ${Math.round(Math.max(15, boardSize * 0.044))}px Outfit, sans-serif`;
        ctx.lineWidth = 3.5;
        ctx.strokeText(c.subText, 0, 28);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(c.subText, 0, 28);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  private renderTrayDock(): void {
    const ctx = this.ctx;
    const {
      trayY,
      trayHeight,
      traySlotWidth,
      trayCentersX,
      trayCenterY,
      trayCellSize,
      boardX,
      boardSize,
    } = this.metrics;

    // Unified dark slate tray dock container aligned with board width
    drawRoundedRectPath(ctx, boardX, trayY, boardSize, trayHeight, 16);
    ctx.fillStyle = '#131B2C';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const gap = Math.max(2, Math.floor(trayCellSize * 0.14));

    for (let i = 0; i < 3; i++) {
      const piece = this.tray[i];
      const cx = trayCentersX[i];

      // Subtle slot divider / selection ring
      if (this.selectedTrayIndex === i && this.draggingIndex === null && piece) {
        drawRoundedRectPath(
          ctx,
          cx - traySlotWidth * 0.44,
          trayY + 8,
          traySlotWidth * 0.88,
          trayHeight - 16,
          12,
        );
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (!piece || this.draggingIndex === i) continue;

      const rows = piece.matrix.length;
      const cols = piece.matrix[0]?.length ?? 0;

      // Shrink oversized 5-cell pieces slightly so they fit comfortably inside the tray slot
      const maxDim = Math.max(rows, cols);
      const cell = maxDim >= 5 ? Math.floor(trayCellSize * 0.78) : trayCellSize;
      const pw = cols * cell + (cols - 1) * gap;
      const ph = rows * cell + (rows - 1) * gap;

      const animScale = this.trayAnimScale[i];

      ctx.save();
      ctx.translate(cx, trayCenterY);
      ctx.scale(animScale, animScale);

      const startX = -pw / 2;
      const startY = -ph / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (piece.matrix[r][c] === 1) {
            this.drawBevelBlock(
              startX + c * (cell + gap),
              startY + r * (cell + gap),
              cell,
              piece.colorId,
              1,
              false,
            );
          }
        }
      }
      ctx.restore();
    }
  }
}
