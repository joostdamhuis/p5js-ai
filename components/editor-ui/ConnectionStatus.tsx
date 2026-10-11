import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { McpStatus } from './WebSocketListener';

interface ConnectionStatusProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  status: McpStatus;
}

const LABELS: Record<McpStatus | 'off', { text: string; dot: string }> = {
  off: { text: 'Claude off', dot: 'bg-white/30' },
  connecting: { text: 'Connecting…', dot: 'bg-white/50 animate-pulse' },
  offline: { text: 'Hub offline', dot: 'bg-red-400' },
  waiting: { text: 'Waiting for Claude', dot: 'bg-amber-300' },
  connected: { text: 'Claude connected', dot: 'bg-emerald-400' },
};

type Check = { label: string; ok: boolean | null; detail: string };

// Header pill showing whether Claude can control the editor. Click it for a
// checklist of the three parts (editor, hub, Claude) with plain-language fixes.
const ConnectionStatus = ({ enabled, onEnabledChange, status }: ConnectionStatusProps) => {
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
          'flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium transition-colors',
          open ? 'bg-white/[0.11] text-foreground' : 'bg-white/[0.05] text-foreground hover:bg-white/[0.1]'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', label.dot)} />
        {label.text}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-white/10 bg-popover p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
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
                enabled ? 'bg-white' : 'bg-white/15'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full transition-all',
                  enabled ? 'left-[18px] bg-[#212121]' : 'left-0.5 bg-white/70'
                )}
              />
            </button>
          </div>

          <div className="space-y-1">
            {checks.map((check) => (
              <div key={check.label} className="flex gap-2.5 rounded-lg bg-white/[0.05] px-2.5 py-2">
                {/* Same height as the label's line, so the dot is centred on it */}
                <span className="flex h-5 shrink-0 items-center">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      check.ok === null ? 'bg-white/30' : check.ok ? 'bg-emerald-400' : 'bg-red-400'
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
