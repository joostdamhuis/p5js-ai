import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  // 'x' sits between columns and drags sideways, 'y' sits between rows
  axis: 'x' | 'y';
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  // Set when dragging towards the start should grow the panel (right column, bottom row)
  invert?: boolean;
  // Double-click resets
  onReset?: () => void;
  className?: string;
}

// The 8px gap between two panels, used as a drag handle. A small pill shows on hover.
const ResizeHandle = ({ axis, value, onChange, min, max, invert, onReset, className }: ResizeHandleProps) => {
  const [dragging, setDragging] = useState(false);
  const cursor = axis === 'x' ? 'cursor-col-resize' : 'cursor-row-resize';

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const startValue = value;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const delta = ((axis === 'x' ? ev.clientX : ev.clientY) - start) * (invert ? -1 : 1);
      onChange(Math.round(Math.max(min, Math.min(max, startValue + delta))));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      title="Drag to resize, double-click to reset"
      className={cn(
        'group shrink-0 flex items-center justify-center touch-none',
        axis === 'x' ? 'w-2' : 'h-2',
        cursor,
        className
      )}
    >
      <div
        className={cn(
          'rounded-full transition-colors',
          axis === 'x' ? 'w-0.5 h-8' : 'h-0.5 w-8',
          dragging ? 'bg-[rgb(var(--ink)/0.4)]' : 'bg-[rgb(var(--ink)/0.0)] group-hover:bg-[rgb(var(--ink)/0.2)]'
        )}
      />
      {/* While dragging, cover the page so the sketch iframe can't swallow the mouse */}
      {dragging && <div className={cn('fixed inset-0 z-50', cursor)} />}
    </div>
  );
};

export default ResizeHandle;
