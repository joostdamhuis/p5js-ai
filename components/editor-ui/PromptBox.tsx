import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Square, Undo2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Project, ProjectFile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PromptBoxProps {
  project: Project;
  // Recent console errors, so Claude can fix them
  errors: string[];
  onRestore: (files: ProjectFile[]) => void;
}

type Turn = { prompt: string; reply: string; error?: boolean };
type Pending = { prompt: string; status: string };

const MODELS = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', hint: 'Most capable' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', hint: 'Fast and smart' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', hint: 'Quickest' },
];
const MODEL_KEY = 'p5_prompt_model';

const historyKey = (id: string) => `p5_prompts_${id}`;
const readHistory = (id: string): Turn[] => {
  try { return JSON.parse(localStorage.getItem(historyKey(id)) || '[]'); } catch { return []; }
};
const writeHistory = (id: string, turns: Turn[]) => {
  try { localStorage.setItem(historyKey(id), JSON.stringify(turns.slice(-20))); } catch {}
};

// Messaging-style box at the bottom centre: your requests on the right, Claude's replies
// on the left. The thread shows while you're typing or Claude is working.
const PromptBox = ({ project, errors, onRestore }: PromptBoxProps) => {
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  // Files from before the latest reply, for Undo
  const [undo, setUndo] = useState<ProjectFile[] | null>(null);
  const [focused, setFocused] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyIndex = useRef(-1);
  const working = pending !== null;
  const showThread = (focused || working) && (turns.length > 0 || working);
  const expanded = focused || working || text.length > 0;

  useEffect(() => {
    setTurns(readHistory(project.id));
    setUndo(null);
  }, [project.id]);

  useEffect(() => {
    try { const saved = localStorage.getItem(MODEL_KEY); if (saved && MODELS.some(m => m.id === saved)) setModel(saved); } catch {}
  }, []);
  const chooseModel = (id: string) => {
    setModel(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch {}
  };

  // ⌘K jumps to the box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Grow the input with its text, up to about five lines
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // Keep the newest message in view
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, showThread]);

  const addTurn = (turn: Turn) => {
    setTurns(prev => {
      const next = [...prev, turn];
      writeHistory(project.id, next);
      return next;
    });
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || working) return;
    const before = project.files.map(f => ({ ...f }));
    setText('');
    historyIndex.current = -1;
    setUndo(null);
    setPending({ prompt, status: 'Thinking…' });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          sketchName: project.name,
          files: project.files.map(f => ({ name: f.name, content: f.content })),
          errors: errors.slice(-10),
          history: turns.filter(t => !t.error).slice(-8).map(({ prompt, reply }) => ({ prompt, reply })),
          model,
        }),
      });
      if (!res.body) throw new Error('No response');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let ended = false;
      while (!ended) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const e = JSON.parse(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (e.type === 'status') setPending({ prompt, status: e.text });
          if (e.type === 'done') { addTurn({ prompt, reply: e.text }); setUndo(before); ended = true; }
          if (e.type === 'error') { addTurn({ prompt, reply: e.text, error: true }); ended = true; }
        }
      }
      if (!ended) addTurn({ prompt, reply: 'No reply', error: true });
    } catch (err) {
      const stopped = (err as Error).name === 'AbortError';
      addTurn({ prompt, reply: stopped ? 'Stopped' : (err as Error).message, error: true });
    } finally {
      abortRef.current = null;
      setPending(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a line
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); if (working) abortRef.current?.abort(); else inputRef.current?.blur(); }
    // Up and down step through earlier prompts while the input is a single line
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !working && !text.includes('\n')) {
      const sent = turns.map(t => t.prompt);
      if (!sent.length) return;
      e.preventDefault();
      const i = historyIndex.current;
      const next = e.key === 'ArrowUp' ? Math.min(sent.length - 1, i + 1) : i - 1;
      historyIndex.current = next;
      setText(next < 0 ? '' : sent[sent.length - 1 - next]);
    }
  };

  const lastIndex = turns.length - 1;

  return (
    <div
      ref={boxRef}
      onFocus={() => setFocused(true)}
      // Stay open while focus moves inside the box (Undo, the model menu)
      onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget as Node)) setFocused(false); }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(400px,calc(100vw-1.5rem))] flex flex-col gap-2"
    >
      {showThread && (
        <div
          ref={threadRef}
          tabIndex={-1}
          className="dial-surface max-h-[35vh] overflow-y-auto p-3 flex flex-col gap-1.5 outline-none"
        >
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Bubble mine>{t.prompt}</Bubble>
              <Bubble error={t.error}>
                <span>{t.reply}</span>
                {i === lastIndex && undo && !working && (
                  <button
                    onClick={() => { onRestore(undo); setUndo(null); }}
                    className="mt-1 -ml-1.5 flex h-6 items-center gap-1 rounded-[7px] px-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] transition-colors"
                  >
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                )}
              </Bubble>
            </div>
          ))}
          {pending && (
            <div className="flex flex-col gap-1.5">
              <Bubble mine>{pending.prompt}</Bubble>
              <Bubble>
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Typing />
                  {pending.status}
                </span>
              </Bubble>
            </div>
          )}
        </div>
      )}

      {/* Shell with a soft inset card, like a prompt field: compact one line at rest,
          opens into a labelled card with the controls underneath while you type */}
      <div className="dial-surface rounded-[19px] p-[5px]">
        <div
          className={cn(
            'rounded-[14px] border transition-colors',
            expanded
              ? 'bg-[rgb(var(--ink)/0.05)] border-[rgb(var(--ink)/0.55)] px-3 pt-2 pb-1.5'
              : 'border-transparent flex items-end gap-0.5 pl-2.5'
          )}
        >
          {expanded && <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Prompt</div>}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={working ? 'Claude is working…' : expanded ? 'Describe a change to the sketch' : 'Message Claude  ⌘K'}
            disabled={working}
            className={cn(
              'w-full min-w-0 resize-none bg-transparent text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60 block',
              expanded ? 'text-[14px] leading-[21px] min-h-[42px]' : 'flex-1 self-center py-1 text-[13px] leading-5'
            )}
          />
          <div className={cn('flex items-center gap-0.5 shrink-0', expanded && 'justify-end mt-1 -mr-1.5')}>
            {expanded && <span className="mr-auto text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="Model"
                  disabled={working}
                  className="h-7 shrink-0 flex items-center gap-1 px-2 rounded-full text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] data-[state=open]:bg-[rgb(var(--ink)/0.11)] data-[state=open]:text-foreground disabled:opacity-40 transition-colors"
                >
                  {MODELS.find(m => m.id === model)?.name.split(' ')[0]}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={10} className="min-w-60">
                {MODELS.map(m => (
                  <DropdownMenuItem key={m.id} onSelect={() => chooseModel(m.id)} className="flex items-center gap-3 whitespace-nowrap">
                    <span className="flex-1">{m.name}</span>
                    <span className="text-[12px] text-muted-foreground">{m.hint}</span>
                    <Check className={cn('h-3.5 w-3.5', m.id === model ? 'opacity-100' : 'opacity-0')} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              title={working ? 'Stop (Esc)' : 'Send (Enter)'}
              onClick={working ? () => abortRef.current?.abort() : send}
              disabled={!working && !text.trim()}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-[rgb(var(--ink))] text-[var(--chrome)] hover:bg-[rgb(var(--ink)/0.85)] disabled:opacity-25 transition-colors"
            >
              {working ? <Square className="h-2.5 w-2.5 fill-current" /> : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Your messages: solid, right. Claude's: soft grey, left.
const Bubble = ({ mine, error, children }: { mine?: boolean; error?: boolean; children: React.ReactNode }) => (
  <div
    className={cn(
      'max-w-[85%] px-3 py-1.5 text-[13px] leading-5 whitespace-pre-wrap break-words',
      mine
        ? 'self-end rounded-[16px] rounded-br-[5px] bg-[rgb(var(--ink))] text-[var(--chrome)]'
        : 'self-start rounded-[16px] rounded-bl-[5px] bg-[rgb(var(--ink)/0.08)] text-foreground',
      error && 'text-red-400'
    )}
  >
    {children}
  </div>
);

// Three bouncing dots
const Typing = () => (
  <span className="inline-flex gap-0.5">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
      />
    ))}
  </span>
);

export default PromptBox;
