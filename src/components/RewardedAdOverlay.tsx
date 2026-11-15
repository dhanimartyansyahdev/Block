import { useEffect, useState } from 'react';
import { Film, Sparkles } from 'lucide-react';

interface RewardedAdOverlayProps {
  rewardLabel: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function RewardedAdOverlay({
  rewardLabel,
  onComplete,
  onCancel,
}: RewardedAdOverlayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const durationMs = 1100;
    let frame = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (elapsed < durationMs) {
        frame = requestAnimationFrame(step);
      } else {
        onComplete();
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070A12]/95 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Rewarded Ad Preview"
    >
      <div className="animate-modal-in w-full max-w-sm rounded-2xl bg-[#131B2C] border border-slate-700/80 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center">
          <Film className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-100">
          Rewarded Ad Preview
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Simulating AdMob Unit <span className="font-mono-code text-xs text-slate-300">5224354917</span>
        </p>

        <div className="mt-5 w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-amber-400 transition-[width] duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Granting: {rewardLabel}</span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 text-xs font-medium text-slate-400 hover:text-slate-200 underline underline-offset-4"
        >
          Cancel Ad
        </button>
      </div>
    </div>
  );
}
