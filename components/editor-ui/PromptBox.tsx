import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Square, Undo2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Project, ProjectFile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PromptBoxProps {
  project: Project;
  // Recent console errors, so Claude can fix them
  errors: string[];
  onRestore: (files: ProjectFile[]) => void;
}

type Turn = { prompt: string; reply: string };
type State =
  | { kind: 'idle' }
  | { kind: 'working'; status: string }
  | { kind: 'done'; text: string; before: ProjectFile[] }
  | { kind: 'error'; text: string };

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
  try { localStorage.setItem(historyKey(id), JSON.stringify(turns.slice(-8))); } catch {}
};

// Floating box at the bottom centre: type a request, Claude Code changes the sketch in place
const PromptBox = ({ project, errors, onRestore }: PromptBoxProps) => {
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyIndex = useRef(-1);
  const working = state.kind === 'working';
  const [model, setModel] = useState(MODELS[0].id);
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

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || working) return;
    const before = project.files.map(f => ({ ...f }));
    const history = readHistory(project.id);
    setText('');
    historyIndex.current = -1;
    setState({ kind: 'working', status: 'Thinking…' });

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
          history,
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
          if (e.type === 'status') setState({ kind: 'working', status: e.text });
          if (e.type === 'done') {
            setState({ kind: 'done', text: e.text, before });
            writeHistory(project.id, [...history, { prompt, reply: e.text }]);
            ended = true;
          }
          if (e.type === 'error') { setState({ kind: 'error', text: e.text }); ended = true; }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') setState({ kind: 'idle' });
      else setState({ kind: 'error', text: (err as Error).message });
    } finally {
      abortRef.current = null;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); if (working) abortRef.current?.abort(); else inputRef.current?.blur(); }
    // Up and down step through earlier prompts
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !working) {
      const turns = readHistory(project.id);
      if (!turns.length) return;
      e.preventDefault();
      const i = historyIndex.current;
      const next = e.key === 'ArrowUp' ? Math.min(turns.length - 1, i + 1) : i - 1;
      historyIndex.current = next;
      setText(next < 0 ? '' : turns[turns.length - 1 - next].prompt);
    }
  };

  return (
    <div className="dial-surface absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(420px,calc(100vw-1.5rem))] p-1">
      {state.kind !== 'idle' && (
        <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1 text-[12px] min-h-7">
          {working && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground animate-pulse" />}
          <span className={cn('flex-1 min-w-0', state.kind === 'error' ? 'text-red-400' : working ? 'text-muted-foreground' : 'text-foreground')}>
            {state.kind === 'working' ? state.status : state.text}
          </span>
          {state.kind === 'done' && (
            <button
              title="Undo this change"
              onClick={() => { onRestore(state.before); setState({ kind: 'idle' }); }}
              className="shrink-0 h-6 px-2 flex items-center gap-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] transition-colors"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          )}
          {!working && (
            <button title="Dismiss" onClick={() => setState({ kind: 'idle' })} className="shrink-0 h-6 w-6 flex items-center justify-center rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={working ? 'Claude is working…' : 'Ask Claude to change the sketch  ⌘K'}
          disabled={working}
          className="flex-1 min-w-0 h-9 px-2.5 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Model"
              disabled={working}
              className="h-9 shrink-0 flex items-center gap-1 px-2 rounded-[9px] text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] data-[state=open]:bg-[rgb(var(--ink)/0.11)] data-[state=open]:text-foreground disabled:opacity-40 transition-colors"
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
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[9px] bg-[rgb(var(--ink))] text-[var(--chrome)] hover:bg-[rgb(var(--ink)/0.85)] disabled:opacity-30 transition-colors"
        >
          {working ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

export default PromptBox;
