/**
 * Minimal worked example — build a Context License file from code, sign
 * a per-response attestation envelope, write both to disk.
 *
 * Run:
 *   pnpm tsx examples/minimal-publisher.ts
 *
 * Produces:
 *   ./out/public/.well-known/context-license.json
 *   ./out/keys/example-priv.pem  (mode 0600)
 *   ./out/keys/example-pub.pem
 *   ./out/sample-envelope.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildAndSign,
  defineLicense,
  generateEd25519Keypair,
  serializeLicense,
} from "../src/index.js";

const OUT = "./out";

async function main() {
  // 1. Generate a fresh Ed25519 keypair.
  const keys = await generateEd25519Keypair();

  // 2. Build a Context License from a high-level spec.
  const built = defineLicense({
    publisher: {
      name: "Example Publisher",
      slug: "example",
      domain: "example.com",
      contact: "ai@example.com",
    },
    endpoints: [
      {
        name: "search",
        url: "https://example.com/mcp/search",
        transport: "streamable-http",
        description:
          "Full-text search across Example Publisher's article corpus, returning typed NewsArticle results with citations.",
        schema_org_types: ["NewsArticle"],
      },
    ],
    pricing: {
      model: "per_query",
      currency: "USD",
      unit_price_micros: 5000, // $0.005 per call
      included_free: 1000,
    },
    terms_of_use: "https://example.com/ai-terms",
    attestation: {
      public_key_pem: keys.publicKeyPem,
      kid: "ct_sign_example_2026-05",
      algorithm: "ed25519",
    },
  });

  if (!built.ok) {
    console.error("Build failed:");
    for (const e of built.errors) console.error(`  ${e.path}: ${e.message}`);
    process.exit(1);
  }

  // 3. Write the well-known file.
  await mkdir(join(OUT, "public", ".well-known"), { recursive: true });
  await writeFile(
    join(OUT, "public", ".well-known", "context-license.json"),
    serializeLicense(built.value),
  );

  // 4. Write the keypair (private key mode 0600).
  await mkdir(join(OUT, "keys"), { recursive: true });
  await writeFile(join(OUT, "keys", "example-priv.pem"), keys.secretKeyPem, {
    mode: 0o600,
  });
  await writeFile(join(OUT, "keys", "example-pub.pem"), keys.publicKeyPem);

  // 5. Demonstrate per-response signing.
  const envelope = await buildAndSign(
    {
      kid: "ct_sign_example_2026-05",
      publisher: "example",
      endpoint: "search",
      // In production: SHA-256 hex of the canonical request/response payloads.
      requestHash: "deadbeef".repeat(8),
      responseHash: "cafebabe".repeat(8),
    },
    keys.secretKey,
  );
  await writeFile(
    join(OUT, "sample-envelope.json"),
    JSON.stringify(envelope, null, 2) + "\n",
  );

  console.log("Wrote:");
  console.log("  out/public/.well-known/context-license.json");
  console.log("  out/keys/example-priv.pem  (mode 0600 — keep secret)");
  console.log("  out/keys/example-pub.pem");
  console.log("  out/sample-envelope.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
