/**
 * Builder + serialization tests.
 *
 * Exercises:
 *   - defineLicense() fills in v1 defaults and produces a schema-valid
 *     ContextLicense from a minimal spec
 *   - Required-field omissions surface as ok: false + structured errors
 *   - serializeLicense() round-trips through @crawlertoll/parser cleanly
 *   - Forward-compat: unknown top-level fields pass through
 */

import { describe, expect, it } from "vitest";

import { parse } from "@crawlertoll/parser";

import {
  defineLicense,
  serializeLicense,
  type LicenseSpec,
} from "../src/index.js";

const MINIMAL_SPEC: LicenseSpec = {
  publisher: {
    name: "Example Publisher",
    slug: "example",
    domain: "example.com",
    contact: "crawlers@example.com",
  },
  endpoints: [
    {
      name: "search",
      url: "https://example.com/mcp",
      transport: "streamable-http",
      description: "Search across our content corpus, returning typed results.",
    },
  ],
  pricing: {
    model: "per_query",
    currency: "USD",
    unit_price_micros: 5000,
  },
  terms_of_use: "https://example.com/ai-terms",
};

describe("defineLicense", () => {
  it("builds a schema-valid license from a minimal spec", () => {
    const result = defineLicense(MINIMAL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.publisher.slug).toBe("example");
    expect(result.value.endpoints).toHaveLength(1);
    expect(result.value.pricing.unit_price_micros).toBe(5000);
  });

  it("applies default auth schemes when none are passed", () => {
    const result = defineLicense(MINIMAL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auth.schemes).toEqual(["anonymous", "api_key", "x402"]);
  });

  it("sets last_updated to a parseable ISO timestamp by default", () => {
    const result = defineLicense(MINIMAL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ts = Date.parse(result.value.quality_signals.last_updated);
    expect(Number.isNaN(ts)).toBe(false);
    expect(Math.abs(ts - Date.now())).toBeLessThan(10_000); // within 10s
  });

  it("respects caller-provided quality_signals overrides", () => {
    const result = defineLicense({
      ...MINIMAL_SPEC,
      quality_signals: {
        uptime_sla_pct: 99.99,
        freshness_target_seconds: 60,
        last_updated: "2026-05-19T12:00:00Z",
        citation_density_target: 1.0,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quality_signals.uptime_sla_pct).toBe(99.99);
    expect(result.value.quality_signals.freshness_target_seconds).toBe(60);
    expect(result.value.quality_signals.last_updated).toBe(
      "2026-05-19T12:00:00Z",
    );
    expect(result.value.quality_signals.citation_density_target).toBe(1.0);
  });

  it("emits included_free by default for freemium pricing", () => {
    const result = defineLicense({
      ...MINIMAL_SPEC,
      pricing: {
        model: "freemium",
        currency: "USD",
        unit_price_micros: 5000,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pricing.included_free).toBe(1000);
  });

  it("returns structured errors on a missing required field", () => {
    const bad = { ...MINIMAL_SPEC, publisher: { ...MINIMAL_SPEC.publisher, slug: "X" } };
    // slug pattern requires lowercase + length ≥ 2
    const result = defineLicense(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths.some((p) => p.startsWith("publisher.slug"))).toBe(true);
  });

  it("preserves unknown top-level fields (forward-compat)", () => {
    const spec = {
      ...MINIMAL_SPEC,
      "x-extension": { foo: "bar" },
    } as LicenseSpec;
    const result = defineLicense(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as Record<string, unknown>)["x-extension"]).toEqual({
      foo: "bar",
    });
  });
});

describe("serializeLicense", () => {
  it("round-trips through @crawlertoll/parser", () => {
    const built = defineLicense(MINIMAL_SPEC);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const serialized = serializeLicense(built.value);
    const re = parse(serialized);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.value.publisher.slug).toBe("example");
  });

  it("ends with a single trailing newline", () => {
    const built = defineLicense(MINIMAL_SPEC);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const serialized = serializeLicense(built.value);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
  });
});
