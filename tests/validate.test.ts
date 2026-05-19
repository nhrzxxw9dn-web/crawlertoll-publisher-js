/**
 * `crawlertoll validate` test — local file path mode only (HTTP modes
 * require network and are excluded from unit tests).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runValidate } from "../src/commands/validate.js";

describe("runValidate (local file)", () => {
  let workDir: string;
  let originalLog: typeof process.stdout.write;
  let originalErr: typeof process.stderr.write;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ctp-val-"));
    originalLog = process.stdout.write.bind(process.stdout);
    originalErr = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout.write as any) = () => true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr.write as any) = () => true;
  });

  afterEach(async () => {
    process.stdout.write = originalLog;
    process.stderr.write = originalErr;
    await rm(workDir, { recursive: true, force: true });
  });

  it("returns 0 for a schema-valid file", async () => {
    const validFile = JSON.stringify({
      $schema: "https://schemas.crawlertoll.com/context-license/v1.json",
      version: "1.0.0",
      publisher: {
        name: "Example",
        slug: "example",
        domain: "example.com",
        contact: "ai@example.com",
      },
      endpoints: [
        {
          name: "search",
          url: "https://example.com/mcp",
          transport: "streamable-http",
          description: "An MCP search endpoint.",
        },
      ],
      pricing: {
        model: "per_query",
        currency: "USD",
        unit_price_micros: 5000,
      },
      auth: { schemes: ["anonymous", "api_key", "x402"] },
      terms_of_use: "https://example.com/ai-terms",
      quality_signals: {
        uptime_sla_pct: 99.0,
        freshness_target_seconds: 86400,
        last_updated: "2026-05-19T00:00:00Z",
      },
    });
    const p = join(workDir, "good.json");
    await writeFile(p, validFile, "utf8");
    const code = await runValidate(p, { quiet: true });
    expect(code).toBe(0);
  });

  it("returns 1 for a schema-invalid file (missing required field)", async () => {
    const bad = JSON.stringify({
      version: "1.0.0",
      // missing publisher, endpoints, pricing, auth, terms_of_use, quality_signals
    });
    const p = join(workDir, "bad.json");
    await writeFile(p, bad, "utf8");
    const code = await runValidate(p, { quiet: true });
    expect(code).toBe(1);
  });

  it("returns 2 for a non-existent file", async () => {
    const code = await runValidate(join(workDir, "missing.json"), {
      quiet: true,
    });
    expect(code).toBe(2);
  });
});
