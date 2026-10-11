import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Paperclip, Square, Undo2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Project, ProjectFile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PromptBoxProps {
  project: Project;
  // Recent console errors, so Claude can fix them
  errors: string[];
  onRestore: (files: ProjectFile[]) => void;
  // Toolbar buttons shown at the start of the bar
  tools?: React.ReactNode;
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

// Search-style bar at the bottom centre. Above it, a card shows what Claude is doing,
// its latest reply (with Undo) and, while the bar is empty and focused, recent prompts.
const PromptBox = ({ project, errors, onRestore, tools }: PromptBoxProps) => {
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  // Files from before the latest reply, for Undo
  const [undo, setUndo] = useState<ProjectFile[] | null>(null);
  const [focused, setFocused] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  // Reference images for the next prompt
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') || file.size > 10_000_000) continue;
      const reader = new FileReader();
      reader.onload = () => setAttachments(prev => prev.length >= 6 ? prev : [...prev, { name: file.name || 'image', dataUrl: String(reader.result) }]);
      reader.readAsDataURL(file);
    }
  };
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyIndex = useRef(-1);
  const working = pending !== null;

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
    // Empty: always one line, even if the placeholder would wrap in a narrow bar
    el.style.height = text ? `${Math.min(el.scrollHeight, 120)}px` : '36px';
  }, [text]);

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
    setAttachments([]);
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
          attachments,
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

  // Recent prompts, newest first, no repeats
  const recent = Array.from(new Set(turns.map(t => t.prompt).reverse())).slice(0, 5);
  const latest = turns[turns.length - 1];
  const removePrompt = (prompt: string) => {
    setTurns(prev => { const next = prev.filter(t => t.prompt !== prompt); writeHistory(project.id, next); return next; });
  };
  const clearHistory = () => { setTurns([]); writeHistory(project.id, []); };
  // The card above the bar: what Claude is doing, its latest reply, and recent prompts
  const showLatest = working || (focused && latest && undo);
  const showRecent = focused && !working && !text && recent.length > 0;

  return (
    <div
      ref={boxRef}
      // Only the text field opens the card; focus can then move into the card
      // (Undo, recent prompts) without closing it
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (!to || !(to === inputRef.current || cardRef.current?.contains(to))) setFocused(false);
      }}
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(620px,calc(100vw-1.5rem))]"
    >

      <div className="dial-surface flex items-end gap-0.5 p-[3px]">
        {tools && (
          <>
            <div className="flex items-center gap-0.5 shrink-0">{tools}</div>
            <div className="self-center mx-1.5 h-5 w-px shrink-0 bg-[rgb(var(--ink)/0.12)]" />
          </>
        )}
        {/* The prompt side; the card above lines up with it */}
        <div className="relative flex-1 min-w-0 flex items-end gap-0.5">
          {(showLatest || showRecent) && (
            <div ref={cardRef} className="dial-surface absolute bottom-[calc(100%+12px)] -left-1 -right-1 p-1 flex flex-col">
              {showLatest && (
                <div className="min-h-9 px-3 py-2 flex items-center text-[13px] leading-5">
                  {pending ? (
                    <span className="flex items-center gap-2.5 text-muted-foreground">
                      <Typing />
                      <span className="truncate">{pending.status}</span>
                    </span>
                  ) : latest && (
                    <div className="flex flex-1 items-start gap-3">
                      <span className={cn('flex-1 min-w-0', latest.error ? 'text-red-400' : 'text-foreground')}>{latest.reply}</span>
                      {undo && (
                        <button
                          onClick={() => { onRestore(undo); setUndo(null); }}
                          className="shrink-0 -my-0.5 -mr-1.5 h-6 px-1.5 flex items-center gap-1 rounded-[7px] text-[12px] text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] transition-colors"
                        >
                          <Undo2 className="h-3 w-3" /> Undo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {showLatest && showRecent && <div className="mx-3 my-1 h-px bg-[rgb(var(--ink)/0.08)]" />}
              {showRecent && (
                <>
                  <div className="flex items-center justify-between h-8 px-3 text-[12px] font-medium text-muted-foreground">
                    <span>Recent</span>
                    <button onClick={clearHistory} className="hover:text-foreground transition-colors">Clear</button>
                  </div>
                  {recent.map(prompt => (
                    <div
                      key={prompt}
                      className="group flex items-center h-9 rounded-[10px] hover:bg-[rgb(var(--ink)/0.1)] transition-colors"
                    >
                      <button
                        onClick={() => { setText(prompt); inputRef.current?.focus(); }}
                        className="flex-1 min-w-0 h-full px-3 text-left text-[13px] text-foreground truncate"
                      >
                        {prompt}
                      </button>
                      <button
                        title="Remove"
                        onClick={() => removePrompt(prompt)}
                        className="mr-1.5 h-6 w-6 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; inputRef.current?.focus(); }}
        />
        <button
          title="Attach an image"
          onClick={() => fileRef.current?.click()}
          disabled={working}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[10px] text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] disabled:opacity-40 transition-colors"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        {attachments.map((a, i) => (
          <span key={i} className="h-9 shrink-0 flex items-center gap-1 pl-0.5 pr-1 rounded-[10px] bg-[rgb(var(--ink)/0.1)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded-[8px] object-cover" />
            <button
              title="Remove"
              onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
              className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          // Pasting an image attaches it
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
          placeholder={working ? 'Claude is working…' : 'Ask Claude  ⌘K'}
          disabled={working}
          className="flex-1 min-w-0 ml-1 resize-none self-center py-2 bg-transparent placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis text-[13px] leading-5 text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Model"
              disabled={working}
              className="h-9 shrink-0 flex items-center gap-1 px-3 rounded-[10px] text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-[rgb(var(--ink)/0.1)] data-[state=open]:bg-[rgb(var(--ink)/0.11)] data-[state=open]:text-foreground disabled:opacity-40 transition-colors"
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
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[10px] bg-[rgb(var(--ink))] text-[var(--chrome)] hover:bg-[rgb(var(--ink)/0.85)] disabled:opacity-25 transition-colors"
        >
          {working ? <Square className="h-2.5 w-2.5 fill-current" /> : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
        </button>
        </div>
      </div>
    </div>
  );
};

// Thinking: a 3×3 grid of small squares that flicker on and off at random
const Typing = () => {
  // Each square gets its own random rhythm, picked once when it appears
  const [cells] = useState(() =>
    Array.from({ length: 9 }, () => ({ delay: Math.random() * 1.2, duration: 0.6 + Math.random() * 0.9 }))
  );
  return (
    <span className="grid grid-cols-3 gap-[2px] shrink-0" aria-hidden>
      {cells.map((c, i) => (
        <span
          key={i}
          className="thinking-cell h-[3px] w-[3px] rounded-[0.5px] bg-current"
          style={{ animationDelay: `-${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </span>
  );
};

export default PromptBox;
