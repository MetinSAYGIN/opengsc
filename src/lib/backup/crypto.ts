// AES-256-CBC encryption for backup artifacts, in the exact envelope `openssl enc` writes and
// reads: the 8-byte "Salted__" magic, an 8-byte salt, then ciphertext — with the PBKDF2
// parameters pinned in the format itself (200k iterations, SHA-256) so the decrypt command in
// the README restores on any OpenSSL ≥ 1.1.1 regardless of that version's defaults:
//
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
//     -in opengsc-scheduled-….db.gz.enc -pass pass:PASSPHRASE | gunzip > dev.db
//
// The salt is random per file, so identical databases encrypt to different ciphertexts and the
// passphrase never appears anywhere in the artifact.

import { pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes, type Cipher } from "node:crypto";

const ITERATIONS = 200_000;
const DIGEST = "sha256";
const KEY_LEN = 32;
const IV_LEN = 16;
const SALT_BYTES = 8; // the "Salted__" header carries exactly 8 salt bytes

export function deriveKeyIv(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  // One PBKDF2 pass for key+iv is what OpenSSL does — deriving them separately would produce
  // a stream openssl cannot reproduce.
  const keyIv = pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN + IV_LEN, DIGEST);
  return { key: keyIv.subarray(0, KEY_LEN), iv: keyIv.subarray(KEY_LEN) };
}

/** Fresh salt + the 16-byte header + the cipher — everything a streaming encryptor needs.
 *  dump.ts uses this for the database pipeline; opensslEncrypt below uses it for buffers. */
export function openEncryptStream(passphrase: string): { header: Buffer; cipher: Cipher } {
  const salt = randomBytes(SALT_BYTES);
  const { key, iv } = deriveKeyIv(passphrase, salt);
  return {
    header: Buffer.concat([Buffer.from("Salted__", "latin1"), salt]),
    cipher: createCipheriv("aes-256-cbc", key, iv),
  };
}

export function opensslEncrypt(plain: Buffer, passphrase: string): Buffer {
  const { header, cipher } = openEncryptStream(passphrase);
  return Buffer.concat([header, cipher.update(plain), cipher.final()]);
}

export function opensslDecrypt(sealed: Buffer, passphrase: string): Buffer {
  if (sealed.length < 16 || sealed.subarray(0, 8).toString("latin1") !== "Salted__") {
    throw new Error("not an openssl-salted envelope (missing Salted__ header)");
  }
  const salt = sealed.subarray(8, 16);
  const { key, iv } = deriveKeyIv(passphrase, salt);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(sealed.subarray(16)), decipher.final()]);
}
