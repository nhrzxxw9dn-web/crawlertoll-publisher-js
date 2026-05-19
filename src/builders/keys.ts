/**
 * Ed25519 keypair generation + PEM round-trip helpers.
 *
 * The PEM encoding matches RFC 8410 (Ed25519 public keys) and PKCS#8 v1
 * (Ed25519 private keys) — the same shape the buyer SDK's
 * `pemToRawEd25519PublicKey()` consumes for `attestation.public_key_pem`.
 *
 * Implementation uses @noble/ed25519 for key derivation + WebCrypto for
 * the secure random bytes, so the same code runs on Node 20+, Bun, Deno,
 * and Cloudflare Workers without modification.
 */

import * as ed from "@noble/ed25519";

const ED25519_OID = new Uint8Array([0x06, 0x03, 0x2b, 0x65, 0x70]); // 1.3.101.112

export interface Ed25519Keypair {
  /** Raw 32-byte Ed25519 secret key (a.k.a. seed). */
  secretKey: Uint8Array;
  /** Raw 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** PKCS#8 PEM-encoded secret key (5 lines). */
  secretKeyPem: string;
  /** SubjectPublicKeyInfo PEM-encoded public key (3 lines). */
  publicKeyPem: string;
}

/**
 * Generate a fresh Ed25519 keypair. The secret key is a 32-byte seed
 * drawn from `crypto.getRandomValues`; the public key is derived from it.
 *
 * Both keys are returned in raw form *and* PEM form. The PEM forms are
 * the canonical artifacts to write to disk / inject into
 * `context-license.json` / paste into secret stores.
 */
export async function generateEd25519Keypair(): Promise<Ed25519Keypair> {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error(
      "@crawlertoll/publisher requires Web Crypto. Node 20+, Bun, Deno, and " +
        "Cloudflare Workers all qualify. Node 18 is EOL — upgrade to 20+.",
    );
  }
  const secretKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secretKey);
  const publicKey = await ed.getPublicKeyAsync(secretKey);

  return {
    secretKey,
    publicKey,
    secretKeyPem: rawEd25519SecretKeyToPem(secretKey),
    publicKeyPem: rawEd25519PublicKeyToPem(publicKey),
  };
}

/**
 * Encode a raw 32-byte Ed25519 public key as a PEM-formatted
 * SubjectPublicKeyInfo string (the format `attestation.public_key_pem`
 * expects in `context-license.json`).
 */
export function rawEd25519PublicKeyToPem(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  // SubjectPublicKeyInfo:
  //   SEQUENCE {
  //     SEQUENCE { OID Ed25519 }
  //     BIT STRING { 0x00 || publicKey }
  //   }
  const algSeq = derSequence(ED25519_OID);
  const bitString = new Uint8Array(1 + publicKey.length);
  bitString[0] = 0x00;
  bitString.set(publicKey, 1);
  const bitStringTlv = derTlv(0x03, bitString);
  const spki = derSequence(concatBytes(algSeq, bitStringTlv));
  return pemEncode("PUBLIC KEY", spki);
}

/**
 * Encode a raw 32-byte Ed25519 secret-key seed as a PKCS#8-formatted
 * PEM string. Compatible with `openssl pkey -in ...` and with the secret
 * key consumed by `signEnvelope()` (which strips the PEM wrapper and
 * extracts the 32-byte seed).
 */
export function rawEd25519SecretKeyToPem(secretKey: Uint8Array): string {
  if (secretKey.length !== 32) {
    throw new Error(`Ed25519 secret key must be 32 bytes, got ${secretKey.length}`);
  }
  // PrivateKeyInfo:
  //   SEQUENCE {
  //     INTEGER 0           (version)
  //     SEQUENCE { OID Ed25519 }   (privateKeyAlgorithm)
  //     OCTET STRING { OCTET STRING { secretKey } }   (privateKey)
  //   }
  const versionTlv = derTlv(0x02, new Uint8Array([0x00]));
  const algSeq = derSequence(ED25519_OID);
  const innerOctet = derTlv(0x04, secretKey);
  const outerOctet = derTlv(0x04, innerOctet);
  const pkcs8 = derSequence(concatBytes(versionTlv, algSeq, outerOctet));
  return pemEncode("PRIVATE KEY", pkcs8);
}

/**
 * Decode a PKCS#8 PEM private key back to the raw 32-byte seed. Tolerant
 * of CRLF / LF line endings and missing/extra trailing newlines.
 */
export function pemToRawEd25519SecretKey(pem: string): Uint8Array {
  const der = pemDecode(pem, "PRIVATE KEY");
  // PrivateKeyInfo path: SEQUENCE → [version, algorithm, privateKey-OCTET].
  // We don't fully parse — the seed is always the last 32 bytes of the DER.
  if (der.length < 32) {
    throw new Error(`PKCS#8 PEM too short to contain an Ed25519 seed: ${der.length} bytes`);
  }
  return der.slice(der.length - 32);
}

// ─── Internal DER helpers ───────────────────────────────────────────

function derLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len <= 0xff) return new Uint8Array([0x81, len]);
  if (len <= 0xffff) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  throw new Error(`DER length too large: ${len}`);
}

function derTlv(tag: number, value: Uint8Array): Uint8Array {
  const len = derLength(value.length);
  return concatBytes(new Uint8Array([tag]), len, value);
}

function derSequence(contents: Uint8Array): Uint8Array {
  return derTlv(0x30, contents);
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// ─── Internal PEM helpers ───────────────────────────────────────────

function pemEncode(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der);
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

function pemDecode(pem: string, label: string): Uint8Array {
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  const startIdx = pem.indexOf(begin);
  const endIdx = pem.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`PEM missing ${label} markers`);
  }
  const body = pem.slice(startIdx + begin.length, endIdx).replace(/\s+/g, "");
  return base64ToBytes(body);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
