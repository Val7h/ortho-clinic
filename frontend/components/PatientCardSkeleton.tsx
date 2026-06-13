'use client';
/**
 * PatientCardSkeleton — Sprint 6 perf edition
 *
 * Optimisations:
 *   1. content-visibility: auto  — browser skips layout/paint for off-screen
 *      skeletons, crucial when rendering 5+ in a column.
 *   2. contain-intrinsic-size   — prevents layout shift when skeleton enters
 *      the viewport.
 *   3. will-change: opacity     — hints the GPU to composite the pulse animation
 *      on its own layer, keeping animations on the compositor thread (60 fps).
 */
export default function PatientCardSkeleton() {
  return (
    <div
      className="card p-4 flex items-center gap-3.5 pointer-events-none"
      aria-hidden="true"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 80px',
      }}
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-700 flex-shrink-0"
        style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', willChange: 'opacity' }}
      />

      {/* Text lines */}
      <div className="flex-1 min-w-0 space-y-2">
        <div
          className="h-4 w-48 max-w-full rounded bg-slate-200 dark:bg-slate-700"
          style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', willChange: 'opacity' }}
        />
        <div className="flex gap-3">
          <div
            className="h-3 w-16 rounded bg-slate-100 dark:bg-slate-800"
            style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite 150ms', willChange: 'opacity' }}
          />
          <div
            className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800"
            style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite 300ms', willChange: 'opacity' }}
          />
        </div>
      </div>

      {/* Chevron placeholder */}
      <div
        className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex-shrink-0"
        style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', willChange: 'opacity' }}
      />
    </div>
  );
}
