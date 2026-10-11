import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { XCircle, AlertCircle, Info } from 'lucide-react';

export type LogMessage = {
  id: string;
  type: 'error' | 'warning' | 'log' | 'info';
  content: string;
  timestamp: number;
};

interface ConsoleProps {
  messages: LogMessage[];
  onClear: () => void;
  className?: string;
}

const Console = ({ messages, onClear, className }: ConsoleProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className={cn("flex flex-col h-full min-w-0", className)}>
      <div className="flex justify-between items-center h-11 pl-3 pr-1.5 shrink-0">
        <h3 className="text-[13px] font-semibold text-foreground">
          Console
          {messages.length > 0 && (
            <span className="ml-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{messages.length}</span>
          )}
        </h3>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="h-7 px-2 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-white/[0.1] hover:text-foreground shrink-0 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto font-mono px-3 pb-3 min-w-0">
        {messages.length === 0 ? (
          <div className="text-muted-foreground/60 text-[12px]">Nothing logged yet</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "px-2 py-1 rounded-md flex items-start gap-2 min-w-0 text-foreground/80",
                msg.type === 'error' && "text-red-400 bg-red-500/[0.08]",
                msg.type === 'warning' && "text-amber-400 bg-amber-500/[0.06]",
                msg.type === 'info' && "text-sky-300",
              )}
            >
              {msg.type === 'error' && <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {msg.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {msg.type === 'info' && <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1 overflow-hidden">
                <pre className="whitespace-pre-wrap break-words break-all text-xs leading-relaxed overflow-wrap-anywhere">
                  {msg.content}
                </pre>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default Console; 