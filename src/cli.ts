#!/usr/bin/env node
/**
 * @crawlertoll/publisher CLI entry point.
 *
 * Subcommands:
 *   init      Interactive scaffolder — generate context-license.json + keys
 *   validate  Validate a local file or a publisher's live well-known URL
 *   keygen    Generate an Ed25519 keypair
 *   sign      Sign an attestation envelope
 *   verify    Verify a signed attestation envelope
 *
 * Examples:
 *   npx @crawlertoll/publisher init
 *   npx @crawlertoll/publisher validate https://matriculix.com/.well-known/context-license.json
 *   npx @crawlertoll/publisher keygen --out-dir ./keys
 *   npx @crawlertoll/publisher sign --key keys/priv.pem --kid 2026-05 \
 *       --publisher matriculix --endpoint isv-calculator \
 *       --request req.json --response resp.json
 *   npx @crawlertoll/publisher verify --envelope env.json --key keys/pub.pem
 */

import { cac } from "cac";

import { runInit } from "./commands/init.js";
import { runKeygen } from "./commands/keygen.js";
import { runSign } from "./commands/sign.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";

const VERSION = "0.1.0";

async function main() {
  const cli = cac("crawlertoll");

  cli
    .command("init", "Interactive scaffolder for /.well-known/context-license.json")
    .option("--out-dir <dir>", "Output directory (default: ./public)")
    .option("--yes", "Skip prompts; use defaults / flag values")
    .option("--name <name>", "Publisher name")
    .option("--slug <slug>", "Publisher slug (lowercase, hyphens)")
    .option("--domain <domain>", "Publisher domain")
    .option("--contact <email>", "Crawler contact email")
    .option("--endpoint-name <name>", "First endpoint name")
    .option("--endpoint-url <url>", "First endpoint URL")
    .option("--price-usd-cents <cents>", "Price per call in USD (e.g. 0.005)")
    .option("--no-keys", "Skip Ed25519 keypair generation")
    .option("--keys-dir <dir>", "Keypair output directory")
    .action(async (opts) => {
      const code = await runInit({
        outDir: opts.outDir,
        yes: opts.yes,
        name: opts.name,
        slug: opts.slug,
        domain: opts.domain,
        contact: opts.contact,
        endpointName: opts.endpointName,
        endpointUrl: opts.endpointUrl,
        priceUsdCents: opts.priceUsdCents !== undefined ? Number(opts.priceUsdCents) : undefined,
        noKeys: opts.keys === false,
        keysDir: opts.keysDir,
      });
      process.exit(code);
    });

  cli
    .command(
      "validate <target>",
      "Validate a local file, a URL, or a bare domain's /.well-known/context-license.json",
    )
    .option("-q, --quiet", "Suppress non-error output (exit code only)")
    .action(async (target: string, opts) => {
      const code = await runValidate(target, { quiet: opts.quiet });
      process.exit(code);
    });

  cli
    .command("keygen", "Generate an Ed25519 keypair (PEM-encoded)")
    .option("--out-dir <dir>", "Output directory (default: ./keys)")
    .option("--stem <name>", "Filename stem (default: ed25519)")
    .option("--stdout", "Print to stdout instead of writing files")
    .action(async (opts) => {
      const code = await runKeygen({
        outDir: opts.outDir,
        stem: opts.stem,
        stdout: opts.stdout,
      });
      process.exit(code);
    });

  cli
    .command("sign", "Sign an attestation envelope")
    .option("--key <path>", "Path to PEM-encoded Ed25519 secret key (required)")
    .option("--kid <kid>", "Key ID (required; matches publisher's attestation.kid)")
    .option("--publisher <slug>", "Publisher slug (required)")
    .option("--endpoint <name>", "Endpoint name (required)")
    .option("--request <path>", "Path to request JSON (will be SHA-256 hashed)")
    .option("--response <path>", "Path to response JSON (will be SHA-256 hashed)")
    .option("--request-hash <hex>", "Pre-computed SHA-256 hex of the request")
    .option("--response-hash <hex>", "Pre-computed SHA-256 hex of the response")
    .option("--ttl-seconds <seconds>", "Envelope validity window in seconds (default 300)")
    .option("--out <path>", "Output path (default: stdout)")
    .action(async (opts) => {
      if (!opts.key || !opts.kid || !opts.publisher || !opts.endpoint) {
        process.stderr.write(
          "Error: --key, --kid, --publisher, and --endpoint are required.\n",
        );
        process.exit(1);
      }
      const code = await runSign({
        key: opts.key,
        kid: opts.kid,
        publisher: opts.publisher,
        endpoint: opts.endpoint,
        request: opts.request,
        response: opts.response,
        requestHash: opts.requestHash,
        responseHash: opts.responseHash,
        ttlSeconds:
          opts.ttlSeconds !== undefined ? Number(opts.ttlSeconds) : undefined,
        out: opts.out,
      });
      process.exit(code);
    });

  cli
    .command("verify", "Verify a signed attestation envelope")
    .option("--envelope <path>", "Path to envelope JSON (required)")
    .option("--key <path>", "Path to PEM-encoded Ed25519 public key (required)")
    .option("--clock-skew-ms <ms>", "Clock-skew tolerance in ms (default 300000 = 5 min)")
    .action(async (opts) => {
      if (!opts.envelope || !opts.key) {
        process.stderr.write("Error: --envelope and --key are required.\n");
        process.exit(1);
      }
      const code = await runVerify({
        envelope: opts.envelope,
        key: opts.key,
        clockSkewMs:
          opts.clockSkewMs !== undefined ? Number(opts.clockSkewMs) : undefined,
      });
      process.exit(code);
    });

  cli.help();
  cli.version(VERSION);

  cli.parse(process.argv, { run: false });
  try {
    await cli.runMatchedCommand();
  } catch (err) {
    process.stderr.write(`\nError: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`\nFatal: ${(err as Error).message}\n`);
  process.exit(1);
});
