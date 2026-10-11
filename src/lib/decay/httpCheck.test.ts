import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { checkHttpStatus, mapLimit } from "./httpCheck";

// A local server stands in for a migrated site. It lives on 127.0.0.1, so these tests opt into
// private targets the same way an operator auditing a LAN staging site would.
let server: http.Server;
let base = "";
const prevEnv = process.env.OPENGSC_ALLOW_PRIVATE_TARGETS;

before(async () => {
  server = http.createServer((req, res) => {
    const send = (status: number, location?: string) => {
      res.writeHead(status, location ? { location } : { "content-type": "text/html" });
      res.end(req.method === "HEAD" ? undefined : "<p>body</p>");
    };
    switch (req.url) {
      case "/ok": return send(200);
      case "/missing": return send(404);
      case "/gone": return send(410);
      case "/moved": return send(301, "/ok");
      case "/chain": return send(301, "/chain2");
      case "/chain2": return send(302, "/moved");
      case "/to-404": return send(301, "/missing");
      case "/loop-a": return send(301, "/loop-b");
      case "/loop-b": return send(301, "/loop-a");
      case "/no-location": res.writeHead(301); return res.end();
      case "/no-head": return req.method === "HEAD" ? send(405) : send(200);
      case "/dead-domain": return send(301, "https://nonexistent-host.invalid/x");
      default: return send(500);
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OPENGSC_ALLOW_PRIVATE_TARGETS = "1";
});

after(() => {
  server.close();
  if (prevEnv === undefined) delete process.env.OPENGSC_ALLOW_PRIVATE_TARGETS;
  else process.env.OPENGSC_ALLOW_PRIVATE_TARGETS = prevEnv;
});

test("plain statuses", async () => {
  const ok = await checkHttpStatus(`${base}/ok`);
  assert.equal(ok.status, 200);
  assert.equal(ok.verdict, "ok");
  assert.equal(ok.finalUrl, null);
  assert.equal((await checkHttpStatus(`${base}/missing`)).verdict, "client_error");
  assert.equal((await checkHttpStatus(`${base}/gone`)).status, 410);
  assert.equal((await checkHttpStatus(`${base}/boom`)).verdict, "server_error");
});

test("a redirect reports the first status, the chain and where it lands", async () => {
  const r = await checkHttpStatus(`${base}/chain`);
  assert.equal(r.status, 301);
  assert.deepEqual(r.chain.map(h => h.status), [301, 302, 301, 200]);
  assert.equal(r.finalUrl, `${base}/ok`);
  assert.equal(r.finalStatus, 200);
  assert.equal(r.verdict, "redirect");
});

test("a redirect onto a 404 is a 404, not a redirect", async () => {
  const r = await checkHttpStatus(`${base}/to-404`);
  assert.equal(r.status, 301);
  assert.equal(r.finalStatus, 404);
  assert.equal(r.verdict, "client_error");
});

test("loops and broken redirects end as errors, never hang", async () => {
  const loop = await checkHttpStatus(`${base}/loop-a`);
  assert.equal(loop.error, "redirect_loop");
  assert.equal(loop.verdict, "error");
  assert.equal(loop.status, 301);
  const noLoc = await checkHttpStatus(`${base}/no-location`);
  assert.equal(noLoc.error, "redirect_without_location");
});

test("a redirect to a dead host still says where it points", async () => {
  const r = await checkHttpStatus(`${base}/dead-domain`);
  assert.equal(r.status, 301);
  assert.equal(r.finalUrl, "https://nonexistent-host.invalid/x");
  assert.equal(r.finalStatus, null);
  assert.equal(r.verdict, "error");
  assert.ok(r.error);
});

test("HEAD refused → GET decides", async () => {
  const r = await checkHttpStatus(`${base}/no-head`);
  assert.equal(r.status, 200);
  assert.equal(r.verdict, "ok");
});

test("private addresses are refused unless the instance allows them", async () => {
  process.env.OPENGSC_ALLOW_PRIVATE_TARGETS = "";
  try {
    const r = await checkHttpStatus(`${base}/ok`);
    assert.equal(r.status, 0);
    assert.equal(r.error, "private_address");
    assert.equal(r.verdict, "error");
  } finally {
    process.env.OPENGSC_ALLOW_PRIVATE_TARGETS = "1";
  }
});

test("mapLimit keeps order and the concurrency bound", async () => {
  let inFlight = 0, peak = 0;
  const out = await mapLimit([5, 1, 4, 2, 3], 2, async n => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, n * 3));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30]);
  assert.equal(peak, 2);
});
