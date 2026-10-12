// Outline-shape coercion for the MCP generation tools.
//
// The UI's Text generator picks a saved structure and posts `outline.data` — the outline
// OBJECT. An agent holds the same material in worse shapes: a JSON string, a get_generations
// record (outline under .data), a get_generation_job response (under .result), a landing
// result (under .outline). genText never validated any of this, so every wrong shape sailed
// through as an outline with no sections, no facts bank and no keyword — the writer got an
// effectively empty prompt and produced a fluent article about the wrong subject, at full
// price. This module exists so the wrong shape cannot be handed over silently.
//
// Pure on purpose: no imports, so it is trivially unit-testable and safe to load anywhere.

/** Return the outline object inside `input`, or null when nothing outline-shaped is there. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- toolsOptimize.ts unions this return with `unknown` (fetchSavedOutline's outline field) and then reads `.meta` off the result; any honest return type collapses that union to unknown and breaks this caller's compile until it is re-typed in its own pass
export function coerceOutline(input: unknown, depth = 0): any | null {
  let v = input;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const rec = v as Record<string, unknown>;
  if (Array.isArray(rec.sections) && rec.sections.length) return rec;
  if (depth >= 4) return null;
  for (const k of ["data", "result", "outline"]) {
    const inner = coerceOutline(rec[k], depth + 1);
    if (inner) return inner;
  }
  return null;
}
