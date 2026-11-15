import { useState } from 'react';
import { Check, Copy, FileCode2, X } from 'lucide-react';

import buildGradleRaw from '../../android/app/build.gradle.kts?raw';
import manifestRaw from '../../android/app/src/main/AndroidManifest.xml?raw';
import adManagerRaw from '../../android/app/src/main/java/com/blockmuddle/game/AdManager.kt?raw';
import gameModelsRaw from '../../android/app/src/main/java/com/blockmuddle/game/GameModels.kt?raw';
import gameEngineRaw from '../../android/app/src/main/java/com/blockmuddle/game/GameEngine.kt?raw';
import blockMuddleViewRaw from '../../android/app/src/main/java/com/blockmuddle/game/BlockMuddleView.kt?raw';
import soundHapticRaw from '../../android/app/src/main/java/com/blockmuddle/game/SoundAndHapticManager.kt?raw';
import mainActivityRaw from '../../android/app/src/main/java/com/blockmuddle/game/MainActivity.kt?raw';
import activityMainXmlRaw from '../../android/app/src/main/res/layout/activity_main.xml?raw';
import dialogPauseXmlRaw from '../../android/app/src/main/res/layout/dialog_pause.xml?raw';
import dialogGameOverXmlRaw from '../../android/app/src/main/res/layout/dialog_game_over.xml?raw';
import colorsXmlRaw from '../../android/app/src/main/res/values/colors.xml?raw';
import stringsXmlRaw from '../../android/app/src/main/res/values/strings.xml?raw';

interface AndroidFileEntry {
  id: string;
  label: string;
  path: string;
  content: string;
}

const ANDROID_FILES: AndroidFileEntry[] = [
  {
    id: 'gradle',
    label: 'build.gradle.kts',
    path: 'app/build.gradle.kts',
    content: buildGradleRaw,
  },
  {
    id: 'manifest',
    label: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    content: manifestRaw,
  },
  {
    id: 'admanager',
    label: 'AdManager.kt',
    path: 'app/src/main/java/com/blockmuddle/game/AdManager.kt',
    content: adManagerRaw,
  },
  {
    id: 'models',
    label: 'GameModels.kt',
    path: 'app/src/main/java/com/blockmuddle/game/GameModels.kt',
    content: gameModelsRaw,
  },
  {
    id: 'engine',
    label: 'GameEngine.kt',
    path: 'app/src/main/java/com/blockmuddle/game/GameEngine.kt',
    content: gameEngineRaw,
  },
  {
    id: 'view',
    label: 'BlockMuddleView.kt',
    path: 'app/src/main/java/com/blockmuddle/game/BlockMuddleView.kt',
    content: blockMuddleViewRaw,
  },
  {
    id: 'audio',
    label: 'SoundAndHapticManager.kt',
    path: 'app/src/main/java/com/blockmuddle/game/SoundAndHapticManager.kt',
    content: soundHapticRaw,
  },
  {
    id: 'activity',
    label: 'MainActivity.kt',
    path: 'app/src/main/java/com/blockmuddle/game/MainActivity.kt',
    content: mainActivityRaw,
  },
  {
    id: 'layout_main',
    label: 'activity_main.xml',
    path: 'app/src/main/res/layout/activity_main.xml',
    content: activityMainXmlRaw,
  },
  {
    id: 'layout_pause',
    label: 'dialog_pause.xml',
    path: 'app/src/main/res/layout/dialog_pause.xml',
    content: dialogPauseXmlRaw,
  },
  {
    id: 'layout_gameover',
    label: 'dialog_game_over.xml',
    path: 'app/src/main/res/layout/dialog_game_over.xml',
    content: dialogGameOverXmlRaw,
  },
  {
    id: 'colors',
    label: 'colors.xml',
    path: 'app/src/main/res/values/colors.xml',
    content: colorsXmlRaw,
  },
  {
    id: 'strings',
    label: 'strings.xml',
    path: 'app/src/main/res/values/strings.xml',
    content: stringsXmlRaw,
  },
];

interface AndroidSourceModalProps {
  onClose: () => void;
}

export function AndroidSourceModal({ onClose }: AndroidSourceModalProps) {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile = ANDROID_FILES.find((f) => f.id === selectedId) ?? ANDROID_FILES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedId(activeFile.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#070A12]/90 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Android Studio Kotlin Source Code"
    >
      <div className="animate-modal-in w-full max-w-5xl h-[86vh] flex flex-col rounded-2xl bg-[#131B2C] border border-slate-700/70 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-700/70 bg-[#0F1625]">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCode2 className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-100 truncate">
              Android Studio Kotlin Source (SDK 34 · Min SDK 24)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Android source viewer"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <nav
            aria-label="Android project files"
            className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-700/70 bg-[#0E1422] p-2.5 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1"
          >
            {ANDROID_FILES.map((file) => {
              const active = file.id === activeFile.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedId(file.id)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                  }`}
                >
                  {file.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0B0F1A]">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#101625]">
              <code className="font-mono-code text-xs text-slate-300 truncate">
                {activeFile.path}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === activeFile.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    Copy File
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-xs leading-relaxed font-mono-code text-slate-200 select-text">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
