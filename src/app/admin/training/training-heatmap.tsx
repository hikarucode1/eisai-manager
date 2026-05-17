"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { HeatmapData } from "@/lib/training-overview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { shortDate } from "@/lib/week";
import { cn } from "@/lib/utils";

/** 希望者数 → 背景アルファ (0 は無色) */
function alphaFor(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  // 0.18〜0.9 を線形配分
  return 0.18 + (count / max) * 0.72;
}

export function TrainingHeatmap({ data }: { data: HeatmapData }) {
  const { slots, days, counts, tutorsByCell, maxCount } = data;
  const [open, setOpen] = useState<{
    date: string;
    slotLabel: string;
    tutors: string[];
  } | null>(null);

  // Escape でモーダルを閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>色が濃いほど希望者が多い（最大 {maxCount} 名）</span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block size-3 rounded-sm ring-1 ring-border"
            style={{ backgroundColor: "hsl(var(--primary) / 0.2)" }}
          />
          少
          <span
            className="ml-1 inline-block size-3 rounded-sm"
            style={{ backgroundColor: "hsl(var(--primary) / 0.9)" }}
          />
          多
        </span>
        <span>セルをクリックで希望者一覧</span>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border bg-muted p-2 text-left">
                コマ
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={cn(
                    "border bg-muted px-2 py-1 text-center font-medium",
                    d.isWeekend && "text-muted-foreground",
                  )}
                >
                  <div className="whitespace-nowrap">{shortDate(d.date)}</div>
                  <div className="text-[10px] font-normal">
                    {d.weekdayLabel}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.slotNumber}>
                <th className="sticky left-0 z-10 border bg-muted p-2 text-left">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {s.startTime}
                    {s.startTime && "〜"}
                    {s.endTime}
                  </div>
                </th>
                {days.map((d) => {
                  const key = `${d.date}|${s.slotNumber}`;
                  const c = counts[key] ?? 0;
                  const a = alphaFor(c, maxCount);
                  // 濃紺が十分濃い帯のみ白文字 (中間帯の低コントラストを回避)
                  const dark = a >= 0.65;
                  return (
                    <td key={d.date} className="border p-0">
                      <button
                        type="button"
                        disabled={c === 0}
                        onClick={() =>
                          setOpen({
                            date: d.date,
                            slotLabel: s.label,
                            tutors: tutorsByCell[key] ?? [],
                          })
                        }
                        title={
                          c > 0
                            ? `${shortDate(d.date)} ${s.label}: ${c}名`
                            : undefined
                        }
                        className={cn(
                          "flex h-9 w-12 items-center justify-center text-xs tabular-nums transition-colors",
                          c > 0
                            ? "cursor-pointer hover:ring-2 hover:ring-ring"
                            : "cursor-default text-muted-foreground/40",
                          dark && "font-medium text-primary-foreground",
                        )}
                        style={{
                          backgroundColor:
                            a > 0
                              ? `hsl(var(--primary) / ${a.toFixed(3)})`
                              : undefined,
                        }}
                      >
                        {c > 0 ? c : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <Card
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {shortDate(open.date)} {open.slotLabel}
                  <Badge variant="secondary" className="ml-2">
                    {open.tutors.length} 名
                  </Badge>
                </div>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setOpen(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>
              {open.tutors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  希望者はいません。
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                  {open.tutors.map((t, i) => (
                    <li
                      key={`${t}-${i}`}
                      className="rounded bg-muted/50 px-2 py-1"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
