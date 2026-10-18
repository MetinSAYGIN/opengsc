import assert from "node:assert/strict";
import test from "node:test";
import { mintAuditMdToken, normalizeMdLang, parseAuditMdToken } from "./shareMd";

// The token is the only gate on /share/audit/* — these tests pin the two properties that
// make it safe to expose: a minted token round-trips (with and without the .md suffix),
// and anything tampered with is rejected rather than partially trusted.

test("md share token: mint → parse round-trip, .md suffix optional", () => {
  const id = "cm1abc123def456";
  const token = mintAuditMdToken(id);
  assert.equal(parseAuditMdToken(token), id);
  assert.equal(parseAuditMdToken(`${token}.md`), id);
  // tokens are id-specific: a different id does not verify against this signature
  assert.notEqual(parseAuditMdToken(mintAuditMdToken("cm1other999xyz")), id);
});

test("md share token: tampered or malformed tokens are rejected", () => {
  const token = mintAuditMdToken("cm1abc123def456");
  // flip a character inside the signature
  const sig = token.split(".")[1];
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(parseAuditMdToken(`cm1abc123def456.${flipped}`), null);
  // someone else's id with this token's signature
  assert.equal(parseAuditMdToken(`cm1evil000evil00.${sig}`), null);
  // wrong shapes: no separator, extra segments, empty
  assert.equal(parseAuditMdToken("cm1abc123def456"), null);
  assert.equal(parseAuditMdToken(`${token}.md.html`), null);
  assert.equal(parseAuditMdToken(""), null);
  assert.equal(parseAuditMdToken(".."), null);
});

test("md share link language: unknown values fall back to en", () => {
  assert.equal(normalizeMdLang("ru"), "ru");
  assert.equal(normalizeMdLang("RU"), "ru");
  assert.equal(normalizeMdLang("xx"), "en");
  assert.equal(normalizeMdLang(null), "en");
  assert.equal(normalizeMdLang(""), "en");
});
