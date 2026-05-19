/**
 * `crawlertoll init` — interactive scaffolder.
 *
 * Walks the publisher through six questions, generates an Ed25519
 * keypair, writes a schema-valid `context-license.json` to the chosen
 * output path, and produces a short next-steps README. Total time on a
 * cold prompt: ~60 seconds.
 *
 * Non-interactive mode: pass --yes plus any of --name --slug --domain
 * --contact --endpoint-url --price-usd-cents and the prompt is skipped
 * with defaults. Useful for scripted demos and CI.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { input, select, confirm } from "@inquirer/prompts";
import pc from "picocolors";

import { defineLicense, serializeLicense } from "../builders/license.js";
import { generateEd25519Keypair } from "../builders/keys.js";
import type { LicenseSpec, Pricing, Publisher } from "../types.js";
import { fail, header, info, rule, success, warn } from "../util/output.js";

export interface InitOptions {
  /** Output directory for the .well-known/ tree. Defaults to `./public`. */
  outDir?: string;
  /** Skip interactive prompts where flags are sufficient. */
  yes?: boolean;
  /** Override-able from CLI. */
  name?: string;
  slug?: string;
  domain?: string;
  contact?: string;
  endpointUrl?: string;
  endpointName?: string;
  /** Price in USD cents (e.g. 0.5 means half a cent, 5 means 5¢). */
  priceUsdCents?: number;
  /** Skip Ed25519 keypair generation (caller will inject keys later). */
  noKeys?: boolean;
  /** Override the keypair directory. Defaults to `<outDir>/../keys/`. */
  keysDir?: string;
}

const MAGIC_VERSION = "1.0.0";

export async function runInit(opts: InitOptions = {}): Promise<number> {
  header("crawlertoll init — scaffold /.well-known/context-license.json");
  info("Public RFC through 2026-07-15. Spec: https://context-license.org/v0.1");
  rule();

  const interactive = !opts.yes;

  // ─── 1. Publisher metadata ─────────────────────────────────────
  const name =
    opts.name ??
    (interactive
      ? await input({
          message: "Publisher name (e.g. 'Acme News')",
          validate: (v) => v.trim().length > 0 || "required",
        })
      : "Example Publisher");

  const domain =
    opts.domain ??
    (interactive
      ? await input({
          message: "Publisher domain (e.g. 'acme.example')",
          validate: (v) =>
            /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.trim()) || "must look like a hostname",
        })
      : "example.com");

  const slug =
    opts.slug ??
    (interactive
      ? await input({
          message: "Publisher slug (lowercase, used in URLs)",
          default: defaultSlug(name, domain),
          validate: (v) =>
            /^[a-z0-9-]{2,40}$/.test(v.trim()) ||
            "2–40 chars, lowercase letters / digits / hyphens",
        })
      : defaultSlug(name, domain));

  const contact =
    opts.contact ??
    (interactive
      ? await input({
          message: "Crawler contact email",
          default: `crawlers@${domain}`,
          validate: (v) => /.+@.+\..+/.test(v.trim()) || "must be an email",
        })
      : `crawlers@${domain}`);

  // ─── 2. First endpoint ─────────────────────────────────────────
  info(
    "We'll set up your first MCP endpoint. You can add more later by editing the file.",
  );
  const endpointName =
    opts.endpointName ??
    (interactive
      ? await input({
          message: "Endpoint name (e.g. 'search-articles')",
          default: "search",
          validate: (v) =>
            /^[a-z0-9-]{2,40}$/.test(v.trim()) || "2–40 chars, lowercase + hyphens",
        })
      : "search");
  const endpointUrl =
    opts.endpointUrl ??
    (interactive
      ? await input({
          message: "Endpoint URL (must be an MCP server URL or compatible)",
          default: `https://${domain}/mcp/${endpointName}`,
          validate: (v) =>
            /^https?:\/\//.test(v.trim()) || "must be an http(s) URL",
        })
      : `https://${domain}/mcp/${endpointName}`);

  // ─── 3. Pricing ────────────────────────────────────────────────
  const pricingModel =
    interactive && !opts.priceUsdCents
      ? await select<Pricing["model"]>({
          message: "Pricing model",
          choices: [
            { name: "per_query (charge per MCP call)", value: "per_query" },
            { name: "per_token (charge per output token)", value: "per_token" },
            { name: "per_tool_call (charge per tool invocation)", value: "per_tool_call" },
            { name: "freemium (free tier + paid above quota)", value: "freemium" },
          ],
          default: "per_query",
        })
      : ("per_query" as Pricing["model"]);

  const priceCents =
    opts.priceUsdCents ??
    (interactive
      ? Number(
          await input({
            message: "Price per call (in US dollars, e.g. '0.005' for half a cent)",
            default: "0.005",
            validate: (v) => Number.isFinite(Number(v)) || "must be a number",
          }),
        )
      : 0.005);
  const priceMicros = Math.round(priceCents * 1_000_000);

  // ─── 4. Terms of use ───────────────────────────────────────────
  const terms =
    interactive
      ? await input({
          message: "Terms-of-use URL (your AI/crawler terms page)",
          default: `https://${domain}/ai-terms`,
          validate: (v) => /^https?:\/\//.test(v.trim()) || "must be an http(s) URL",
        })
      : `https://${domain}/ai-terms`;

  // ─── 5. Attestation keys ──────────────────────────────────────
  const wantKeys =
    opts.noKeys
      ? false
      : interactive
        ? await confirm({
            message:
              "Generate an Ed25519 attestation keypair? (you can also bring your own later)",
            default: true,
          })
        : true;

  let attestation: LicenseSpec["attestation"] | undefined;
  let keys: Awaited<ReturnType<typeof generateEd25519Keypair>> | null = null;
  if (wantKeys) {
    keys = await generateEd25519Keypair();
    const kid = `ct_sign_${slug}_${yyyymm()}`;
    attestation = {
      public_key_pem: keys.publicKeyPem,
      kid,
      algorithm: "ed25519",
    };
  }

  // ─── 6. Build, validate, write ─────────────────────────────────
  const publisher: Publisher = {
    name,
    slug,
    domain,
    contact,
  };

  const spec: LicenseSpec = {
    version: MAGIC_VERSION,
    publisher,
    endpoints: [
      {
        name: endpointName,
        url: endpointUrl,
        transport: "streamable-http",
        description: `${name} — ${endpointName} endpoint. Add a richer description and schema_org_types before going public.`,
      },
    ],
    pricing: {
      model: pricingModel,
      currency: "USD",
      unit_price_micros: priceMicros,
      ...(pricingModel === "freemium" ? { included_free: 1000 } : {}),
    },
    auth: { schemes: ["anonymous", "api_key", "x402"] },
    terms_of_use: terms,
    quality_signals: {
      uptime_sla_pct: 99.0,
      freshness_target_seconds: 86_400,
      last_updated: new Date().toISOString(),
    },
    ...(attestation ? { attestation } : {}),
  };

  const built = defineLicense(spec);
  if (!built.ok) {
    fail("Generated license failed schema validation. This is a bug — please file an issue.");
    for (const e of built.errors) fail(`  ${e.path}: ${e.message} (${e.keyword})`);
    return 2;
  }

  const outDir = resolve(opts.outDir ?? "./public");
  const outPath = join(outDir, ".well-known", "context-license.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, serializeLicense(built.value), "utf8");

  // Write keys to a sibling directory if we generated them.
  let keysDir: string | null = null;
  if (keys) {
    keysDir = resolve(opts.keysDir ?? join(outDir, "..", "keys"));
    await mkdir(keysDir, { recursive: true });
    await writeFile(
      join(keysDir, `${slug}-priv.pem`),
      keys.secretKeyPem,
      { encoding: "utf8", mode: 0o600 },
    );
    await writeFile(
      join(keysDir, `${slug}-pub.pem`),
      keys.publicKeyPem,
      "utf8",
    );
  }

  rule();
  success(`Wrote ${pc.bold(relative(process.cwd(), outPath))}`);
  if (keys && keysDir) {
    success(`Wrote keypair to ${pc.bold(relative(process.cwd(), keysDir))}/`);
    warn(
      `Move ${slug}-priv.pem out of your repo before commit. Add ${pc.bold("keys/*.pem")} to .gitignore.`,
    );
  }
  rule();
  process.stdout.write(`
${pc.bold("Next steps:")}

  1. Open ${pc.cyan(relative(process.cwd(), outPath))} and fill in:
     - A richer ${pc.cyan("endpoints[0].description")}
     - ${pc.cyan("endpoints[0].schema_org_types")} (e.g. ["NewsArticle"])
     - Your real ${pc.cyan("terms_of_use")} URL once that page exists

  2. Serve the file at:
     ${pc.cyan(`https://${domain}/.well-known/context-license.json`)}
     with ${pc.cyan("Content-Type: application/json")} and ${pc.cyan("Access-Control-Allow-Origin: *")}

  3. Validate the deployed file (after upload):
     ${pc.cyan(`npx @crawlertoll/publisher validate https://${domain}/.well-known/context-license.json`)}

  4. (If you generated keys) Load the private key into your backend signer:
     ${pc.cyan(`export PUBLISHER_ED25519_PRIV="$(cat keys/${slug}-priv.pem)"`)}

  5. List your publisher on the Charthouse marketplace:
     ${pc.cyan("https://crawlertoll.com/list")}

Spec: ${pc.cyan("https://context-license.org/v0.1")}
Comment period: through ${pc.bold("2026-07-15")}
`);

  return 0;
}

function defaultSlug(name: string, domain: string): string {
  const slugFromDomain = domain
    .split(".")
    .slice(0, -1)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (slugFromDomain.length >= 2 && slugFromDomain.length <= 40) {
    return slugFromDomain;
  }
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function yyyymm(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
