# Changelog

All notable changes to `@crawlertoll/publisher` are documented here.

The package follows [Semantic Versioning](https://semver.org/). The
underlying Context License spec is versioned independently — see
[`context-license.org/v0.1`](https://context-license.org/v0.1).

## [0.1.0] — 2026-05-19

Initial public release. Ships alongside the v0.1 draft of the Context
License specification.

### Added

- `crawlertoll init` — interactive scaffolder. Six prompts, sixty seconds
  to a schema-valid `/.well-known/context-license.json` + an Ed25519
  keypair. Non-interactive mode via `--yes` and explicit flags.
- `crawlertoll validate <target>` — validate a local file, a URL, or a
  bare domain. Resolves bare domains to `https://<domain>/.well-known/context-license.json`.
- `crawlertoll keygen` — generate a fresh Ed25519 keypair as PEM
  (PKCS#8 private + SubjectPublicKeyInfo public). Files or stdout.
- `crawlertoll sign` — produce a signed attestation envelope. Two modes:
  hash request/response files automatically, or accept pre-computed
  SHA-256 hashes.
- `crawlertoll verify` — verify a signed envelope against a public key.
  Returns structured exit codes (0 valid, 1 invalid, 2 IO error).
- Programmatic API: `defineLicense()`, `serializeLicense()`,
  `defineEnvelope()`, `signEnvelope()`, `buildAndSign()`,
  `generateEd25519Keypair()`, plus PEM round-trip helpers.
- Re-exports `parse()` / `fetchAndParse()` / `formatErrors()` from
  `@crawlertoll/parser` for embedded validation.
- Full TypeScript types via `dist/index.d.ts`.

### Conformance

- 30/30 vitest tests passing (license building, key generation, PEM
  round-trip, sign↔verify, init end-to-end, validate exit codes).
- Sign↔verify interop with `@crawlertoll/client`'s `verify()`: identical
  canonicalisation (JCS RFC 8785) and domain separator (`"ct_att_v1:"`).
- Ed25519 + WebCrypto random source — works on Node 20+, Bun, Deno, and
  Cloudflare Workers without modification.

### License + governance

- Implementation: Apache-2.0 (patent grant matters).
- Spec it targets: CC0 1.0.
- Donation pathway for the spec: Linux Foundation Agentic AI Foundation,
  targeted months 9–12 post-publication on the OpenAPI/SmartBear timeline.
