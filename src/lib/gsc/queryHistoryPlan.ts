// Which days of per-day query data (QueryDaily) a sync should (re)write.
//
// The table ACCUMULATES: rows are only ever replaced for the ranges planned here, never wiped,
// so it keeps days Google itself has already dropped (Search Console keeps ~16 months). Each
// sync does two things:
//   • tail — rewrites the last TAIL_DAYS (Google revises its freshest ~3 days), reaching back to
//     the newest stored day when syncs were missed, so a gap closes by itself;
//   • backfill — walks backwards from `historyFrom` (the oldest day stored completely) in
//     CHUNK_DAYS slices, at most CHUNKS_PER_SYNC per run, until Google's own floor. A big
//     property fills over a few syncs instead of one burst against the load quota.
//
// Pure calendar-string math (YYYY-MM-DD, compared lexicographically) — tested on its own.
import { shiftYmd } from "@/lib/periodWindow";

/** How far back Search Console serves data — the same 480 days the date rollup backfills. */
export const HISTORY_DAYS = 480;
export const TAIL_DAYS = 7;
export const CHUNK_DAYS = 30;
export const CHUNKS_PER_SYNC = 4;

export interface DayRange { start: string; end: string }
export interface HistoryPlan { tail: DayRange; backfill: DayRange[]; floor: string }

export function planQueryHistory(o: {
  endStr: string;                 // last day to sync (GSC lag already applied)
  newestStr: string | null;       // newest day stored, if any
  historyFromStr: string | null;  // oldest day stored completely, if known
}): HistoryPlan {
  const floor = shiftYmd(o.endStr, -(HISTORY_DAYS - 1));
  const max = (a: string, b: string) => (a > b ? a : b);
  const min = (a: string, b: string) => (a < b ? a : b);

  let tailStart = shiftYmd(o.endStr, -(TAIL_DAYS - 1));
  if (o.newestStr) tailStart = min(tailStart, shiftYmd(o.newestStr, -(TAIL_DAYS - 1)));
  tailStart = max(tailStart, floor);

  // No rows at all means nothing is stored completely, whatever an old cursor says.
  let cursor = o.newestStr && o.historyFromStr ? min(o.historyFromStr, tailStart) : tailStart;

  const backfill: DayRange[] = [];
  while (backfill.length < CHUNKS_PER_SYNC && cursor > floor) {
    const end = shiftYmd(cursor, -1);
    const start = max(floor, shiftYmd(end, -(CHUNK_DAYS - 1)));
    backfill.push({ start, end });
    cursor = start;
  }
  return { tail: { start: tailStart, end: o.endStr }, backfill, floor };
}
