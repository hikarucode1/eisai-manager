/**
 * Issue #73 (γ): 期 (regular_shift_periods) を月初日のリストに分解する pure 関数。
 *
 * 期は日付単位 (start_date / end_date) で表現されるが、確定テーブル
 * monthly_regular_assignments は target_month (月初固定) でキー付けされる。
 * 「期一括確定」操作で期内の各月に同じ confirmedSet を bulk INSERT するため、
 * 期を月リストに展開する必要がある。
 *
 * 期中始動 (例: start_date = 2026-04-16) や月途中終了 (end_date = 2026-06-15)
 * でも、その月の月初 (2026-04-01 / 2026-06-01) を含める = 月単位でいったん
 * 確定を入れ、日単位の細かい例外は後追い Issue #74 (effective_from/to ベース)
 * で扱う。
 */
/**
 * Issue #74 (δ): "YYYY-MM-01" → "YYYY-MM-LL" (その月の末日 ISO)。
 *
 * regular_assignments の effective_to に「月末」をセットするときに使う。
 * 末日は月とうるう年で変わるため、JavaScript Date の「翌月の 0 日目 = 今月末」
 * トリックで取得する (UTC ベースで JST 影響なし)。
 *
 * monthFirstIso が "YYYY-MM-01" 形式でない場合は空文字を返す。
 */
export function lastDayOfMonth(monthFirstIso: string): string {
  const m = /^(\d{4})-(\d{2})-01$/.exec(monthFirstIso);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Date.UTC(year, monthIndex=month, day=0) = 翌月の 0 日目 = 今月末
  const last = new Date(Date.UTC(year, month, 0));
  const dd = String(last.getUTCDate()).padStart(2, "0");
  return `${m[1]}-${m[2]}-${dd}`;
}

export function monthsInPeriod(
  startDate: string,
  endDate: string,
): string[] {
  const [syRaw, smRaw] = startDate.split("-");
  const [eyRaw, emRaw] = endDate.split("-");
  const sy = Number(syRaw);
  const sm = Number(smRaw);
  const ey = Number(eyRaw);
  const em = Number(emRaw);

  if (
    !Number.isInteger(sy) ||
    !Number.isInteger(sm) ||
    !Number.isInteger(ey) ||
    !Number.isInteger(em)
  ) {
    return [];
  }
  if (ey < sy || (ey === sy && em < sm)) return [];

  const result: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}
