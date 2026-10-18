import assert from "node:assert/strict";
import test from "node:test";
import { opensslEncrypt, opensslDecrypt } from "./crypto";

test("roundtrip returns the plaintext", () => {
  const plain = Buffer.from("OpenGSC backup roundtrip\n\0binary\u0000ok", "utf8");
  const sealed = opensslEncrypt(plain, "correct horse battery staple");
  assert.ok(sealed.length > plain.length);
  assert.deepEqual(opensslDecrypt(sealed, "correct horse battery staple"), plain);
});

test("output is an openssl Salted__ envelope with a fresh salt per call", () => {
  const a = opensslEncrypt(Buffer.from("x"), "pass-12345678");
  const b = opensslEncrypt(Buffer.from("x"), "pass-12345678");
  assert.equal(a.subarray(0, 8).toString("latin1"), "Salted__");
  assert.equal(b.subarray(0, 8).toString("latin1"), "Salted__");
  assert.notDeepEqual(a.subarray(8, 16), b.subarray(8, 16), "salt must be random per file");
  assert.notDeepEqual(a, b);
});

test("wrong passphrase fails rather than producing garbage", () => {
  const sealed = opensslEncrypt(Buffer.from("secret"), "right-passphrase");
  assert.throws(() => opensslDecrypt(sealed, "wrong-passphrase"));
});

test("non-envelope input is rejected, not decrypted", () => {
  assert.throws(() => opensslDecrypt(Buffer.from("not an envelope at all…"), "p"));
  assert.throws(() => opensslDecrypt(Buffer.alloc(4), "p"));
});

// Pinned vector produced by real OpenSSL 3.6.4:
//   openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt \
//     -in <"OpenGSC backup crypto test vector 42\n"> -pass pass:test-passphrase-123
// If this ever fails, Node's parameters drifted from the decrypt command in the README —
// that is a compatibility break, not a flaky test.
const OPENSSL_VECTOR = Buffer.from([
  83, 97, 108, 116, 101, 100, 95, 95, 111, 22, 61, 138, 125, 137, 39, 239,
  46, 167, 79, 142, 40, 49, 29, 182, 15, 214, 237, 181, 176, 181, 51, 207,
  146, 129, 170, 44, 183, 103, 75, 113, 218, 85, 31, 149, 252, 196, 120, 131,
  213, 19, 181, 244, 56, 220, 33, 63, 7, 228, 197, 119, 125, 159, 241, 217,
]);

test("decrypts a file produced by the openssl CLI (README restore command)", () => {
  assert.equal(
    opensslDecrypt(OPENSSL_VECTOR, "test-passphrase-123").toString("utf8"),
    "OpenGSC backup crypto test vector 42\n",
  );
});
