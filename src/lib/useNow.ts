"use client";

import { useEffect, useState } from "react";

/**
 * The render-time clock. `Date.now()` called during render is impure (server and client
 * disagree about "now", which surfaces as a hydration mismatch on time-derived badges), so
 * components that compare dates against "now" read it from here instead: 0 on the first
 * render, the real clock from the first effect on. Guard with `now > 0` when the first frame
 * must not flash a wrong verdict.
 */
export function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  return now;
}
