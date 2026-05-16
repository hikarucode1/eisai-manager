"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Pencil, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { inviteTutor, renameTutor, setTutorActive } from "./actions";

export type TutorRow = {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

export function TutorManager({ tutors }: { tutors: TutorRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNotice({ type: "ok", text: okMsg });
        router.refresh();
      } else {
        setNotice({ type: "error", text: res.error ?? "失敗しました。" });
      }
    });
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => inviteTutor({ email: email.trim(), displayName: name.trim() }),
      "招待メールを送信しました。",
    );
    setEmail("");
    setName("");
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className={cn(
            "flex items-center gap-1 text-sm",
            notice.type === "ok" ? "text-primary" : "text-destructive",
          )}
        >
          {notice.type === "error" && <AlertCircle className="size-4" />}
          {notice.text}
        </p>
      )}

      {/* 招待フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4" />
            講師を招待
          </CardTitle>
          <CardDescription>
            入力したメールアドレスに、パスワード設定リンク付きの招待メールが届きます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={handleInvite}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="inv-name">氏名（CSV の講師名と一致させる）</Label>
              <Input
                id="inv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山本美里"
                required
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="inv-email">メールアドレス</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tutor@example.com"
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "送信中..." : "招待"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 講師一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            講師一覧
            <Badge variant="secondary" className="ml-2">
              {tutors.length} 名
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tutors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              講師がまだ登録されていません。
            </p>
          ) : (
            <div className="divide-y">
              {tutors.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between",
                    !t.isActive && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 w-48"
                          aria-label="氏名"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={isPending}
                          aria-label="保存"
                          onClick={() =>
                            run(
                              () =>
                                renameTutor({
                                  id: t.id,
                                  displayName: editName.trim(),
                                }),
                              "氏名を変更しました。",
                            )
                          }
                        >
                          <Check />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label="キャンセル"
                          onClick={() => setEditingId(null)}
                        >
                          <X />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.displayName}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label="氏名を編集"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.displayName);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {t.isActive ? (
                          <Badge variant="secondary">有効</Badge>
                        ) : (
                          <Badge variant="outline">無効</Badge>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t.email}
                    </div>
                  </div>

                  <Button
                    variant={t.isActive ? "outline" : "default"}
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          setTutorActive({ id: t.id, isActive: !t.isActive }),
                        t.isActive
                          ? "無効化しました。"
                          : "有効化しました。",
                      )
                    }
                  >
                    {t.isActive ? "無効化" : "有効化"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
