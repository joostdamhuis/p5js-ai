import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { XCircle, AlertCircle, Info, Sparkles, Check } from 'lucide-react';

export type LogMessage = {
  id: string;
  type: 'error' | 'warning' | 'log' | 'info';
  content: string;
  timestamp: number;
};

interface ConsoleProps {
  messages: LogMessage[];
  onClear: () => void;
  // Used in the message copied by "Fix with Claude"
  sketchName?: string;
  className?: string;
}

const Console = ({ messages, onClear, sketchName, className }: ConsoleProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const firstError = messages.find(m => m.type === 'error');

  // Copies a short request to paste into Claude. Claude then reads the code
  // and console itself with the get_sketch tool and sends the fix back.
  const fixWithClaude = async (error: LogMessage) => {
    const text = `Fix the error in my p5.js sketch "${sketchName || 'sketch'}":\n${error.content}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

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
        <div className="flex items-center gap-0.5">
        {firstError && (
          <button
            onClick={() => fixWithClaude(firstError)}
            title="Copy a request to paste into Claude. Claude reads the error and code and sends the fix."
            className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-foreground bg-white/[0.05] hover:bg-white/[0.1] shrink-0 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Sparkles className="h-3 w-3" />}
            {copied ? 'Copied, paste in Claude' : 'Fix with Claude'}
          </button>
        )}
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="h-7 px-2 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-white/[0.1] hover:text-foreground shrink-0 transition-colors"
          >
            Clear
          </button>
        )}
        </div>
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