import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Pin,
  Search,
  Send,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
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
  updatedAt?: number;
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

/**
 * URL自動リンク化レンダラー
 * テキスト内の URL (http / https) を検出してクリック可能な <a> タグに変換
 */
function renderFormattedText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 underline font-medium text-inherit decoration-white/70 hover:decoration-white break-all transition-opacity"
        >
          <span>{part}</span>
          <ExternalLink className="inline size-3 shrink-0 opacity-80" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function KeepPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<KeepItem[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 編集中のメモIDと編集テキスト
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(loadNotes());
  }, []);

  // Escキーで前の画面に戻る
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) {
          setEditingId(null);
          return;
        }
        if (window.history.length > 1) {
          window.history.back();
        } else {
          void navigate({ to: "/" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, editingId]);

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

  /**
   * URL・不要な空白の整形ツール
   * 全角スペースの半角化、余分な連続空白の圧縮、改行の整形、前後の空白除去
   */
  const cleanAndFormatUrl = () => {
    if (!text.trim()) {
      toast.info("入力欄に文字を入力してから押してください");
      return;
    }

    let cleaned = text;

    // 全角スペースを半角スペースへ統一
    cleaned = cleaned.replace(/\u3000/g, " ");

    // URLらしき文字列が含まれている場合、URL前後の改行や不要な空白を整形
    if (/https?:\/\//i.test(cleaned)) {
      // 複数行にまたがって途切れたURLの結合・空白除去
      cleaned = cleaned
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
      // URL内の意図しない半角スペースの除去（http://〜 の途中に紛れた空白）
      cleaned = cleaned.replace(/(https?:\/\/)\s+/gi, "$1");
    }

    // 全体の前後の空白・改行を除去
    cleaned = cleaned.trim();

    setText(cleaned);
    toast.success("URLと余分な空白を整形しました");
  };

  // メモの編集開始
  const startEditing = (item: KeepItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  // メモの編集保存
  const saveEditing = () => {
    if (!editingId) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      toast.error("内容が空のため更新できません");
      return;
    }

    const next = items.map((it) =>
      it.id === editingId ? { ...it, text: trimmed, updatedAt: Date.now() } : it
    );
    setItems(next);
    saveNotes(next);
    setEditingId(null);
    setEditingText("");
    toast.success("メモを更新しました");
  };

  // メモの削除
  const deleteNote = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    saveNotes(next);
    if (editingId === id) {
      setEditingId(null);
    }
    toast.success("メモを削除しました");
  };

  // メモのコピー
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
              <p className="text-[10px] text-muted-foreground mt-0.5">
                自分専用・端末内保存（通信量0）
              </p>
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
          filtered.map((it) => {
            const isEditing = editingId === it.id;

            return (
              <div key={it.id} className="group flex flex-col items-end">
                {isEditing ? (
                  /* 編集モード時のUI */
                  <div className="w-full max-w-[90%] rounded-2xl border border-primary/40 bg-card p-3 shadow-md">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Pencil className="size-3 text-primary" />
                      <span>メモを編集中</span>
                    </p>
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                      className="text-xs resize-none rounded-lg bg-background"
                      placeholder="メモを入力..."
                      autoFocus
                    />
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-3 mr-1" />
                        キャンセル
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs px-3"
                        disabled={!editingText.trim()}
                        onClick={saveEditing}
                      >
                        <Check className="size-3 mr-1" />
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* 通常表示時の吹き出し */
                  <div className="relative max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3.5 py-2.5 text-sm shadow-sm break-words whitespace-pre-wrap leading-relaxed">
                    {renderFormattedText(it.text)}
                  </div>
                )}

                {/* アクションバー */}
                {!isEditing && (
                  <div className="mt-1 flex items-center gap-2.5 text-[10px] text-muted-foreground px-1">
                    <span>
                      {new Date(it.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {it.updatedAt && " (編集済)"}
                    </span>

                    {/* 編集ボタン */}
                    <button
                      type="button"
                      onClick={() => startEditing(it)}
                      className="opacity-70 hover:opacity-100 text-foreground flex items-center gap-0.5 transition"
                      title="編集"
                    >
                      <Pencil className="size-3" />
                      <span>編集</span>
                    </button>

                    {/* コピーボタン */}
                    <button
                      type="button"
                      onClick={() => copyNote(it)}
                      className="opacity-70 hover:opacity-100 flex items-center gap-0.5 transition"
                      title="コピー"
                    >
                      {copiedId === it.id ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      <span>{copiedId === it.id ? "完了" : "コピー"}</span>
                    </button>

                    {/* 削除ボタン */}
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
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄（LINE風）＋便利ツール */}
      <div className="border-t border-border bg-background p-3 space-y-2">
        {/* URL・空白整形ボタン */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={cleanAndFormatUrl}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition"
            title="余分な空白や改行を取り除き、URLを綺麗に整えます"
          >
            <Wand2 className="size-3 text-primary" />
            <span>🧹 URL・空白整形</span>
          </button>
          <span className="text-[10px] text-muted-foreground">
            {text.length > 0 && `${text.length}文字`}
          </span>
        </div>

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
            placeholder="メモやURLを入力... (Enterで保存、Shift+Enterで改行)"
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
