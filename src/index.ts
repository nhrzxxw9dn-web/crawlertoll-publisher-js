/**
 * @crawlertoll/publisher — publisher SDK + CLI for the Context License
 * standard (`/.well-known/context-license.json`).
 *
 * Two entry points:
 *
 *   - CLI: `npx crawlertoll init` / `validate` / `sign` / `verify` / `keygen`.
 *     Interactive scaffolder, schema validator, envelope signer.
 *
 *   - Programmatic API:
 *
 *       import {
 *         defineLicense,
 *         serializeLicense,
 *         generateEd25519Keypair,
 *         buildAndSign,
 *       } from "@crawlertoll/publisher";
 *
 *       const keys = await generateEd25519Keypair();
 *       const result = defineLicense({
 *         publisher: { name: "Example", slug: "example", domain: "example.com", contact: "ai@example.com" },
 *         endpoints: [{ name: "search", url: "https://example.com/mcp", transport: "streamable-http", description: "..." }],
 *         pricing:   { model: "per_query", currency: "USD", unit_price_micros: 5000 },
 *         terms_of_use: "https://example.com/ai-terms",
 *         attestation: { public_key_pem: keys.publicKeyPem, kid: "2026-05", algorithm: "ed25519" },
 *       });
 *       if (result.ok) {
 *         await writeFile(".well-known/context-license.json", serializeLicense(result.value));
 *       }
 *
 * Spec: https://context-license.org/v0.1
 * License: Apache-2.0 (the spec itself is CC0 1.0).
 */

// ─── Runtime guard ─────────────────────────────────────────────────
//
// @noble/ed25519 reads globalThis.crypto.getRandomValues for key
// derivation; on Node 18 that's undefined. Surface a clear error at
// module-load time rather than letting failures bubble out of a deep
// call stack with no actionable detail.

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  throw new Error(
    "@crawlertoll/publisher requires Web Crypto (globalThis.crypto.getRandomValues). " +
      "Node 20+ has this built in. On Node 18 (EOL April 2025), upgrade to Node 20.",
  );
}

// ─── License builders ──────────────────────────────────────────────

export { defineLicense, serializeLicense } from "./builders/license.js";

// ─── Envelope builders + signing ───────────────────────────────────

export {
  defineEnvelope,
  signEnvelope,
  buildAndSign,
} from "./builders/envelope.js";

// ─── Key helpers ───────────────────────────────────────────────────

export {
  generateEd25519Keypair,
  rawEd25519PublicKeyToPem,
  rawEd25519SecretKeyToPem,
  pemToRawEd25519SecretKey,
  type Ed25519Keypair,
} from "./builders/keys.js";

// ─── Re-exports from the parser (typed surface) ────────────────────

export { parse, fetchAndParse, formatErrors } from "@crawlertoll/parser";

// ─── Types ─────────────────────────────────────────────────────────

export type {
  ContextLicense,
  Publisher,
  Endpoint,
  Pricing,
  Auth,
  QualitySignals,
  Attestation,
  ValidationError,
  LicenseSpec,
  BuildResult,
  AttestationEnvelope,
  EnvelopeSpec,
} from "./types.js";
