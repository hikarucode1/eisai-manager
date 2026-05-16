import { asc, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  shiftAssignments,
  shiftUploads,
  students,
  weeklyShifts,
} from "../src/db/schema";

async function main() {
  console.log("=== shift_uploads ===");
  const uploads = await db
    .select()
    .from(shiftUploads)
    .orderBy(desc(shiftUploads.createdAt))
    .limit(5);
  for (const u of uploads) {
    console.log(
      `  ${u.weekStart}〜${u.weekEnd}  ${u.originalFilename}  (${u.fileBytes} bytes)  published: ${u.publishedAt?.toISOString() ?? "—"}`,
    );
  }

  console.log("\n=== weekly_shifts (counts by date) ===");
  const counts = await db
    .select({
      date: weeklyShifts.date,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(weeklyShifts)
    .groupBy(weeklyShifts.date)
    .orderBy(asc(weeklyShifts.date));
  for (const r of counts) {
    console.log(`  ${r.date}: ${r.count} 出勤`);
  }

  console.log("\n=== students ===");
  const studentCount = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(students);
  console.log(`  ${studentCount[0].count} 名登録`);

  console.log("\n=== shift_assignments ===");
  const assignCount = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(shiftAssignments);
  console.log(`  ${assignCount[0].count} 件`);

  // 直近 upload の最初の出勤がある (日付, コマ) を動的に選んでサンプル表示
  const pick = (await db.execute(drizzleSql`
    select date, slot_number
    from weekly_shifts
    order by date asc, slot_number asc
    limit 1
  `)) as unknown as { date: string; slot_number: number }[];

  if (pick.length === 0) {
    console.log("\n=== サンプル ===\n  weekly_shifts が空です");
    process.exit(0);
  }

  const { date: sampleDate, slot_number: sampleSlot } = pick[0];
  console.log(`\n=== サンプル: ${sampleDate} (${sampleSlot}限) ===`);
  const sample = await db.execute(drizzleSql`
    select ws.seat_number, p.display_name as tutor, st.name as student, sa.subject
    from weekly_shifts ws
    join profiles p on p.id = ws.tutor_id
    left join shift_assignments sa on sa.weekly_shift_id = ws.id
    left join students st on st.id = sa.student_id
    where ws.date = ${sampleDate} and ws.slot_number = ${sampleSlot}
    order by ws.seat_number, sa.position
  `);
  for (const r of sample as unknown as {
    seat_number: string | null;
    tutor: string;
    student: string | null;
    subject: string | null;
  }[]) {
    console.log(
      `  [座${r.seat_number ?? "-"}] ${r.tutor.padEnd(10, "　")}  ${r.student ?? "—"}${r.subject ? `(${r.subject})` : ""}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
