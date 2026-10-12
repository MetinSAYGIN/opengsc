// Striking distance — pure helpers (no Prisma), tested in logic.test.ts.

/**
 * Organic CTR by position, Backlinko 2023 — the table the CTR Benchmark tab and MCP use.
 * Positions past 10 fall off to ~1%.
 */
export const CTR_BY_POSITION: Record<number, number> = {
  1: 0.276, 2: 0.158, 3: 0.110, 4: 0.084, 5: 0.063, 6: 0.049, 7: 0.039, 8: 0.033, 9: 0.027, 10: 0.024,
};

export function benchmarkCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  return CTR_BY_POSITION[p] ?? 0.01;
}

/** The position the estimate assumes a page could reach. */
export const TARGET_POSITION = 3;

/**
 * Extra clicks a pair would get at TARGET_POSITION with today's impressions, over what it gets
 * now. Free (no keyword volumes needed), so a list of thousands can be ordered by it before
 * anyone pays for data. Conservative on purpose: impressions usually grow on the way up too.
 * Only for ordering — never presented as a forecast.
 */
export function estimatedGain(impressions: number, clicks: number): number {
  return Math.max(0, Math.round(impressions * benchmarkCtr(TARGET_POSITION)) - clicks);
}

export type Proximity = "top5" | "page1" | "nearPage2" | "page2plus";

export function proximity(position: number): Proximity {
  if (position <= 5) return "top5";
  if (position <= 10) return "page1";
  if (position <= 15) return "nearPage2";
  return "page2plus";
}
