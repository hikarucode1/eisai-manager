"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

const InviteSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません。"),
  displayName: z.string().trim().min(1, "氏名を入力してください。").max(50),
});

/**
 * 新規講師を招待。Supabase Auth に招待メールを送り、
 * 発行された user.id で profiles に tutor 行を作成。
 */
export async function inviteTutor(input: unknown): Promise<ActionResult> {
  await requireRole("admin");

  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力が不正です。" };
  }
  const { email, displayName } = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);

  if (error || !data?.user) {
    const msg = error?.message ?? "招待に失敗しました。";
    // よくある: 既に登録済みのメール
    if (/already|registered|exists/i.test(msg)) {
      return {
        ok: false,
        error: "このメールアドレスは既に登録されています。",
      };
    }
    return { ok: false, error: `招待に失敗しました: ${msg}` };
  }

  try {
    await db.insert(profiles).values({
      id: data.user.id,
      displayName,
      role: "tutor",
      email,
      isActive: true,
    });
  } catch (e) {
    // profiles 行作成に失敗したら auth ユーザーを巻き戻す (孤児防止)
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.error("inviteTutor: profile insert failed", e);
    return {
      ok: false,
      error: "プロフィール作成に失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/admin/tutors");
  return { ok: true };
}

const SetActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

/** 講師の有効/無効を切り替え (削除は不可、無効化のみ) */
export async function setTutorActive(input: unknown): Promise<ActionResult> {
  const { profile } = await requireRole("admin");

  const parsed = SetActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力が不正です。" };
  const { id, isActive } = parsed.data;

  if (id === profile.id) {
    return { ok: false, error: "自分自身は変更できません。" };
  }

  const target = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (target.length === 0) return { ok: false, error: "対象が見つかりません。" };
  if (target[0].role !== "tutor") {
    return { ok: false, error: "講師以外は変更できません。" };
  }

  await db
    .update(profiles)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(profiles.id, id));

  revalidatePath("/admin/tutors");
  return { ok: true };
}

const RenameSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1, "氏名を入力してください。").max(50),
});

/** 表示名を変更 (CSV の講師名と一致させるため) */
export async function renameTutor(input: unknown): Promise<ActionResult> {
  await requireRole("admin");

  const parsed = RenameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力が不正です。" };
  }
  const { id, displayName } = parsed.data;

  const target = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (target.length === 0) return { ok: false, error: "対象が見つかりません。" };
  if (target[0].role !== "tutor") {
    return { ok: false, error: "講師以外は変更できません。" };
  }

  await db
    .update(profiles)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(profiles.id, id));

  revalidatePath("/admin/tutors");
  return { ok: true };
}
