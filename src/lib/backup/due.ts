// The due-check of the backup scheduler (issue #32), pure so the schedule semantics live in
// schedule.test.ts rather than only inside the loop.

import { latestFireAtOrBefore } from "@/lib/cron";

/**
 * The fire this tick should act on, or null. `lastFireAt` is the high-water: the last fire we
 * already acted on (successfully or not).
 *
 * A null high-water does NOT mean "run now" — latestFireAtOrBefore's 60-minute window means an
 * instance that enables backups at 21:00 with a 03:00 schedule simply waits for 03:00 (and
 * "Back up now" exists for the impatient). Fires missed by longer downtime are deliberately
 * skipped: no back-fill storm, the failure notification already told the operator.
 */
export function dueFire(schedule: string, lastFireAt: string | null, now: Date): Date | null {
  const fire = latestFireAtOrBefore(schedule, now);
  if (!fire) return null;
  if (!lastFireAt) return fire;
  return new Date(lastFireAt) < fire ? fire : null;
}
