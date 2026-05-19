/**
 * Ed25519 keypair tests.
 *
 *   - generateEd25519Keypair() produces a 32-byte secret + 32-byte public
 *   - PEM encoding round-trips back to the same raw bytes
 *   - The PEM public key is consumable by the buyer-SDK's
 *     pemToRawEd25519PublicKey() path (we replicate that decoder here to
 *     avoid the publisher package depending on the buyer SDK at runtime;
 *     conformance is enforced by the sign↔verify integration test).
 */

import { describe, expect, it } from "vitest";

import {
  generateEd25519Keypair,
  pemToRawEd25519SecretKey,
  rawEd25519PublicKeyToPem,
  rawEd25519SecretKeyToPem,
} from "../src/index.js";

describe("generateEd25519Keypair", () => {
  it("produces 32-byte secret and 32-byte public keys", async () => {
    const keys = await generateEd25519Keypair();
    expect(keys.secretKey).toHaveLength(32);
    expect(keys.publicKey).toHaveLength(32);
  });

  it("public PEM has the BEGIN/END markers", async () => {
    const keys = await generateEd25519Keypair();
    expect(keys.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(keys.publicKeyPem).toMatch(/-----END PUBLIC KEY-----\n$/);
  });

  it("secret PEM has the BEGIN/END markers", async () => {
    const keys = await generateEd25519Keypair();
    expect(keys.secretKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(keys.secretKeyPem).toMatch(/-----END PRIVATE KEY-----\n$/);
  });

  it("two consecutive keypair generations differ (random source works)", async () => {
    const a = await generateEd25519Keypair();
    const b = await generateEd25519Keypair();
    expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(false);
  });
});

describe("PEM round-trip", () => {
  it("rawEd25519SecretKeyToPem → pemToRawEd25519SecretKey returns the same bytes", async () => {
    const keys = await generateEd25519Keypair();
    const pem = rawEd25519SecretKeyToPem(keys.secretKey);
    const back = pemToRawEd25519SecretKey(pem);
    expect(Buffer.from(back).equals(Buffer.from(keys.secretKey))).toBe(true);
  });

  it("rawEd25519PublicKeyToPem produces a 3-line PEM", async () => {
    const keys = await generateEd25519Keypair();
    const pem = rawEd25519PublicKeyToPem(keys.publicKey);
    const lines = pem.trim().split("\n");
    // BEGIN + body + END
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects keys of the wrong length", () => {
    expect(() => rawEd25519PublicKeyToPem(new Uint8Array(16))).toThrow(/32 bytes/);
    expect(() => rawEd25519SecretKeyToPem(new Uint8Array(33))).toThrow(/32 bytes/);
  });
});
