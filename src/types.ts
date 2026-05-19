/**
 * Types for the publisher SDK. The library re-exports the parser's
 * `ContextLicense` / `ValidationError` types verbatim, and adds two
 * builder-input types (`LicenseSpec`, `EnvelopeSpec`) and an
 * `AttestationEnvelope` shape that mirrors the buyer SDK's envelope.
 *
 * The envelope shape is canonical — `@crawlertoll/client`'s `verify()`
 * accepts any envelope produced by this package, and vice-versa.
 */

import type {
  Auth,
  ContextLicense,
  Endpoint,
  Pricing,
  Publisher,
  QualitySignals,
  ValidationError,
  Attestation,
} from "@crawlertoll/parser";

// ─── Builder input types (what callers pass to defineLicense()) ────

/**
 * Loose builder input. Mirrors `ContextLicense` but most fields can be
 * omitted — `defineLicense()` fills in sensible v1 defaults. Only the
 * fields a publisher must declare (publisher metadata, endpoints,
 * pricing, terms of use) are required.
 */
export interface LicenseSpec {
  $schema?: string;
  version?: string;
  publisher: Publisher;
  endpoints: Endpoint[];
  pricing: Pricing;
  auth?: Partial<Auth> & { schemes?: Auth["schemes"] };
  terms_of_use: string;
  quality_signals?: Partial<QualitySignals>;
  marketplace_listings?: string[];
  attestation?: Attestation;
  /** Forward-compatible: any extra top-level fields are copied through. */
  [extra: string]: unknown;
}

export type BuildResult =
  | { ok: true; value: ContextLicense }
  | { ok: false; errors: ValidationError[] };

// ─── Envelope types (sign() / verify() crypto contract) ────────────

/**
 * Canonical attestation-envelope shape. Matches the buyer SDK's
 * `AttestationEnvelope` exactly — envelopes signed by this package
 * verify against `@crawlertoll/client`'s `verify()` and vice-versa.
 */
export interface AttestationEnvelope {
  /** Magic constant for domain separation. Always `"ct_att_v1"`. */
  magic: "ct_att_v1";
  /** Key ID — references `attestation.kid` in the publisher's license file. */
  kid: string;
  /** ISO-8601 issue timestamp. */
  issued_at: string;
  /** ISO-8601 expiry timestamp. Default 5 minutes after issued_at. */
  expires_at: string;
  /** Publisher slug — matches `publisher.slug` in the license file. */
  publisher: string;
  /** Endpoint name — matches one of `endpoints[].name`. */
  endpoint: string;
  /** SHA-256 hex of the canonical request payload. */
  request_hash: string;
  /** SHA-256 hex of the canonical response payload. */
  response_hash: string;
  /** Base64-encoded Ed25519 signature over the JCS-canonicalised envelope. */
  signature: string;
}

export interface EnvelopeSpec {
  /** Matches `attestation.kid` in the publisher's license file. */
  kid: string;
  /** Publisher slug. */
  publisher: string;
  /** Endpoint name. */
  endpoint: string;
  /** SHA-256 hex of the request payload. */
  requestHash: string;
  /** SHA-256 hex of the response payload. */
  responseHash: string;
  /** Defaults to `new Date()`. */
  issuedAt?: Date;
  /** Defaults to `issuedAt + 5 minutes`. */
  expiresAt?: Date;
}

// ─── Re-exports for ergonomic consumption ──────────────────────────

export type {
  ContextLicense,
  Publisher,
  Endpoint,
  Pricing,
  Auth,
  QualitySignals,
  Attestation,
  ValidationError,
} from "@crawlertoll/parser";
