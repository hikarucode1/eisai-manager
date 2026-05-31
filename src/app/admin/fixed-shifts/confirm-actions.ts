"use server";

import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { regularAssignments, regularShiftPeriods } from "@/db/schema";
import { dedupeAssignments } from "@/lib/shift-confirmation";
import { lastDayOfMonth } from "@/lib/shift-period";

const IsoFirstOfMonth = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, "対象月は YYYY-MM-01 形式で指定してください。");

const InputWeekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat"]);

const AssignmentInput = z.object({
  tutorId: z.string().uuid(),
  weekday: InputWeekday,
  slotNumber: z.number().int().min(1).max(20),
});

const MonthlySaveInput = z.object({
  periodId: z.string().uuid(),
  targetMonth: IsoFirstOfMonth,
  assignments: z.array(AssignmentInput).max(5000),
});

export type SaveMonthlyConfirmationResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/**
 * Issue #74 (δ): 単月の確定を effective_from = 月初、effective_to = 月末 で保存。
 *
 * - 既存の「同 period_id × effective_from が当月内に始まる行」を全削除して再 INSERT
 * - 他月 (例: 期内の別月) や手動編集された期途中の行 (effective_from=月途中) には触らない
 * - assignments 空 = 当月の確定を全解除 (削除のみ)
 * - 1 transaction 内
 *
 * 期途中の日単位 effective_from 編集 UI は別 Issue で後追い。
 */
export async function saveMonthlyConfirmation(
  input: unknown,
): Promise<SaveMonthlyConfirmationResult> {
  const parsed = MonthlySaveInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力値が正しくありません。",
    };
  }
  const { periodId, targetMonth, assignments } = parsed.data;
  const { profile } = await requireRole("admin");
  const now = new Date();

  const monthStart = targetMonth; // YYYY-MM-01
  const monthEnd = lastDayOfMonth(targetMonth); // YYYY-MM-LL
  const deduped = dedupeAssignments(assignments);

  try {
    await db.transaction(async (tx) => {
      // 「effective_from が当月内に始まる行」だけを置換対象とする。
      // 他月の行や期途中の例外 (effective_from が他月) は無傷。
      await tx
        .delete(regularAssignments)
        .where(
          and(
            eq(regularAssignments.periodId, periodId),
            gte(regularAssignments.effectiveFrom, monthStart),
            lte(regularAssignments.effectiveFrom, monthEnd),
          ),
        );

      if (deduped.length > 0) {
        await tx.insert(regularAssignments).values(
          deduped.map((a) => ({
            periodId,
            tutorId: a.tutorId,
            weekday: a.weekday,
            slotNumber: a.slotNumber,
            effectiveFrom: monthStart,
            effectiveTo: monthEnd,
            confirmedBy: profile.id,
            confirmedAt: now,
          })),
        );
      }
    });
  } catch (err) {
    console.error("saveMonthlyConfirmation failed", err);
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    if (code === "23503") {
      return {
        ok: false,
        error: "確定保存に失敗しました: 講師・教室長 ID または期 ID が見つかりません。",
      };
    }
    if (code === "23514") {
      return {
        ok: false,
        error:
          "確定保存に失敗しました: 曜日・コマ番号・日付範囲が制約に違反しています (sun 禁止/slot 1〜20/effective_from <= effective_to)。",
      };
    }
    return { ok: false, error: "確定保存に失敗しました。" };
  }

  revalidatePath("/admin/fixed-shifts");
  revalidatePath("/tutor/fixed-shifts");
  return { ok: true, inserted: deduped.length };
}

const RegularSaveInput = z.object({
  periodId: z.string().uuid(),
  assignments: z.array(AssignmentInput).max(5000),
});

export type SaveRegularConfirmationResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/**
 * Issue #74 (δ) / #73 (γ): 期全体の確定を effective_from = 期 start_date、
 * effective_to = 期 end_date で 1 行ずつ保存する (1 期 = 1 行)。
 *
 * - 同 period_id の既存行を全削除 (replace 方式)
 * - assignments 空 = その期の確定を全解除
 * - 1 transaction
 *
 * 月単位の saveMonthlyConfirmation は維持 (期途中で当月だけ調整したい運用)。
 */
export async function saveRegularConfirmation(
  input: unknown,
): Promise<SaveRegularConfirmationResult> {
  const parsed = RegularSaveInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力値が正しくありません。",
    };
  }
  const { periodId, assignments } = parsed.data;

  const { profile } = await requireRole("admin");
  const now = new Date();

  const periodRows = await db
    .select({
      startDate: regularShiftPeriods.startDate,
      endDate: regularShiftPeriods.endDate,
    })
    .from(regularShiftPeriods)
    .where(eq(regularShiftPeriods.id, periodId))
    .limit(1);
  const period = periodRows[0];
  if (!period) {
    return { ok: false, error: "対象の期が見つかりません。" };
  }

  const deduped = dedupeAssignments(assignments);

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(regularAssignments)
        .where(eq(regularAssignments.periodId, periodId));

      if (deduped.length > 0) {
        await tx.insert(regularAssignments).values(
          deduped.map((a) => ({
            periodId,
            tutorId: a.tutorId,
            weekday: a.weekday,
            slotNumber: a.slotNumber,
            effectiveFrom: period.startDate,
            effectiveTo: period.endDate,
            confirmedBy: profile.id,
            confirmedAt: now,
          })),
        );
      }
    });
  } catch (err) {
    console.error("saveRegularConfirmation failed", err);
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    if (code === "23503") {
      return {
        ok: false,
        error: "期一括確定に失敗しました: 講師・教室長 ID または期 ID が見つかりません。",
      };
    }
    if (code === "23514") {
      return {
        ok: false,
        error:
          "期一括確定に失敗しました: 曜日・コマ番号・日付範囲が制約に違反しています (sun 禁止/slot 1〜20)。",
      };
    }
    return { ok: false, error: "期一括確定に失敗しました。" };
  }

  revalidatePath("/admin/fixed-shifts");
  revalidatePath("/tutor/fixed-shifts");
  // 「期全体の枠」が確定された (= 期内全日適用)
  return { ok: true, inserted: deduped.length };
}
