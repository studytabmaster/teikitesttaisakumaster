import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { initials, type Group } from "@/lib/rine";

export const Route = createFileRoute("/groups")({
  head: () => ({
    meta: [
      { title: "グループトーク｜RINE" },
      {
        name: "description",
        content: "RINE のグループトーク一覧。グループを作成して友だちを招待し、みんなでトークできます。",
      },
      { property: "og:title", content: "グループトーク｜RINE" },
      { property: "og:description", content: "グループを作ってみんなでトーク。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
    const ids = (memberships ?? []).map((m) => m.group_id);
    // 自分が作成したグループは（メンバー行がまだ無くても）必ず表示する
    const [owned, joined] = await Promise.all([
      supabase.from("groups").select("*").eq("owner_id", user.id),
      ids.length > 0
        ? supabase.from("groups").select("*").in("id", ids)
        : Promise.resolve({ data: [] as Group[] }),
    ]);
    const map = new Map<string, Group>();
    for (const g of [...((owned.data ?? []) as Group[]), ...((joined.data ?? []) as Group[])]) {
      // オープンチャットは専用タブで扱うため、グループ一覧からは除外
      if ((g as Group & { is_open?: boolean }).is_open) continue;
      map.set(g.id, g);
    }
    setGroups(
      [...map.values()].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    );
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("groups")
      .insert({ name: trimmed, owner_id: user.id })
      .select()
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error(`グループを作成できませんでした${error ? `：${error.message}` : ""}`);
      return;
    }
    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: data.id, user_id: user.id });
    if (memberError) {
      setSaving(false);
      toast.error(`メンバー登録に失敗しました：${memberError.message}`);
      void load();
      return;
    }
    setSaving(false);
    setOpen(false);
    setName("");
    toast.success("グループを作成しました");
    void load();
  };

  return (
    <AppShell
      title="グループ"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="mr-1 size-4" />
              作成
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>グループを作成</DialogTitle>
              <DialogDescription>
                作成した人だけがグループ名の変更とメンバーの削除ができます。
              </DialogDescription>
            </DialogHeader>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="グループ名"
              maxLength={40}
            />
            <DialogFooter>
              <Button onClick={create} disabled={saving || !name.trim()}>
                作成する
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {groups.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-3 size-10 opacity-40" />
          まだグループがありません。右上の「作成」から始めましょう。
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                to="/group/$groupId"
                params={{ groupId: g.id }}
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
              >
                <Avatar className="size-12">
                  <AvatarImage src={g.avatar_url ?? undefined} alt={g.name} />
                  <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                    {initials(g.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {g.owner_id === user?.id ? "あなたが作成" : "参加中"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
