import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { McpStatus } from './WebSocketListener';

interface ConnectionStatusProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  status: McpStatus;
  // Dock layout: a round, translucent pill like the rest of the floating chrome
  pill?: boolean;
  // Popup width, so it can match the panel below it (default 320px)
  popupWidth?: number;
}

const LABELS: Record<McpStatus | 'off', { text: string; dot: string }> = {
  off: { text: 'Claude off', dot: 'bg-[rgb(var(--ink)/0.3)]' },
  connecting: { text: 'Connecting…', dot: 'bg-[rgb(var(--ink)/0.5)] animate-pulse' },
  offline: { text: 'Hub offline', dot: 'bg-red-400' },
  waiting: { text: 'Waiting for Claude', dot: 'bg-amber-300' },
  connected: { text: 'Claude connected', dot: 'bg-emerald-400' },
};

type Check = { label: string; ok: boolean | null; detail: string };

// Header pill showing whether Claude can control the editor. Click it for a
// checklist of the three parts (editor, hub, Claude) with plain-language fixes.
const ConnectionStatus = ({ enabled, onEnabledChange, status, pill, popupWidth = 320 }: ConnectionStatusProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = LABELS[enabled ? status : 'off'];
  const hubUp = status === 'waiting' || status === 'connected';

  const checks: Check[] = [
    { label: 'Editor', ok: true, detail: 'Running' },
    {
      label: 'Hub',
      ok: !enabled || status === 'connecting' ? null : hubUp,
      detail: !enabled ? 'Not checked while Claude is off'
        : status === 'connecting' ? 'Checking…'
          : hubUp ? 'Running'
            : 'Not running. Double-click start-p5.command in the p5js-ai-editor folder (Documents).',
    },
    {
      label: 'Claude',
      ok: !enabled || !hubUp ? null : status === 'connected',
      detail: !enabled ? 'Not checked while Claude is off'
        : !hubUp ? 'Waiting for the hub'
          : status === 'connected' ? 'Connected'
            : 'Not connected. Open the Claude app. If it is already open, quit it (⌘Q) and open it again.',
    },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Claude connection"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 text-[13px] font-medium transition-colors',
          pill
            ? 'dial-surface h-10 px-3.5 ' + (open ? '!bg-[var(--chrome-raised)]' : 'hover:!bg-[var(--chrome-raised)]')
            : 'h-8 px-3 rounded-lg ' + (open ? 'bg-[rgb(var(--ink)/0.11)]' : 'bg-[rgb(var(--ink)/0.05)] hover:bg-[rgb(var(--ink)/0.1)]'),
          'text-foreground'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', label.dot)} />
        {label.text}
      </button>

      {open && (
        <div className="dial-surface absolute right-0 top-12 z-50 !bg-[var(--chrome)] p-3" style={{ width: popupWidth }}>
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <div className="text-[13px] font-semibold">Let Claude control the editor</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Claude can write and run sketches here</div>
            </div>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => onEnabledChange(!enabled)}
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                enabled ? 'bg-[rgb(var(--ink))]' : 'bg-[rgb(var(--ink)/0.15)]'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full transition-all',
                  enabled ? 'left-[18px] bg-[var(--chrome)]' : 'left-0.5 bg-[rgb(var(--ink)/0.7)]'
                )}
              />
            </button>
          </div>

          <div className="space-y-1">
            {checks.map((check) => (
              <div key={check.label} className="flex gap-2.5 rounded-lg bg-[rgb(var(--ink)/0.05)] px-3 py-2">
                {/* Same height as the label's line, so the dot is centred on it */}
                <span className="flex h-5 shrink-0 items-center">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      check.ok === null ? 'bg-[rgb(var(--ink)/0.3)]' : check.ok ? 'bg-emerald-400' : 'bg-red-400'
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] leading-5 font-medium">{check.label}</div>
                  <div className={cn('text-[12px] leading-relaxed', check.ok === false ? 'text-foreground/80' : 'text-muted-foreground')}>
                    {check.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
