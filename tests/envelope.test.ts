/**
 * Sign ↔ verify integration tests.
 *
 * Confirms that an envelope signed by this package's `signEnvelope()`
 * verifies cleanly under the canonical ct_att_v1 scheme (Ed25519 + JCS
 * + "ct_att_v1:" domain separator). This is the conformance gate for
 * interop with the buyer SDK's `verify()`.
 *
 * We replicate the canonicalisation + verification path here to avoid
 * a runtime dependency on @crawlertoll/client; the canonical signing
 * input shape is small and stable.
 */

import { describe, expect, it } from "vitest";

import * as ed from "@noble/ed25519";
import canonicalize from "canonicalize";

import {
  buildAndSign,
  defineEnvelope,
  generateEd25519Keypair,
  rawEd25519PublicKeyToPem,
  signEnvelope,
} from "../src/index.js";

const MAGIC = "ct_att_v1";
const ENCODER = new TextEncoder();

async function verifyInline(
  envelope: { signature: string; [k: string]: unknown },
  publicKey: Uint8Array,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, ...rest } = envelope;
  const canonical = canonicalize(rest);
  if (typeof canonical !== "string") return false;
  const signed = ENCODER.encode(MAGIC + ":" + canonical);
  const sigBytes = new Uint8Array(Buffer.from(signature, "base64"));
  if (sigBytes.length !== 64) return false;
  return ed.verifyAsync(sigBytes, signed, publicKey);
}

describe("defineEnvelope", () => {
  it("populates magic and default 5-minute expiry", () => {
    const env = defineEnvelope({
      kid: "k1",
      publisher: "example",
      endpoint: "search",
      requestHash: "abc",
      responseHash: "def",
    });
    expect(env.magic).toBe(MAGIC);
    expect(env.signature).toBe("");
    const issued = Date.parse(env.issued_at);
    const expires = Date.parse(env.expires_at);
    expect(expires - issued).toBe(5 * 60 * 1000);
  });

  it("honours caller-supplied issuedAt / expiresAt", () => {
    const issuedAt = new Date("2026-05-19T12:00:00Z");
    const expiresAt = new Date("2026-05-19T12:30:00Z");
    const env = defineEnvelope({
      kid: "k1",
      publisher: "example",
      endpoint: "search",
      requestHash: "abc",
      responseHash: "def",
      issuedAt,
      expiresAt,
    });
    expect(env.issued_at).toBe(issuedAt.toISOString());
    expect(env.expires_at).toBe(expiresAt.toISOString());
  });
});

describe("signEnvelope + verify roundtrip", () => {
  it("signs and verifies with the matching public key", async () => {
    const keys = await generateEd25519Keypair();
    const env = defineEnvelope({
      kid: "k1",
      publisher: "example",
      endpoint: "search",
      requestHash: "deadbeef",
      responseHash: "cafebabe",
    });
    const signed = await signEnvelope(env, keys.secretKey);
    expect(signed.signature.length).toBeGreaterThan(0);
    const valid = await verifyInline(signed, keys.publicKey);
    expect(valid).toBe(true);
  });

  it("buildAndSign produces an immediately-verifiable envelope", async () => {
    const keys = await generateEd25519Keypair();
    const signed = await buildAndSign(
      {
        kid: "k1",
        publisher: "example",
        endpoint: "search",
        requestHash: "1",
        responseHash: "2",
      },
      keys.secretKey,
    );
    const valid = await verifyInline(signed, keys.publicKey);
    expect(valid).toBe(true);
  });

  it("fails verification with a different public key", async () => {
    const a = await generateEd25519Keypair();
    const b = await generateEd25519Keypair();
    const signed = await buildAndSign(
      {
        kid: "k1",
        publisher: "example",
        endpoint: "search",
        requestHash: "1",
        responseHash: "2",
      },
      a.secretKey,
    );
    const valid = await verifyInline(signed, b.publicKey);
    expect(valid).toBe(false);
  });

  it("fails verification when a payload field is tampered with", async () => {
    const keys = await generateEd25519Keypair();
    const signed = await buildAndSign(
      {
        kid: "k1",
        publisher: "example",
        endpoint: "search",
        requestHash: "1",
        responseHash: "2",
      },
      keys.secretKey,
    );
    const tampered = { ...signed, response_hash: "3" };
    const valid = await verifyInline(tampered, keys.publicKey);
    expect(valid).toBe(false);
  });

  it("rejects 31-byte and 33-byte secret keys", async () => {
    await expect(
      signEnvelope(
        defineEnvelope({
          kid: "k1",
          publisher: "example",
          endpoint: "search",
          requestHash: "1",
          responseHash: "2",
        }),
        new Uint8Array(31),
      ),
    ).rejects.toThrow(/32 bytes/);
    await expect(
      signEnvelope(
        defineEnvelope({
          kid: "k1",
          publisher: "example",
          endpoint: "search",
          requestHash: "1",
          responseHash: "2",
        }),
        new Uint8Array(33),
      ),
    ).rejects.toThrow(/32 bytes/);
  });

  it("public PEM derived from the generated key works as attestation.public_key_pem", async () => {
    const keys = await generateEd25519Keypair();
    const pem = rawEd25519PublicKeyToPem(keys.publicKey);
    expect(pem).toMatch(/BEGIN PUBLIC KEY/);
    // Use it where a real context-license.json file would — confirm the
    // raw bytes survive the round-trip.
    const body = pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s+/g, "");
    const der = new Uint8Array(Buffer.from(body, "base64"));
    expect(Buffer.from(der.slice(der.length - 32)).equals(Buffer.from(keys.publicKey))).toBe(
      true,
    );
  });
});
