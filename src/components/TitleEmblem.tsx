export function TitleEmblem() {
  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <svg
        viewBox="0 0 220 72"
        className="w-52 h-[68px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]"
        aria-hidden="true"
      >
        {/* 2x2 L-cluster + single accent block crafted with 3D bevels */}
        <g transform="translate(22, 10)">
          {/* Sapphire block */}
          <rect x="0" y="0" width="24" height="24" rx="5" fill="#3B82F6" />
          <path d="M5,0 H19 L21,3 H3 V21 L0,19 V5 Q0,0 5,0 Z" fill="#60A5FA" />
          <path d="M24,5 V19 Q24,24 19,24 H5 L3,21 H21 V3 Z" fill="#1D4ED8" />
          <rect x="4" y="4" width="16" height="4" rx="2" fill="rgba(255,255,255,0.32)" />

          {/* Emerald block */}
          <rect x="27" y="0" width="24" height="24" rx="5" fill="#10B981" />
          <path d="M32,0 H46 L48,3 H30 V21 L27,19 V5 Q27,0 32,0 Z" fill="#34D399" />
          <path d="M51,5 V19 Q51,24 46,24 H32 L30,21 H48 V3 Z" fill="#047857" />
          <rect x="31" y="4" width="16" height="4" rx="2" fill="rgba(255,255,255,0.32)" />

          {/* Ruby block */}
          <rect x="27" y="27" width="24" height="24" rx="5" fill="#EF4444" />
          <path d="M32,27 H46 L48,30 H30 V48 L27,46 V32 Q27,27 32,27 Z" fill="#F87171" />
          <path d="M51,32 V46 Q51,51 46,51 H32 L30,48 H48 V30 Z" fill="#B91C1C" />
          <rect x="31" y="31" width="16" height="4" rx="2" fill="rgba(255,255,255,0.32)" />

          {/* Gold crown-accent block */}
          <rect x="54" y="27" width="24" height="24" rx="5" fill="#F59E0B" />
          <path d="M59,27 H73 L75,30 H57 V48 L54,46 V32 Q54,27 59,27 Z" fill="#FBBF24" />
          <path d="M78,32 V46 Q78,51 73,51 H59 L57,48 H75 V30 Z" fill="#B45309" />
          <rect x="58" y="31" width="16" height="4" rx="2" fill="rgba(255,255,255,0.38)" />

          {/* Amethyst floating corner */}
          <rect x="116" y="13" width="24" height="24" rx="5" fill="#8B5CF6" />
          <path d="M121,13 H135 L137,16 H119 V34 L116,32 V18 Q116,13 121,13 Z" fill="#A78BFA" />
          <path d="M140,18 V32 Q140,37 135,37 H121 L119,34 H137 V16 Z" fill="#6D28D9" />
          <rect x="120" y="17" width="16" height="4" rx="2" fill="rgba(255,255,255,0.32)" />

          {/* Cyan tile */}
          <rect x="143" y="13" width="24" height="24" rx="5" fill="#06B6D4" />
          <path d="M148,13 H162 L164,16 H146 V34 L143,32 V18 Q143,13 148,13 Z" fill="#22D3EE" />
          <path d="M167,18 V32 Q167,37 162,37 H148 L146,34 H164 V16 Z" fill="#0E7490" />
          <rect x="147" y="17" width="16" height="4" rx="2" fill="rgba(255,255,255,0.32)" />
        </g>
      </svg>

      <div className="text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-50 drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
          BLOCK <span className="text-amber-400">MUDDLE</span>
        </h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400 tracking-wide">
          8×8 Tactile Block Puzzle · Combos &amp; Line Clears
        </p>
      </div>
    </div>
  );
}
