/**
 * `crawlertoll init` non-interactive end-to-end test.
 *
 *   - runInit with --yes + flags produces /.well-known/context-license.json
 *   - The output file is schema-valid against @crawlertoll/parser
 *   - The output file uses the real Ed25519 public key generated for it
 *   - The keys/ directory contains a 32-byte PEM-decoded secret seed
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parse } from "@crawlertoll/parser";

import { pemToRawEd25519SecretKey } from "../src/index.js";
import { runInit } from "../src/commands/init.js";

describe("runInit (non-interactive)", () => {
  let workDir: string;
  let originalLog: typeof process.stdout.write;
  let originalErr: typeof process.stderr.write;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ctp-init-"));
    // Quiet the test runner — runInit prints a wizard banner.
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

  it("produces a schema-valid file with all flag-supplied defaults", async () => {
    const outDir = join(workDir, "public");
    const keysDir = join(workDir, "keys");
    const code = await runInit({
      yes: true,
      outDir,
      keysDir,
      name: "Test Publisher",
      slug: "test-pub",
      domain: "testpub.example",
      contact: "ai@testpub.example",
      endpointName: "search",
      endpointUrl: "https://testpub.example/mcp/search",
      priceUsdCents: 0.005,
    });
    expect(code).toBe(0);

    const text = await readFile(
      join(outDir, ".well-known", "context-license.json"),
      "utf8",
    );
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.publisher.slug).toBe("test-pub");
    expect(result.value.publisher.domain).toBe("testpub.example");
    expect(result.value.endpoints[0]!.url).toBe(
      "https://testpub.example/mcp/search",
    );
    expect(result.value.pricing.unit_price_micros).toBe(5000);
    expect(result.value.attestation?.algorithm).toBe("ed25519");
    expect(result.value.attestation?.public_key_pem).toMatch(/BEGIN PUBLIC KEY/);
  });

  it("writes a usable Ed25519 secret PEM to keys/<slug>-priv.pem", async () => {
    const outDir = join(workDir, "public");
    const keysDir = join(workDir, "keys");
    const code = await runInit({
      yes: true,
      outDir,
      keysDir,
      slug: "test-pub",
      domain: "testpub.example",
      name: "Test Publisher",
      contact: "ai@testpub.example",
      endpointName: "search",
      endpointUrl: "https://testpub.example/mcp/search",
      priceUsdCents: 0.005,
    });
    expect(code).toBe(0);

    const pem = await readFile(join(keysDir, "test-pub-priv.pem"), "utf8");
    const seed = pemToRawEd25519SecretKey(pem);
    expect(seed).toHaveLength(32);
  });

  it("respects --no-keys", async () => {
    const outDir = join(workDir, "public");
    const code = await runInit({
      yes: true,
      outDir,
      keysDir: join(workDir, "keys"),
      noKeys: true,
      slug: "test-pub",
      domain: "testpub.example",
      name: "Test Publisher",
      contact: "ai@testpub.example",
      endpointName: "search",
      endpointUrl: "https://testpub.example/mcp/search",
      priceUsdCents: 0.005,
    });
    expect(code).toBe(0);

    const text = await readFile(
      join(outDir, ".well-known", "context-license.json"),
      "utf8",
    );
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attestation).toBeUndefined();
  });
});
