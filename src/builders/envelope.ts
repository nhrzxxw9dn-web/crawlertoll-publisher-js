/**
 * Attestation-envelope builder + signer.
 *
 * Mirrors the canonical signing scheme implemented in `@crawlertoll/client`:
 *
 *   - JCS RFC 8785 canonicalization of the envelope (minus `signature`)
 *   - Domain separator: `"ct_att_v1:"`
 *   - Ed25519 over the canonical bytes
 *   - Base64 signature
 *
 * Buyer code (`verify()` in `@crawlertoll/client`) will accept any
 * envelope produced here and vice-versa.
 */

import * as ed from "@noble/ed25519";
import canonicalize from "canonicalize";

import type { AttestationEnvelope, EnvelopeSpec } from "../types.js";

const MAGIC = "ct_att_v1" as const;
const ENCODER = new TextEncoder();

/**
 * Build an unsigned attestation envelope from a spec object. The result
 * is identical in shape to a final envelope but the `signature` field is
 * an empty string — call `signEnvelope()` to populate it.
 *
 * `issued_at` defaults to "now" and `expires_at` to `now + 5 minutes`
 * (matches the buyer SDK's 5-minute clock-skew tolerance, so a freshly-
 * signed envelope verifies cleanly under the buyer's default policy).
 */
export function defineEnvelope(spec: EnvelopeSpec): AttestationEnvelope {
  const now = spec.issuedAt ?? new Date();
  const expires = spec.expiresAt ?? new Date(now.getTime() + 5 * 60 * 1000);
  return {
    magic: MAGIC,
    kid: spec.kid,
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    publisher: spec.publisher,
    endpoint: spec.endpoint,
    request_hash: spec.requestHash,
    response_hash: spec.responseHash,
    signature: "",
  };
}

/**
 * Sign an envelope with a 32-byte Ed25519 secret key.
 *
 * Returns the envelope with its `signature` field populated. The input
 * envelope's `signature` is ignored — we sign everything *except* it,
 * then attach the new signature.
 *
 * Throws on malformed key. Never returns an unsigned envelope.
 */
export async function signEnvelope(
  envelope: Omit<AttestationEnvelope, "signature"> & { signature?: string },
  secretKey: Uint8Array,
): Promise<AttestationEnvelope> {
  if (secretKey.length !== 32) {
    throw new Error(
      `Ed25519 secret key must be 32 bytes, got ${secretKey.length}`,
    );
  }
  const signed = canonicalSigningInput(envelope);
  const sig = await ed.signAsync(signed, secretKey);
  return {
    ...envelope,
    signature: bytesToBase64(sig),
  } as AttestationEnvelope;
}

/**
 * Convenience: define + sign in one call. Most callers want this.
 */
export async function buildAndSign(
  spec: EnvelopeSpec,
  secretKey: Uint8Array,
): Promise<AttestationEnvelope> {
  return signEnvelope(defineEnvelope(spec), secretKey);
}

// ─── Internal: canonical signing input ──────────────────────────────

function canonicalSigningInput(
  envelope: Omit<AttestationEnvelope, "signature"> & { signature?: string },
): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature: _omit, ...rest } = envelope;
  const canonical = canonicalize(rest);
  if (typeof canonical !== "string") {
    throw new Error("canonicalize() did not return a string");
  }
  return ENCODER.encode(MAGIC + ":" + canonical);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
