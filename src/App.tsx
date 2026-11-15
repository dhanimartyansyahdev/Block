import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Code2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  applyReviveBoardClear,
  createEmptyGrid,
  generateSmartTray,
  hasAnyValidMove,
  loadGameStateFromStorage,
  placePieceAndResolve,
  saveGameStateToStorage,
} from './game/engine';
import { BoardGrid, GamePhase, TrayPiece } from './game/models';
import { soundAndHaptics } from './game/audio';
import { BlockMuddleCanvasController } from './game/canvasRenderer';
import { TitleEmblem } from './components/TitleEmblem';
import { AndroidSourceModal } from './components/AndroidSourceModal';
import { RewardedAdOverlay } from './components/RewardedAdOverlay';

interface HudSnapshot {
  phase: GamePhase;
  score: number;
  highScore: number;
  comboStreak: number;
  reviveUsed: boolean;
  hasSavedRun: boolean;
  isNewBest: boolean;
}

type PendingAdReward = 'reroll' | 'revive' | null;

function CrownIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 18h18v2H3v-2zm0-2L1.5 6.5l5.5 4L12 4l5 6.5 5.5-4L21 16H3z"
        fill="#FBBF24"
        stroke="#0B0F1A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<BlockMuddleCanvasController | null>(null);

  // Authoritative mutable game state refs decoupled from 60fps canvas rendering
  const gridRef = useRef<BoardGrid>(createEmptyGrid());
  const trayRef = useRef<(TrayPiece | null)[]>([null, null, null]);
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const comboStreakRef = useRef(0);
  const reviveUsedRef = useRef(false);
  const linesTotalRef = useRef(0);
  const previousBestRef = useRef(0);
  const phaseRef = useRef<GamePhase>('title');
  const gameOverTimerRef = useRef<number | null>(null);

  const initialSettings = soundAndHaptics.getSettings();
  const [soundOn, setSoundOn] = useState(initialSettings.soundEnabled);
  const [hapticsOn, setHapticsOn] = useState(initialSettings.hapticsEnabled);
  const [adReady, setAdReady] = useState(true);
  const [pendingAd, setPendingAd] = useState<PendingAdReward>(null);
  const [showAndroidCode, setShowAndroidCode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [hud, setHud] = useState<HudSnapshot>({
    phase: 'title',
    score: 0,
    highScore: 0,
    comboStreak: 0,
    reviveUsed: false,
    hasSavedRun: false,
    isNewBest: false,
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const persistCurrentRun = useCallback(() => {
    saveGameStateToStorage({
      grid: gridRef.current,
      tray: trayRef.current,
      score: scoreRef.current,
      highScore: highScoreRef.current,
      comboStreak: comboStreakRef.current,
      reviveUsed: reviveUsedRef.current,
      linesClearedTotal: linesTotalRef.current,
    });
  }, []);

  const syncUiAndCanvas = useCallback(
    (
      nextPhase: GamePhase,
      options?: { animateTraySpawn?: boolean; placedCells?: Array<{ row: number; col: number }> },
    ) => {
      phaseRef.current = nextPhase;
      document.body.dataset.state = nextPhase;

      const isNewBest =
        scoreRef.current > 0 &&
        scoreRef.current >= highScoreRef.current &&
        scoreRef.current > previousBestRef.current;

      setHud({
        phase: nextPhase,
        score: scoreRef.current,
        highScore: highScoreRef.current,
        comboStreak: comboStreakRef.current,
        reviveUsed: reviveUsedRef.current,
        hasSavedRun: scoreRef.current > 0,
        isNewBest,
      });

      controllerRef.current?.syncState(nextPhase, gridRef.current, trayRef.current, options);
    },
    [],
  );

  const startNewRun = useCallback(
    (enterPlaying = true) => {
      if (gameOverTimerRef.current !== null) {
        window.clearTimeout(gameOverTimerRef.current);
        gameOverTimerRef.current = null;
      }
      const empty = createEmptyGrid();
      gridRef.current = empty;
      trayRef.current = generateSmartTray(empty, false);
      scoreRef.current = 0;
      comboStreakRef.current = 0;
      reviveUsedRef.current = false;
      linesTotalRef.current = 0;
      previousBestRef.current = highScoreRef.current;

      persistCurrentRun();
      syncUiAndCanvas(enterPlaying ? 'playing' : 'title', { animateTraySpawn: true });
    },
    [persistCurrentRun, syncUiAndCanvas],
  );

  const enterPlayingFromTitle = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    soundAndHaptics.playPickup();

    if (trayRef.current.every((p) => p === null)) {
      trayRef.current = generateSmartTray(gridRef.current, false);
      persistCurrentRun();
    }

    if (!hasAnyValidMove(gridRef.current, trayRef.current)) {
      syncUiAndCanvas('gameover');
      return;
    }

    syncUiAndCanvas('playing', { animateTraySpawn: true });
  }, [persistCurrentRun, syncUiAndCanvas]);

  const handleAttemptPlace = useCallback(
    (trayIndex: number, row: number, col: number): boolean => {
      if (phaseRef.current !== 'playing') return false;
      const piece = trayRef.current[trayIndex];
      if (!piece) return false;

      let result;
      try {
        result = placePieceAndResolve(
          gridRef.current,
          piece,
          row,
          col,
          comboStreakRef.current,
        );
      } catch {
        return false;
      }

      gridRef.current = result.nextGrid;
      const nextTray = [...trayRef.current];
      nextTray[trayIndex] = null;

      let spawnedFreshSet = false;
      if (nextTray.every((p) => p === null)) {
        trayRef.current = generateSmartTray(gridRef.current, false);
        spawnedFreshSet = true;
      } else {
        trayRef.current = nextTray;
      }

      scoreRef.current += result.pointsEarned;
      if (scoreRef.current > highScoreRef.current) {
        highScoreRef.current = scoreRef.current;
      }
      comboStreakRef.current = result.nextComboStreak;
      linesTotalRef.current += result.linesCleared;

      if (result.linesCleared > 0) {
        soundAndHaptics.playLineClear(result.linesCleared, result.nextComboStreak);
        controllerRef.current?.triggerLineClearFX(
          result.clearedCells,
          result.linesCleared,
          result.calloutText,
          result.pointsEarned,
        );
      } else {
        soundAndHaptics.playDrop();
      }

      const placedCells: Array<{ row: number; col: number }> = [];
      for (let pr = 0; pr < piece.matrix.length; pr++) {
        for (let pc = 0; pc < piece.matrix[pr].length; pc++) {
          if (piece.matrix[pr][pc] === 1) {
            placedCells.push({ row: row + pr, col: col + pc });
          }
        }
      }

      persistCurrentRun();
      syncUiAndCanvas('playing', {
        animateTraySpawn: spawnedFreshSet,
        placedCells,
      });

      if (!hasAnyValidMove(gridRef.current, trayRef.current)) {
        if (gameOverTimerRef.current !== null) {
          window.clearTimeout(gameOverTimerRef.current);
        }
        gameOverTimerRef.current = window.setTimeout(() => {
          if (phaseRef.current === 'playing' && !hasAnyValidMove(gridRef.current, trayRef.current)) {
            soundAndHaptics.playGameOver();
            syncUiAndCanvas('gameover');
          }
        }, 460);
      }

      return true;
    },
    [persistCurrentRun, syncUiAndCanvas],
  );

  // Initialize saved state & mount Canvas controller once
  useEffect(() => {
    const saved = loadGameStateFromStorage();
    if (saved) {
      gridRef.current = saved.grid;
      trayRef.current = saved.tray;
      scoreRef.current = saved.score;
      highScoreRef.current = saved.highScore;
      comboStreakRef.current = saved.comboStreak ?? 0;
      reviveUsedRef.current = saved.reviveUsed ?? false;
      linesTotalRef.current = saved.linesClearedTotal ?? 0;
      previousBestRef.current = saved.highScore;

      if (trayRef.current.every((p) => p === null)) {
        trayRef.current = generateSmartTray(gridRef.current, false);
      }
    } else {
      const empty = createEmptyGrid();
      gridRef.current = empty;
      trayRef.current = generateSmartTray(empty, false);
    }

    const canvas = canvasRef.current;
    if (canvas && !controllerRef.current) {
      controllerRef.current = new BlockMuddleCanvasController(canvas, {
        onAttemptPlace: handleAttemptPlace,
        onPickupPiece: () => soundAndHaptics.playPickup(),
        onInvalidDrop: () => soundAndHaptics.playInvalidDrop(),
      });
    }

    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';

    if (autostart) {
      if (!hasAnyValidMove(gridRef.current, trayRef.current)) {
        startNewRun(true);
      } else {
        syncUiAndCanvas('playing', { animateTraySpawn: true });
      }
    } else {
      syncUiAndCanvas('title');
    }

    return () => {
      if (gameOverTimerRef.current !== null) {
        window.clearTimeout(gameOverTimerRef.current);
      }
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.updateCallbacks({
      onAttemptPlace: handleAttemptPlace,
      onPickupPiece: () => soundAndHaptics.playPickup(),
      onInvalidDrop: () => soundAndHaptics.playInvalidDrop(),
    });
  }, [handleAttemptPlace]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAndroidCode || pendingAd) {
        if (e.key === 'Escape') {
          setShowAndroidCode(false);
          setPendingAd(null);
        }
        return;
      }

      if (phaseRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enterPlayingFromTitle();
        }
        return;
      }

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phaseRef.current === 'playing') {
          e.preventDefault();
          syncUiAndCanvas('paused');
        } else if (phaseRef.current === 'paused') {
          e.preventDefault();
          syncUiAndCanvas('playing');
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        setSoundOn((prev) => {
          const next = !prev;
          soundAndHaptics.setSoundEnabled(next);
          return next;
        });
        return;
      }

      if (phaseRef.current === 'playing') {
        if (e.key === '1' || e.key === '2' || e.key === '3') {
          const idx = Number(e.key) - 1;
          controllerRef.current?.selectTraySlot(idx);
          soundAndHaptics.playPickup();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enterPlayingFromTitle, pendingAd, showAndroidCode, syncUiAndCanvas]);

  const toggleSound = () => {
    const next = !soundOn;
    soundAndHaptics.setSoundEnabled(next);
    setSoundOn(next);
    if (next) soundAndHaptics.playPickup();
  };

  const toggleHaptics = () => {
    const next = !hapticsOn;
    soundAndHaptics.setHapticsEnabled(next);
    setHapticsOn(next);
    if (next) soundAndHaptics.playPickup();
  };

  const requestRerollAd = () => {
    if (!adReady) {
      soundAndHaptics.playInvalidDrop();
      showToast('No Ad Ready — check connection or enable ads in Pause');
      return;
    }
    setPendingAd('reroll');
  };

  const requestReviveAd = () => {
    if (reviveUsedRef.current) return;
    if (!adReady) {
      soundAndHaptics.playInvalidDrop();
      showToast('No Ad Ready — check connection or enable ads in Pause');
      return;
    }
    setPendingAd('revive');
  };

  const handleRewardEarned = useCallback(() => {
    const type = pendingAd;
    setPendingAd(null);

    if (type === 'reroll') {
      trayRef.current = generateSmartTray(gridRef.current, true);
      soundAndHaptics.playPowerUp();
      persistCurrentRun();
      syncUiAndCanvas('playing', { animateTraySpawn: true });
      if (!hasAnyValidMove(gridRef.current, trayRef.current)) {
        syncUiAndCanvas('gameover');
      }
    } else if (type === 'revive') {
      const { nextGrid, reviveTray, clearedCells } = applyReviveBoardClear(gridRef.current);
      gridRef.current = nextGrid;
      trayRef.current = reviveTray;
      reviveUsedRef.current = true;
      soundAndHaptics.playPowerUp();
      persistCurrentRun();
      syncUiAndCanvas('playing', { animateTraySpawn: true });
      controllerRef.current?.triggerReviveFX(clearedCells);
    }
  }, [pendingAd, persistCurrentRun, syncUiAndCanvas]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0B0F1A]">
      {/* Isolated 60 FPS Canvas Viewport */}
      <div className="fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          data-testid="block-muddle-canvas"
          aria-label="Block Muddle 8 by 8 puzzle board and block tray"
          className="block w-full h-full touch-none"
        />
      </div>

      {/* Pointer-transparent HUD Overlay Layer (no backdrop-blur over live canvas) */}
      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between">
        {/* GAMEPLAY HUD BAR (visible when playing, paused, or gameover) */}
        {hud.phase !== 'title' && (
          <header className="w-full max-w-[520px] mx-auto px-4 pt-3 sm:pt-4 flex items-center justify-between gap-3 pointer-events-auto">
            {/* Current Score */}
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Score
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="hud-score"
                  className="font-display text-2xl sm:text-3xl font-extrabold text-slate-50 tabular-nums leading-none"
                >
                  {hud.score}
                </span>
                {hud.comboStreak >= 2 && (
                  <span className="text-xs font-bold text-amber-400 tabular-nums">
                    ×{hud.comboStreak}
                  </span>
                )}
              </div>
            </div>

            {/* Best Score with Crown */}
            <div className="flex flex-col items-center">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-amber-400">
                <CrownIcon className="w-3.5 h-3.5" />
                Best
              </span>
              <span
                data-testid="hud-best"
                className="font-display text-lg sm:text-xl font-bold text-slate-100 tabular-nums leading-tight"
              >
                {hud.highScore}
              </span>
            </div>

            {/* Reroll Ad & Pause Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestRerollAd}
                aria-label="Reroll tray pieces by watching ad"
                title="Reroll tray pieces (Watch Ad)"
                className={`relative flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs font-bold transition-transform active:scale-95 whitespace-nowrap shrink-0 ${
                  adReady
                    ? 'bg-[#162035] border-amber-500/40 text-amber-300 hover:bg-[#1E2B45]'
                    : 'bg-[#141B2B] border-slate-700/60 text-slate-500 opacity-65'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reroll</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-[#0B0F1A] text-[9px] font-extrabold leading-none">
                  <Play className="w-2 h-2 fill-current" />
                  AD
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  soundAndHaptics.playPickup();
                  syncUiAndCanvas('paused');
                }}
                aria-label="Pause game"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#162035] border border-slate-700/70 text-slate-100 hover:bg-[#1E2B45] transition-transform active:scale-95 shrink-0"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </header>
        )}

        {/* TITLE SCREEN */}
        {hud.phase === 'title' && (
          <main className="w-full h-full flex flex-col items-center justify-between px-6 py-8 sm:py-10 bg-[#0B0F1A]/86 pointer-events-auto">
            <div className="w-full max-w-md flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAndroidCode(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#151E31] border border-slate-700/70 text-xs font-semibold text-slate-200 hover:border-amber-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Code2 className="w-4 h-4 text-amber-400" />
                <span>Android Studio Code</span>
              </button>
            </div>

            <div className="flex flex-col items-center w-full max-w-sm gap-7">
              <TitleEmblem />

              {/* High Score Badge */}
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#131B2C] border border-slate-700/70 shadow-lg">
                <CrownIcon className="w-5 h-5" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                    High Score
                  </span>
                  <span
                    data-testid="menu-high-score"
                    className="font-display text-2xl font-extrabold text-slate-50 tabular-nums leading-none"
                  >
                    {hud.highScore}
                  </span>
                </div>
              </div>

              {/* Primary CTA & Audio/Haptic Toggles (<= 3 primary actions) */}
              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  data-start="true"
                  onClick={enterPlayingFromTitle}
                  className="w-full h-14 rounded-2xl bg-amber-400 hover:bg-amber-300 text-[#0B0F1A] font-display text-lg font-extrabold tracking-wide flex items-center justify-center gap-2.5 shadow-[0_8px_24px_rgba(245,158,11,0.3)] transition-transform active:scale-[0.98]"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{hud.hasSavedRun ? 'Continue Run' : 'Play'}</span>
                </button>

                {hud.hasSavedRun && (
                  <button
                    type="button"
                    onClick={() => {
                      soundAndHaptics.playPickup();
                      startNewRun(true);
                    }}
                    className="w-full h-11 rounded-xl bg-[#151E31] hover:bg-[#1C2740] border border-slate-700/70 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-400" />
                    <span>Start Fresh Board</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className={`h-11 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      soundOn
                        ? 'bg-[#151E31] border-slate-700/80 text-slate-100'
                        : 'bg-[#101624] border-slate-800 text-slate-500'
                    }`}
                  >
                    {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                    <span>Sound: {soundOn ? 'On' : 'Off'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleHaptics}
                    className={`h-11 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      hapticsOn
                        ? 'bg-[#151E31] border-slate-700/80 text-slate-100'
                        : 'bg-[#101624] border-slate-800 text-slate-500'
                    }`}
                  >
                    <Smartphone className={`w-4 h-4 ${hapticsOn ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span>Vibrate: {hapticsOn ? 'On' : 'Off'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Single Flat Control-Hint Line */}
            <p className="text-xs text-slate-400 text-center tracking-wide">
              Drag blocks onto the 8×8 grid · Keys 1–3 Select · P Pause · Enter Play
            </p>
          </main>
        )}
      </div>

      {/* PAUSE MODAL */}
      {hud.phase === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070A12]/85 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Game Paused"
        >
          <div className="animate-modal-in w-full max-w-xs rounded-2xl bg-[#131B2C] border border-slate-700/80 p-6 shadow-2xl flex flex-col gap-3">
            <h2 className="font-display text-xl font-extrabold text-center text-slate-50 tracking-wide">
              Game Paused
            </h2>

            <button
              type="button"
              onClick={() => {
                soundAndHaptics.playPickup();
                syncUiAndCanvas('playing');
              }}
              className="mt-2 w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B0F1A] font-display font-bold text-base transition-transform active:scale-95"
            >
              Resume
            </button>

            <button
              type="button"
              onClick={() => {
                soundAndHaptics.playPickup();
                startNewRun(true);
              }}
              className="w-full h-11 rounded-xl bg-[#1A243B] hover:bg-[#222F4D] border border-slate-700/70 text-slate-100 text-sm font-semibold transition-colors"
            >
              Restart
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={toggleSound}
                className="h-11 rounded-xl bg-[#182237] border border-slate-700/70 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
              >
                {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                <span>{soundOn ? 'Sound On' : 'Muted'}</span>
              </button>

              <button
                type="button"
                onClick={toggleHaptics}
                className="h-11 rounded-xl bg-[#182237] border border-slate-700/70 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
              >
                <Smartphone className={`w-4 h-4 ${hapticsOn ? 'text-sky-400' : 'text-slate-500'}`} />
                <span>{hapticsOn ? 'Haptic On' : 'Off'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAdReady((v) => !v)}
              className="w-full h-10 rounded-xl bg-[#111829] border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center justify-center gap-2 hover:border-slate-600"
            >
              {adReady ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Ad Network: {adReady ? 'Ready (Online)' : 'Offline Fallback'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAndroidCode(true)}
              className="w-full h-10 rounded-xl bg-[#111829] border border-slate-700/60 text-xs font-medium text-amber-300 flex items-center justify-center gap-2 hover:border-amber-500/40"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>View Android Kotlin Source</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundAndHaptics.playPickup();
                syncUiAndCanvas('title');
              }}
              className="mt-1 w-full h-10 rounded-xl text-slate-400 hover:text-slate-100 text-sm font-medium transition-colors"
            >
              Main Menu
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {hud.phase === 'gameover' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070A12]/88 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Game Over"
        >
          <div className="animate-modal-in w-full max-w-xs rounded-2xl bg-[#131B2C] border border-slate-700/80 p-6 shadow-2xl flex flex-col items-center text-center">
            <h2 className="font-display text-2xl font-extrabold text-slate-50">
              No More Moves
            </h2>

            {hud.isNewBest && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-400">
                <CrownIcon className="w-4 h-4" />
                <span>New High Score!</span>
              </div>
            )}

            <div className="mt-5 w-full grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#0E1422] border border-slate-800 py-3 px-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Final Score
                </div>
                <div
                  data-testid="gameover-score"
                  className="mt-1 font-display text-2xl font-extrabold text-slate-50 tabular-nums"
                >
                  {hud.score}
                </div>
              </div>

              <div className="rounded-xl bg-[#0E1422] border border-slate-800 py-3 px-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Best
                </div>
                <div className="mt-1 font-display text-2xl font-extrabold text-amber-300 tabular-nums">
                  {hud.highScore}
                </div>
              </div>
            </div>

            {!hud.reviveUsed && (
              <button
                type="button"
                onClick={requestReviveAd}
                className={`mt-5 w-full h-12 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 ${
                  adReady
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-[#0B0F1A]'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 opacity-70'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Revive (Watch Ad)</span>
              </button>
            )}

            <button
              type="button"
              data-start="true"
              onClick={() => {
                soundAndHaptics.playPickup();
                startNewRun(true);
              }}
              className="mt-3 w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B0F1A] font-display font-extrabold text-base transition-transform active:scale-95"
            >
              Play Again
            </button>

            <button
              type="button"
              onClick={() => {
                soundAndHaptics.playPickup();
                syncUiAndCanvas('title');
              }}
              className="mt-2 w-full h-10 rounded-xl text-slate-400 hover:text-slate-100 text-sm font-medium transition-colors"
            >
              Main Menu
            </button>
          </div>
        </div>
      )}

      {/* SIMULATED REWARDED AD OVERLAY */}
      {pendingAd && (
        <RewardedAdOverlay
          rewardLabel={
            pendingAd === 'revive'
              ? 'Clear 4×4 Center & Three 1×1 Blocks'
              : 'Fresh Set of 3 Easy Blocks'
          }
          onComplete={handleRewardEarned}
          onCancel={() => setPendingAd(null)}
        />
      )}

      {/* ANDROID KOTLIN SOURCE MODAL */}
      {showAndroidCode && (
        <AndroidSourceModal onClose={() => setShowAndroidCode(false)} />
      )}

      {/* CLEAN TOAST FEEDBACK (e.g. Offline No Ad Ready) */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#1A243B] border border-slate-600/80 text-xs font-semibold text-slate-100 shadow-xl pointer-events-none"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
