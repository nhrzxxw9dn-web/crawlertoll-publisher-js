/**
 * Programmatic builder for a Context License document.
 *
 * Two entry points:
 *
 *   - `defineLicense(spec)` — typed, ergonomic builder. Pass a high-level
 *     object; get a `ContextLicense` you can serialize.
 *
 *   - `validate(license)` — re-export of the parser's `parse()` against an
 *     in-memory object. Use after building to confirm schema-conformance.
 *
 * The builder applies sensible v1.x defaults (auth schemes, freshness
 * targets, `$schema` pointer, `last_updated` ISO timestamp) but never
 * fabricates required fields like `attestation.public_key_pem` — those
 * must be passed in. Generate keys via `generateEd25519Keypair()` from
 * `../keys/ed25519.js` first.
 */

import { parse, type ContextLicense } from "@crawlertoll/parser";

import type { LicenseSpec, BuildResult } from "../types.js";

const DEFAULT_SCHEMA_URL =
  "https://schemas.crawlertoll.com/context-license/v1.json";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_FRESHNESS_SECONDS = 86_400;
const DEFAULT_UPTIME_PCT = 99.0;
const DEFAULT_INCLUDED_FREE = 1000;

/**
 * Build a Context License document from a high-level spec.
 *
 * Returns a tagged union: `{ ok: true, value }` on success (the value is
 * schema-valid against `context-license-v1.json`), or `{ ok: false, errors }`
 * with structured validation errors if the input is incomplete or invalid.
 *
 * The function never throws on validation outcomes — it returns them.
 */
export function defineLicense(spec: LicenseSpec): BuildResult {
  const license: ContextLicense = {
    $schema: spec.$schema ?? DEFAULT_SCHEMA_URL,
    version: spec.version ?? DEFAULT_VERSION,
    publisher: spec.publisher,
    endpoints: spec.endpoints,
    pricing: {
      model: spec.pricing.model,
      currency: spec.pricing.currency,
      unit_price_micros: spec.pricing.unit_price_micros,
      ...(spec.pricing.included_free !== undefined
        ? { included_free: spec.pricing.included_free }
        : spec.pricing.model === "freemium"
          ? { included_free: DEFAULT_INCLUDED_FREE }
          : {}),
      ...(spec.pricing.bulk_tiers ? { bulk_tiers: spec.pricing.bulk_tiers } : {}),
    },
    auth: {
      schemes: spec.auth?.schemes ?? ["anonymous", "api_key", "x402"],
      ...(spec.auth?.rate_limits ? { rate_limits: spec.auth.rate_limits } : {}),
      ...(spec.auth?.oauth2_metadata_url
        ? { oauth2_metadata_url: spec.auth.oauth2_metadata_url }
        : {}),
    },
    terms_of_use: spec.terms_of_use,
    quality_signals: {
      uptime_sla_pct: spec.quality_signals?.uptime_sla_pct ?? DEFAULT_UPTIME_PCT,
      freshness_target_seconds:
        spec.quality_signals?.freshness_target_seconds ?? DEFAULT_FRESHNESS_SECONDS,
      last_updated: spec.quality_signals?.last_updated ?? new Date().toISOString(),
      ...(spec.quality_signals?.citation_density_target !== undefined
        ? { citation_density_target: spec.quality_signals.citation_density_target }
        : {}),
    },
    ...(spec.marketplace_listings
      ? { marketplace_listings: spec.marketplace_listings }
      : {}),
    ...(spec.attestation ? { attestation: spec.attestation } : {}),
  };

  // Forward-compat: copy through any unknown top-level fields the caller
  // wanted to attach (e.g. vendor-namespaced extensions).
  for (const key of Object.keys(spec)) {
    if (key in license) continue;
    if (
      [
        "$schema",
        "version",
        "publisher",
        "endpoints",
        "pricing",
        "auth",
        "terms_of_use",
        "quality_signals",
        "marketplace_listings",
        "attestation",
      ].includes(key)
    ) {
      continue;
    }
    (license as Record<string, unknown>)[key] = (spec as Record<string, unknown>)[key];
  }

  const result = parse(license);
  if (result.ok) {
    return { ok: true, value: result.value };
  }
  return { ok: false, errors: result.errors };
}

/**
 * Serialize a license to a canonical, human-readable JSON string suitable
 * for writing to `/.well-known/context-license.json`. Two-space indent;
 * stable key order is left to JSON.stringify (which is deterministic for
 * the fields we set). The output is parseable by `@crawlertoll/parser`.
 */
export function serializeLicense(license: ContextLicense): string {
  return JSON.stringify(license, null, 2) + "\n";
}
