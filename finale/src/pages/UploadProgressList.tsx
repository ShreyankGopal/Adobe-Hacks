// UploadProgressList.tsx
import React from 'react';
import { X, Check } from 'lucide-react';

export type ProgressEntry = { pct: number; status: 'queued' | 'uploading' | 'done' | 'error' | 'canceled' };
export type ProgressMap = Record<string, ProgressEntry>;

type Props = {
  progressMap: ProgressMap;
  onCancel: (fileName: string) => void;
};

const UploadProgressList: React.FC<Props> = ({ progressMap, onCancel }) => {
  const entries = Object.entries(progressMap);

  if (!entries.length) return null;

  return (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="bg-[#071425]/60 border border-[#16324A] rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="rgba(77,163,255,0.6)" strokeWidth="2" />
            </svg>
            Uploading files
          </div>
          <div className="text-xs text-gray-300">{entries.length} in progress</div>
        </div>

        <div className="space-y-3">
          {entries.map(([name, info]) => {
            const pct = Math.max(0, Math.min(100, info?.pct || 0));
            const status = info?.status || 'queued';
            const showCancel = status === 'uploading' || status === 'queued';
            const done = status === 'done';
            const error = status === 'error';
            return (
              <div key={name} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-sm truncate max-w-[65%]">{name}</div>
                    <div className="text-xs text-gray-300">{status === 'uploading' ? `${pct}%` : status}</div>
                  </div>

                  <div className="w-full h-2 bg-[#0e1a26] rounded-full overflow-hidden relative">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: done ? 'linear-gradient(90deg, #6EE7B7, #16A34A)' : 'linear-gradient(90deg, #4DA3FF, #6EE7B7)',
                        boxShadow: done ? '0 6px 18px rgba(16,185,129,0.12)' : '0 6px 18px rgba(77,163,255,0.12)',
                        transition: 'width 220ms ease-out',
                      }}
                    />

                    {/* shimmer */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${pct}%`,
                        background:
                          'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)',
                        mixBlendMode: 'overlay',
                        transform: 'translateX(-25%)',
                        animation: 'progressShimmer 1.6s linear infinite',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                </div>

                <div className="w-24 flex items-center justify-end gap-2">
                  {done && <Check className="w-5 h-5 text-green-400" />}
                  {error && <div className="text-xs text-red-300">Failed</div>}
                  {showCancel && (
                    <button
                      onClick={() => onCancel(name)}
                      className="p-1 rounded-md hover:bg-white/5 transition"
                      title="Cancel upload"
                    >
                      <X className="w-4 h-4 text-gray-300" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes progressShimmer {
          0% { transform: translateX(-25%); opacity: 0.9; }
          50% { transform: translateX(0%); opacity: 0.6; }
          100% { transform: translateX(25%); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
};

export default UploadProgressList;
