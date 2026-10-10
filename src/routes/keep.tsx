import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Pin, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/keep")({
  head: () => ({
    meta: [
      { title: "Keepメモ｜RINE" },
      { name: "description", content: "自分専用のメモ帳。端末内保存で通信量ゼロ。" },
    ],
  }),
  component: KeepPage,
});

type KeepItem = {
  id: string;
  text: string;
  createdAt: number;
};

const STORAGE_KEY = "rine_keep_notes_v1";

function loadNotes(): KeepItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KeepItem[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(items: KeepItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    toast.error("保存容量が上限に達しました");
  }
}

function KeepPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<KeepItem[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(loadNotes());
  }, []);

  // Escキーで前の画面に戻る
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          void navigate({ to: "/" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) => it.text.toLowerCase().includes(q));
  }, [items, query]);

  const addNote = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newItem: KeepItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      createdAt: Date.now(),
    };
    const next = [...items, newItem];
    setItems(next);
    saveNotes(next);
    setText("");
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const deleteNote = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    saveNotes(next);
    toast.success("メモを削除しました");
  };

  const copyNote = async (item: KeepItem) => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopiedId(item.id);
      toast.success("クリップボードにコピーしました");
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else void navigate({ to: "/" });
            }}
            title="戻る (Esc)"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Pin className="size-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none">Keepメモ</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">自分専用・端末内保存（通信量0）</p>
            </div>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {items.length}件
        </span>
      </header>

      {/* 検索バー */}
      <div className="border-b border-border/50 bg-muted/30 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="メモ内を検索..."
            className="h-8 rounded-full bg-background pl-8 text-xs"
          />
        </div>
      </div>

      {/* メモ一覧（チャット風バブル） */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground py-16">
            <Pin className="size-10 stroke-[1.5] text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold">メモはまだありません</p>
            <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
              ToDo、下書き、URLなどを自由に保存できます。この端末のみに保存され、サーバーへは送信されません。
            </p>
          </div>
        ) : (
          filtered.map((it) => (
            <div key={it.id} className="group flex flex-col items-end">
              <div className="relative max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3.5 py-2.5 text-sm shadow-sm break-words whitespace-pre-wrap">
                {it.text}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                <span>
                  {new Date(it.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  type="button"
                  onClick={() => copyNote(it)}
                  className="opacity-70 hover:opacity-100 flex items-center gap-0.5 transition"
                  title="コピー"
                >
                  {copiedId === it.id ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
                  <span>{copiedId === it.id ? "完了" : "コピー"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteNote(it.id)}
                  className="opacity-70 hover:opacity-100 text-destructive flex items-center gap-0.5 transition"
                  title="削除"
                >
                  <Trash2 className="size-3" />
                  <span>削除</span>
                </button>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄（LINE風） */}
      <div className="border-t border-border bg-background p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addNote();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enterで送信（Shift+Enterで改行）
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder="メモを入力... (Enterで保存、Shift+Enterで改行)"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none rounded-2xl text-xs py-2.5"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            className="size-10 shrink-0 rounded-full"
            title="保存"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
