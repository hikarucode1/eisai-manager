"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { monthlySubmissionPeriods } from "@/db/schema";
import { isValidIsoDate } from "@/lib/week";
import { isUniqueViolation } from "@/lib/db-errors";

type ActionResult = { ok: true } | { ok: false; error: string };

const isoDate = z
  .string()
  .refine((v) => isValidIsoDate(v), "日付の形式が正しくありません。");

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "日時の形式が正しくありません。");

/** YYYY-MM-DD が月の 1 日であることを検証 (target_month は月単位の概念) */
function isFirstOfMonth(iso: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(iso);
}

const PeriodInput = z
  .object({
    targetMonth: isoDate.refine(
      isFirstOfMonth,
      "対象月は月の 1 日 (例: 2026-07-01) を指定してください。",
    ),
    submissionOpensAt: isoDateTime,
    submissionDueAt: isoDateTime,
  })
  .refine((v) => Date.parse(v.submissionOpensAt) < Date.parse(v.submissionDueAt), {
    message: "提出締切は提出開始より後にしてください。",
    path: ["submissionDueAt"],
  });

export async function createSubmissionPeriod(
  input: unknown,
): Promise<ActionResult> {
  const { profile } = await requireRole("admin");

  const parsed = PeriodInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力が不正です。",
    };
  }
  const v = parsed.data;

  try {
    await db.insert(monthlySubmissionPeriods).values({
      targetMonth: v.targetMonth,
      submissionOpensAt: new Date(v.submissionOpensAt),
      submissionDueAt: new Date(v.submissionDueAt),
      createdBy: profile.id,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "同じ対象月の提出期間が既にあります。" };
    }
    console.error("createSubmissionPeriod failed", err);
    return { ok: false, error: "作成に失敗しました。" };
  }

  revalidatePath("/admin/submission-periods");
  return { ok: true };
}

const UpdateInput = z
  .object({
    id: z.string().uuid(),
    submissionOpensAt: isoDateTime,
    submissionDueAt: isoDateTime,
  })
  .refine((v) => Date.parse(v.submissionOpensAt) < Date.parse(v.submissionDueAt), {
    message: "提出締切は提出開始より後にしてください。",
    path: ["submissionDueAt"],
  });

/** target_month は不変。提出開始 / 締切のみ更新可。 */
export async function updateSubmissionPeriod(
  input: unknown,
): Promise<ActionResult> {
  await requireRole("admin");

  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力が不正です。",
    };
  }
  const v = parsed.data;

  await db
    .update(monthlySubmissionPeriods)
    .set({
      submissionOpensAt: new Date(v.submissionOpensAt),
      submissionDueAt: new Date(v.submissionDueAt),
      updatedAt: new Date(),
    })
    .where(eq(monthlySubmissionPeriods.id, v.id));

  revalidatePath("/admin/submission-periods");
  return { ok: true };
}

const ArchiveInput = z.object({
  id: z.string().uuid(),
  value: z.boolean(),
});

export async function setSubmissionPeriodArchived(
  input: unknown,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = ArchiveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力が不正です。" };

  await db
    .update(monthlySubmissionPeriods)
    .set({ isArchived: parsed.data.value, updatedAt: new Date() })
    .where(eq(monthlySubmissionPeriods.id, parsed.data.id));

  revalidatePath("/admin/submission-periods");
  return { ok: true };
}
