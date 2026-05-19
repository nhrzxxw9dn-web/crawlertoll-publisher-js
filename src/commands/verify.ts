/**
 * `crawlertoll verify` — verify a signed attestation envelope against a
 * public key.
 *
 * Mirrors the buyer SDK's `verify()` semantics exactly (Ed25519 + JCS
 * canonicalisation with `"ct_att_v1:"` domain separator). Envelopes
 * signed by `@crawlertoll/publisher`'s `sign` command verify here, and
 * vice-versa.
 *
 * Exit codes:
 *   0  valid
 *   1  invalid (reason printed to stderr)
 *   2  filesystem / parse error
 */

import { readFile } from "node:fs/promises";

import * as ed from "@noble/ed25519";
import canonicalize from "canonicalize";

import { fail, header, info, success } from "../util/output.js";
import { pemToRawEd25519PublicKey } from "./_pem-public.js";
import type { AttestationEnvelope } from "../types.js";

const MAGIC = "ct_att_v1";
const ENCODER = new TextEncoder();

export interface VerifyOptions {
  envelope: string;
  key: string;
  /** Allow this many ms of clock skew. Default 5 minutes. */
  clockSkewMs?: number;
}

export async function runVerify(opts: VerifyOptions): Promise<number> {
  header(`crawlertoll verify ${opts.envelope}`);

  let envelope: AttestationEnvelope;
  try {
    const text = await readFile(opts.envelope, "utf8");
    envelope = JSON.parse(text) as AttestationEnvelope;
  } catch (err) {
    fail(`Could not read envelope: ${(err as Error).message}`);
    return 2;
  }

  let publicKey: Uint8Array;
  try {
    const pem = await readFile(opts.key, "utf8");
    publicKey = pemToRawEd25519PublicKey(pem);
  } catch (err) {
    fail(`Could not load public key: ${(err as Error).message}`);
    return 2;
  }

  if (envelope.magic !== MAGIC) {
    fail(`bad-magic: expected "${MAGIC}", got "${envelope.magic}"`);
    return 1;
  }

  const now = new Date().getTime();
  const skew = opts.clockSkewMs ?? 5 * 60 * 1000;
  const issued = Date.parse(envelope.issued_at);
  const expires = Date.parse(envelope.expires_at);
  if (Number.isNaN(issued) || Number.isNaN(expires)) {
    fail(`malformed: issued_at or expires_at is not ISO-8601`);
    return 1;
  }
  if (now > expires) {
    fail(`expired: expired at ${envelope.expires_at}, now is ${new Date(now).toISOString()}`);
    return 1;
  }
  if (issued > now + skew) {
    fail(`future-dated: issued_at ${envelope.issued_at} is more than ${skew}ms in the future`);
    return 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, ...rest } = envelope;
  const canonical = canonicalize(rest);
  if (typeof canonical !== "string") {
    fail(`malformed: canonicalize() failed`);
    return 1;
  }
  const signedBytes = ENCODER.encode(MAGIC + ":" + canonical);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64ToBytes(signature);
  } catch (err) {
    fail(`malformed: signature is not valid base64: ${(err as Error).message}`);
    return 1;
  }
  if (signatureBytes.length !== 64) {
    fail(`malformed: Ed25519 signature must be 64 bytes, got ${signatureBytes.length}`);
    return 1;
  }

  let valid = false;
  try {
    valid = await ed.verifyAsync(signatureBytes, signedBytes, publicKey);
  } catch (err) {
    fail(`bad-signature: ${(err as Error).message}`);
    return 1;
  }
  if (!valid) {
    fail(`bad-signature: Ed25519 verification returned false`);
    return 1;
  }

  success(`Envelope is valid.`);
  info(`  publisher: ${envelope.publisher}`);
  info(`  endpoint:  ${envelope.endpoint}`);
  info(`  kid:       ${envelope.kid}`);
  info(`  window:    ${envelope.issued_at} → ${envelope.expires_at}`);
  return 0;
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
