// HTTP status of a page as a crawler sees it: the first response, every redirect hop, and where
// the chain ends. Built for the Content Decay table (#28): after a migration the question for a
// page that lost its traffic is "is it a 404, a 301 to the right place, or a 301 to nowhere?".
//
// Every hop goes through safeFetch, so each one is resolved and checked against the
// private-address guard on its own — a public URL that redirects into the LAN is refused at that
// hop, not followed. Redirects are walked by hand (redirect:"manual") because the chain itself is
// the answer; safeFetch's own follow mode would only report the end of it.

import { safeFetch, SafeFetchError } from "@/lib/security/safeFetch";
import { httpVerdict, type HttpCheckResult, type HttpHop } from "./logic";

export const HTTP_CHECK_MAX_HOPS = 6;
const HOP_TIMEOUT_MS = 10_000;
/** Only the GET fallback reads a body, and only to throw it away. */
const GET_MAX_BYTES = 8 * 1024 * 1024;

const isRedirect = (s: number) => s >= 300 && s < 400 && s !== 304;

/**
 * Status of one URL, HEAD first. A HEAD answered with 403/405/501 is retried as GET: plenty of
 * servers and bot shields refuse or mishandle HEAD while serving the page normally, and reporting
 * their HEAD answer would flag healthy pages as broken.
 */
async function probe(url: string): Promise<{ status: number; location: string | null }> {
  const opts = { redirect: "manual" as const, timeoutMs: HOP_TIMEOUT_MS, maxRedirects: 0 };
  const head = await safeFetch(url, { ...opts, method: "HEAD" });
  if (![403, 405, 501].includes(head.status)) return { status: head.status, location: head.headers.get("location") };
  try {
    const get = await safeFetch(url, { ...opts, method: "GET", maxBytes: GET_MAX_BYTES });
    return { status: get.status, location: get.headers.get("location") };
  } catch (e) {
    // The GET failed where the HEAD answered — the HEAD status is the better answer we have.
    if (e instanceof SafeFetchError && e.code === "response_too_large") return { status: head.status, location: head.headers.get("location") };
    throw e;
  }
}

function errorText(e: unknown): string {
  if (e instanceof SafeFetchError) {
    switch (e.code) {
      case "request_timeout": return "timeout";
      case "dns_failed": return "dns_failed";
      case "private_address": return "private_address";
      case "too_many_redirects": return "too_many_redirects";
      case "invalid_url": return "invalid_url";
      case "unsupported_protocol": return "unsupported_protocol";
      default: return "network_error";
    }
  }
  return "network_error";
}

export async function checkHttpStatus(url: string): Promise<HttpCheckResult> {
  const chain: HttpHop[] = [];
  const seen = new Set<string>();
  let current = url;
  let error: string | undefined;

  for (let hop = 0; hop < HTTP_CHECK_MAX_HOPS; hop++) {
    if (seen.has(current)) { error = "redirect_loop"; break; }
    seen.add(current);
    let res: { status: number; location: string | null };
    try {
      res = await probe(current);
    } catch (e) {
      error = errorText(e);
      break;
    }
    chain.push({ url: current, status: res.status });
    if (!isRedirect(res.status)) break;
    if (!res.location) { error = "redirect_without_location"; break; }
    try {
      current = new URL(res.location, current).toString();
    } catch {
      error = "invalid_redirect";
      break;
    }
    if (hop === HTTP_CHECK_MAX_HOPS - 1) error = "too_many_redirects";
  }

  const first = chain[0]?.status ?? 0;
  const last = chain[chain.length - 1];
  // A chain that ended on an error (timeout mid-way, loop) has no trustworthy final status.
  const finalStatus = last && !(isRedirect(last.status) && error) ? last.status : null;
  // Where the chain points, even when that hop failed: "301 to a dead domain" is only useful
  // if it says which domain. `current` is the last URL we tried.
  const finalUrl = current !== url ? current : null;
  return {
    url,
    status: first,
    chain,
    finalUrl,
    finalStatus,
    verdict: httpVerdict(first, finalStatus),
    ...(error ? { error } : {}),
  };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
