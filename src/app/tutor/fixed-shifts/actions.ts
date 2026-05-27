"use server";

import { z } from "zod";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import {
  fixedShifts,
  fixedShiftSubmissions,
  monthlySubmissionPeriods,
} from "@/db/schema";

// 日曜は教室休校 (Issue #56) のため入力対象外。サーバ側でも拒否する。
// 'no' は「行不在」で表現するため Entry には含めない (Issue #55)。
const EntrySchema = z.object({
  weekday: z.enum(["mon", "tue", "wed", "thu", "fri", "sat"]),
  slotNumber: z.number().int().min(1).max(20),
  availability: z.enum(["yes", "maybe"]),
});

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const InputSchema = z
  .object({
    effectiveFrom: IsoDate,
    // Issue #58: 有効期間の終わり (任意, null可)
    effectiveTo: IsoDate.nullable().optional(),
    // Issue #57: 希望出勤日数 / コマ数 (任意)
    desiredDays: z.number().int().min(0).max(31).nullable().optional(),
    desiredSlots: z.number().int().min(0).max(200).nullable().optional(),
    // Issue #59: フリースペース (任意, 文字数上限)
    note: z.string().max(1000).nullable().optional(),
    entries: z.array(EntrySchema).max(200),
  })
  .refine(
    (v) =>
      v.effectiveTo == null || v.effectiveTo >= v.effectiveFrom,
    { message: "適用終了日は適用開始日以降である必要があります。", path: ["effectiveTo"] },
  );

export type SaveFixedShiftsResult =
  | { ok: true }
  | { ok: false; error: string };

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Issue #61: 紐付き period の締切判定。
 * - 期間なし: 制約なし (アドホック提出)
 * - 期間あり + now <= dueAt: 受付中
 * - 期間あり + now > dueAt: 締切後 (講師アクション拒否)
 *
 * 境界: `now > dueAt` (排他)。`now === dueAt` は受付中扱い。PR #66 の
 * `submissionStatus()` (`now > dueAt`) と同じ境界に揃えてある。
 *
 * 注: `submissions.periodId` を JOIN しないのは、保存時 period 未作成→後から
 * admin が作成したケースを取りこぼさないため。常に targetMonth で再探索する。
 */
async function fetchPeriodDeadline(
  effectiveFrom: string,
  now: Date,
): Promise<{ periodId: string | null; isOverDue: boolean }> {
  const targetMonthIso = `${effectiveFrom.slice(0, 7)}-01`;
  const rows = await db
    .select({
      id: monthlySubmissionPeriods.id,
      submissionDueAt: monthlySubmissionPeriods.submissionDueAt,
    })
    .from(monthlySubmissionPeriods)
    .where(
      and(
        eq(monthlySubmissionPeriods.targetMonth, targetMonthIso),
        eq(monthlySubmissionPeriods.isArchived, false),
      ),
    )
    .limit(1);
  const p = rows[0];
  if (!p) return { periodId: null, isOverDue: false };
  return { periodId: p.id, isOverDue: now > p.submissionDueAt };
}

export async function saveFixedShifts(
  input: unknown,
): Promise<SaveFixedShiftsResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力値が正しくありません。" };
  }
  const {
    effectiveFrom,
    effectiveTo = null,
    desiredDays = null,
    desiredSlots = null,
    note = null,
    entries,
  } = parsed.data;

  const { profile } = await requireRole("tutor");
  const now = new Date();

  // Issue #61: 保存は effectiveFrom 以降の行を delete→insert で置換するため、
  // 状態チェックも同じ gte スコープで行う。eq(effectiveFrom) だけだと
  // tutor が UI の effectiveFrom を過去日に変えて保存することで、未来の
  // submitted/frozen 行を回避して削除できてしまう (PR #67 P1 #1)。
  const blockingRows = await db
    .select({ status: fixedShiftSubmissions.status })
    .from(fixedShiftSubmissions)
    .where(
      and(
        eq(fixedShiftSubmissions.tutorId, profile.id),
        gte(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
        inArray(fixedShiftSubmissions.status, ["submitted", "frozen"]),
      ),
    )
    .limit(1);
  const blockingStatus = blockingRows[0]?.status;
  if (blockingStatus === "submitted") {
    return {
      ok: false,
      error: "既に提出済みです。修正するには「下書きに戻す」を押してください。",
    };
  }
  if (blockingStatus === "frozen") {
    return {
      ok: false,
      error: "この提出は凍結されています。教室長に解除を依頼してください。",
    };
  }

  // Issue #61: 紐付き period の締切後は保存も拒否
  const { periodId, isOverDue } = await fetchPeriodDeadline(
    effectiveFrom,
    now,
  );
  if (isOverDue) {
    return {
      ok: false,
      error: "提出締切を過ぎているため保存できません。教室長に連絡してください。",
    };
  }

  try {
    await db.transaction(async (tx) => {
      // 今後分 (effectiveFrom 以降) の既存レコードを削除し、今回の内容で置換。
      // shifts とメタを同じスコープで揃えないと、将来分の古いメタが孤立する (#65 P2)。
      await tx
        .delete(fixedShifts)
        .where(
          and(
            eq(fixedShifts.tutorId, profile.id),
            gte(fixedShifts.effectiveFrom, effectiveFrom),
          ),
        );
      await tx
        .delete(fixedShiftSubmissions)
        .where(
          and(
            eq(fixedShiftSubmissions.tutorId, profile.id),
            gte(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
          ),
        );

      if (entries.length > 0) {
        await tx.insert(fixedShifts).values(
          entries.map((e) => ({
            tutorId: profile.id,
            weekday: e.weekday,
            slotNumber: e.slotNumber,
            effectiveFrom,
            availability: e.availability,
          })),
        );
      }

      // 提出単位メタ (Issue #57/#58/#59) を insert (直前に同スコープを delete 済)。
      // effective_to は entries が空でも保持されるよう submissions 側に寄せている。
      const trimmedNote = note?.trim() ? note.trim() : null;
      await tx.insert(fixedShiftSubmissions).values({
        tutorId: profile.id,
        effectiveFrom,
        effectiveTo,
        desiredDays,
        desiredSlots,
        note: trimmedNote,
        periodId,
        // status は default 'draft'
      });
    });
  } catch (err) {
    console.error("saveFixedShifts failed", err);
    return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath("/tutor/fixed-shifts");
  return { ok: true };
}

const TransitionInput = z.object({
  effectiveFrom: IsoDate,
});

/**
 * Issue #61: draft → submitted 遷移。
 * 既存の draft 提出を「提出済み」にする。これ以降は saveFixedShifts で
 * 上書きできず、編集には revertSubmissionToDraft が必要。
 */
export async function submitFixedShifts(
  input: unknown,
): Promise<ActionResult> {
  const parsed = TransitionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力値が正しくありません。" };
  }
  const { effectiveFrom } = parsed.data;

  const { profile } = await requireRole("tutor");
  const now = new Date();

  const rows = await db
    .select({
      status: fixedShiftSubmissions.status,
      desiredDays: fixedShiftSubmissions.desiredDays,
      desiredSlots: fixedShiftSubmissions.desiredSlots,
      note: fixedShiftSubmissions.note,
      effectiveTo: fixedShiftSubmissions.effectiveTo,
    })
    .from(fixedShiftSubmissions)
    .where(
      and(
        eq(fixedShiftSubmissions.tutorId, profile.id),
        eq(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) {
    return {
      ok: false,
      error: "提出データがまだ保存されていません。先に「保存」してください。",
    };
  }
  if (current.status === "submitted") {
    return { ok: false, error: "既に提出済みです。" };
  }
  if (current.status === "frozen") {
    return {
      ok: false,
      error: "この提出は凍結されています。教室長に解除を依頼してください。",
    };
  }

  // PR #67 P2: 空の submit を拒否。コマ選択もメタ入力も無い状態で submitted 行が
  // 作られると、教室長側の確定フローで「提出済みだが中身なし」の判別が困難になる。
  const entryCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fixedShifts)
    .where(
      and(
        eq(fixedShifts.tutorId, profile.id),
        eq(fixedShifts.effectiveFrom, effectiveFrom),
      ),
    );
  const hasEntries = (entryCountRows[0]?.count ?? 0) > 0;
  const hasMeta =
    current.desiredDays != null ||
    current.desiredSlots != null ||
    current.effectiveTo != null ||
    (current.note != null && current.note.trim() !== "");
  if (!hasEntries && !hasMeta) {
    return {
      ok: false,
      error: "提出内容が空です。コマの選択か希望日数等の入力を行ってから提出してください。",
    };
  }

  const { isOverDue } = await fetchPeriodDeadline(effectiveFrom, now);
  if (isOverDue) {
    return {
      ok: false,
      error: "提出締切を過ぎているため提出できません。",
    };
  }

  await db
    .update(fixedShiftSubmissions)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(fixedShiftSubmissions.tutorId, profile.id),
        eq(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
      ),
    );

  revalidatePath("/tutor/fixed-shifts");
  return { ok: true };
}

/**
 * Issue #61: submitted → draft 遷移 (講師による下書き化)。
 * 締切前のみ実行可能。frozen は admin の介入が必要なため対象外。
 */
export async function revertSubmissionToDraft(
  input: unknown,
): Promise<ActionResult> {
  const parsed = TransitionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力値が正しくありません。" };
  }
  const { effectiveFrom } = parsed.data;

  const { profile } = await requireRole("tutor");
  const now = new Date();

  const rows = await db
    .select({ status: fixedShiftSubmissions.status })
    .from(fixedShiftSubmissions)
    .where(
      and(
        eq(fixedShiftSubmissions.tutorId, profile.id),
        eq(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "対象の提出が見つかりません。" };
  }
  if (current.status === "draft") {
    return { ok: false, error: "既に下書き状態です。" };
  }
  if (current.status === "frozen") {
    return {
      ok: false,
      error: "凍結状態を講師から解除することはできません。教室長に依頼してください。",
    };
  }

  const { isOverDue } = await fetchPeriodDeadline(effectiveFrom, now);
  if (isOverDue) {
    return {
      ok: false,
      error: "提出締切を過ぎているため下書きに戻せません。",
    };
  }

  await db
    .update(fixedShiftSubmissions)
    .set({
      status: "draft",
      submittedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(fixedShiftSubmissions.tutorId, profile.id),
        eq(fixedShiftSubmissions.effectiveFrom, effectiveFrom),
      ),
    );

  revalidatePath("/tutor/fixed-shifts");
  return { ok: true };
}
