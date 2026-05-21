# @crawlertoll/publisher

Publisher SDK + CLI for the **Context License** standard
(`/.well-known/context-license.json`). One command from "I have an API" to
"my publisher is discoverable by AI agents under the open license spec".

- **Spec**: [context-license.org/v0.1](https://context-license.org/v0.1) (CC0 1.0)
- **License**: Apache-2.0 (this implementation). The spec itself is CC0.
- **Companion packages**:
  [`@crawlertoll/parser`](https://www.npmjs.com/package/@crawlertoll/parser) (validator),
  [`@crawlertoll/client`](https://www.npmjs.com/package/@crawlertoll/client) (buyer SDK)

> **Status**: v0.1. CLI shipped, programmatic API stable for v1.x schema.
> The Context License spec is open for public RFC through **2026-07-15** —
> v0.2 of the spec will ship the resolution of three open issues
> (pricing-model vocabulary, license-terms vocabulary, provenance schema).

[![npm](https://img.shields.io/npm/v/%40crawlertoll%2Fpublisher.svg)](https://www.npmjs.com/package/@crawlertoll/publisher)
[![license](https://img.shields.io/npm/l/%40crawlertoll%2Fpublisher.svg)](./LICENSE)

---

## Sixty seconds, one command

```bash
npx @crawlertoll/publisher init
```

You'll be asked six things — publisher name, domain, slug, contact email,
first endpoint, and pricing. The CLI writes:

- `public/.well-known/context-license.json` — schema-valid, ready to deploy
- `keys/<slug>-priv.pem` — your Ed25519 signing key (mode 0600)
- `keys/<slug>-pub.pem` — the matching public key (already embedded in the JSON)

Then deploy the well-known file at
`https://your-domain/.well-known/context-license.json` with
`Content-Type: application/json` and `Access-Control-Allow-Origin: *`.
You're now a Context License publisher.

---

## Install

```bash
# As a CLI (npx is enough; install global if you'll use it often)
npm install -g @crawlertoll/publisher

# As a programmatic dependency
npm install @crawlertoll/publisher
```

Requires **Node 20+** (Web Crypto must be globally available — Node 18 is EOL).

---

## Commands

### `crawlertoll init`

Interactive scaffolder. Walks through six prompts and produces a
schema-valid `/.well-known/context-license.json` plus an Ed25519 keypair.

```bash
npx @crawlertoll/publisher init
```

Non-interactive — useful for scripts, CI, and the
[execution checklist](https://github.com/charthouse-ltd/context-license-spec#adopters):

```bash
npx @crawlertoll/publisher init --yes \
  --name "Acme News" \
  --slug acme-news \
  --domain acme.example \
  --contact ai@acme.example \
  --endpoint-name search \
  --endpoint-url https://acme.example/mcp/search \
  --price-usd-cents 0.005 \
  --out-dir ./public \
  --keys-dir ./keys
```

### `crawlertoll validate <target>`

Validate a local file, a URL, or a bare domain.

```bash
# Local file
crawlertoll validate ./public/.well-known/context-license.json

# Bare domain — auto-resolves to /.well-known/context-license.json
crawlertoll validate matriculix.com

# Explicit URL
crawlertoll validate https://medxcare.me/.well-known/context-license.json
```

Exit codes: `0` valid, `1` invalid (schema errors on stderr), `2` could not fetch/read.

### `crawlertoll keygen`

Standalone Ed25519 keypair generation. Useful when bringing your own
keys or rotating.

```bash
crawlertoll keygen --out-dir ./keys --stem prod
# writes keys/prod-priv.pem (0600) and keys/prod-pub.pem

crawlertoll keygen --stdout  # print to stdout instead of writing files
```

### `crawlertoll sign`

Produce a signed attestation envelope. The envelope is the per-response
provenance signal the buyer SDK's `verify()` checks.

```bash
crawlertoll sign \
  --key keys/acme-news-priv.pem \
  --kid ct_sign_acme-news_2026-05 \
  --publisher acme-news \
  --endpoint search \
  --request req.json \
  --response resp.json \
  --out envelope.json

# Or, if you already have SHA-256 hex hashes:
crawlertoll sign \
  --key keys/acme-news-priv.pem \
  --kid ct_sign_acme-news_2026-05 \
  --publisher acme-news --endpoint search \
  --request-hash 148f0e... --response-hash fdff36... \
  > envelope.json
```

### `crawlertoll verify`

Verify a signed envelope against a public key.

```bash
crawlertoll verify --envelope envelope.json --key keys/acme-news-pub.pem
```

Exit codes: `0` valid, `1` invalid (reason on stderr), `2` file/key error.

---

## Programmatic API

Same primitives as the CLI, exposed for embedding.

### Build a license file from code

```ts
import {
  defineLicense,
  serializeLicense,
  generateEd25519Keypair,
} from "@crawlertoll/publisher";
import { writeFile, mkdir } from "node:fs/promises";

const keys = await generateEd25519Keypair();

const result = defineLicense({
  publisher: {
    name: "Acme News",
    slug: "acme-news",
    domain: "acme.example",
    contact: "ai@acme.example",
  },
  endpoints: [{
    name: "search",
    url: "https://acme.example/mcp/search",
    transport: "streamable-http",
    description: "Full-text search across Acme's article corpus.",
    schema_org_types: ["NewsArticle"],
  }],
  pricing: { model: "per_query", currency: "USD", unit_price_micros: 5000 },
  terms_of_use: "https://acme.example/ai-terms",
  attestation: {
    public_key_pem: keys.publicKeyPem,
    kid: "ct_sign_acme-news_2026-05",
    algorithm: "ed25519",
  },
});

if (!result.ok) {
  for (const e of result.errors) console.error(e.path, e.message);
  process.exit(1);
}

await mkdir("public/.well-known", { recursive: true });
await writeFile(
  "public/.well-known/context-license.json",
  serializeLicense(result.value),
);

// Store keys.secretKeyPem somewhere safe — secret store, env var, KMS.
```

`defineLicense()` fills in sensible v1 defaults (`$schema`, `version`, `auth.schemes`,
`quality_signals.last_updated`, etc.) and validates the result against the
canonical JSON Schema before returning. Required fields you must provide:
`publisher`, `endpoints`, `pricing`, `terms_of_use`.

### Sign attestation envelopes

```ts
import { buildAndSign, pemToRawEd25519SecretKey } from "@crawlertoll/publisher";
import { readFile } from "node:fs/promises";

const secretKey = pemToRawEd25519SecretKey(
  await readFile("keys/acme-news-priv.pem", "utf8"),
);

const envelope = await buildAndSign({
  kid: "ct_sign_acme-news_2026-05",
  publisher: "acme-news",
  endpoint: "search",
  requestHash: "148f0e9b178ff35f30dcf4555498ce82f636fc83648b168dd81a44d6d5bb4cd2",
  responseHash: "fdff36eb183b05bbd1df9009aeab6e2cf4e6722af4dc5016c57576da7ef8157d",
}, secretKey);

// Return `envelope` alongside the response payload. Buyer SDK's verify()
// will accept it.
```

The signing scheme is **Ed25519 over the JCS-canonical envelope minus its
`signature` field, domain-separated by `"ct_att_v1:"`**. Identical to
[`@crawlertoll/client`'s `verify()`](https://www.npmjs.com/package/@crawlertoll/client)
— envelopes signed here verify there and vice-versa.

### Validate, in-process

```ts
import { parse, fetchAndParse } from "@crawlertoll/publisher";

const result = parse(await readFile("./context-license.json", "utf8"));
const live = await fetchAndParse("https://matriculix.com/.well-known/context-license.json");
```

Re-exported verbatim from `@crawlertoll/parser`. Same types, same errors.

---

## What this SDK does NOT do (yet)

- **Host your MCP server.** That's an MCP-server library's job. This SDK
  emits the metadata file that *points* at the MCP server.
- **Manage publisher onboarding to the Charthouse marketplace.** Listing
  is opt-in via [crawlertoll.com/list](https://crawlertoll.com/list) once
  the marketplace MVP is live (week-12 milestone).
- **Talk to your payment processor.** The metadata declares which payment
  rails you support (`x402`, `api_key`, etc.); your backend handles the
  actual transaction.

---

## Conformance

Every release passes a 30-test vitest suite covering:

- `defineLicense()` produces schema-valid output from a minimal spec, with
  defaults applied
- Schema-invalid input surfaces as structured `ValidationError[]`
- Ed25519 keypair generation produces interoperable PEM
- Sign↔verify roundtrips work, tamper detection works, wrong-key fails
- `init --yes` produces a deployable file end-to-end
- `validate` returns the correct exit codes for valid / invalid / missing

Run yourself:

```bash
git clone https://github.com/charthouse-ltd/crawlertoll-publisher-js
cd crawlertoll-publisher-js
npm install
npm test
```

---

## Project links

- **Spec**: [context-license.org/v0.1](https://context-license.org/v0.1)
- **Spec repo**: [github.com/charthouse-ltd/context-license-spec](https://github.com/charthouse-ltd/context-license-spec)
- **Manifesto**: [github.com/charthouse-ltd/crawlertoll/blob/main/MANIFESTO.md](https://github.com/charthouse-ltd/crawlertoll/blob/main/MANIFESTO.md)
- **Marketplace**: [crawlertoll.com](https://crawlertoll.com)

## License

[Apache-2.0](./LICENSE). The Context License spec itself is
[CC0 1.0](https://context-license.org/v0.1) — fork the spec freely.

## Trademark

CrawlerToll™ is a trademark of Charthouse Ltd.
