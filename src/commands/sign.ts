/**
 * `crawlertoll sign` — produce a signed attestation envelope.
 *
 * Two operating modes:
 *
 *   1. With --request <path> and --response <path>:
 *      Reads the request and response JSON files, hashes them (SHA-256
 *      over the JCS-canonical form), and produces a fully-signed envelope.
 *      This is the typical "publisher backend signs a per-call envelope"
 *      mode.
 *
 *   2. With --request-hash <hex> and --response-hash <hex>:
 *      Skip hashing; sign an envelope whose request/response hashes the
 *      caller already computed. Useful for stream-of-bytes payloads not
 *      represented as JSON files.
 *
 * The signed envelope is printed to stdout (or written to --out <path>)
 * as pretty-printed JSON. It will verify against the corresponding
 * public key via `@crawlertoll/client`'s `verify()`.
 */

import { readFile, writeFile } from "node:fs/promises";

import canonicalize from "canonicalize";

import { buildAndSign } from "../builders/envelope.js";
import { pemToRawEd25519SecretKey } from "../builders/keys.js";
import { sha256Hex } from "../util/sha256.js";
import { fail, info, success } from "../util/output.js";

export interface SignOptions {
  /** Path to PEM-encoded Ed25519 secret key. */
  key: string;
  /** Key ID (matches `attestation.kid` in publisher license file). */
  kid: string;
  /** Publisher slug. */
  publisher: string;
  /** Endpoint name. */
  endpoint: string;
  /** Path to request JSON (will be hashed). Either this + --response, or both --*-hash flags. */
  request?: string;
  /** Path to response JSON. */
  response?: string;
  /** Pre-computed request hash (SHA-256 hex). */
  requestHash?: string;
  /** Pre-computed response hash (SHA-256 hex). */
  responseHash?: string;
  /** TTL for the envelope in seconds. Default 300 (5 min) — matches buyer SDK's clock-skew tolerance. */
  ttlSeconds?: number;
  /** Output path. If omitted, prints to stdout. */
  out?: string;
}

export async function runSign(opts: SignOptions): Promise<number> {
  let secretKey: Uint8Array;
  try {
    const pem = await readFile(opts.key, "utf8");
    secretKey = pemToRawEd25519SecretKey(pem);
  } catch (err) {
    fail(`Could not load secret key: ${(err as Error).message}`);
    return 2;
  }

  // ─── Compute hashes if files were given ─────────────────────────
  let requestHash = opts.requestHash;
  let responseHash = opts.responseHash;

  if (!requestHash) {
    if (!opts.request) {
      fail("Either --request <path> or --request-hash <hex> is required.");
      return 1;
    }
    try {
      requestHash = await hashJsonFile(opts.request);
    } catch (err) {
      fail(`Could not hash request: ${(err as Error).message}`);
      return 2;
    }
  }
  if (!responseHash) {
    if (!opts.response) {
      fail("Either --response <path> or --response-hash <hex> is required.");
      return 1;
    }
    try {
      responseHash = await hashJsonFile(opts.response);
    } catch (err) {
      fail(`Could not hash response: ${(err as Error).message}`);
      return 2;
    }
  }

  const now = new Date();
  const ttl = (opts.ttlSeconds ?? 300) * 1000;
  const envelope = await buildAndSign(
    {
      kid: opts.kid,
      publisher: opts.publisher,
      endpoint: opts.endpoint,
      requestHash,
      responseHash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
    },
    secretKey,
  );

  const out = JSON.stringify(envelope, null, 2) + "\n";

  if (opts.out) {
    try {
      await writeFile(opts.out, out, "utf8");
    } catch (err) {
      fail(`Could not write envelope: ${(err as Error).message}`);
      return 2;
    }
    success(`Signed envelope written to ${opts.out}`);
    info(`Verify with: crawlertoll verify --envelope ${opts.out} --key <pub.pem>`);
  } else {
    process.stdout.write(out);
  }
  return 0;
}

async function hashJsonFile(path: string): Promise<string> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  const canonical = canonicalize(parsed);
  if (typeof canonical !== "string") {
    throw new Error("canonicalize() did not return a string");
  }
  return sha256Hex(canonical);
}
