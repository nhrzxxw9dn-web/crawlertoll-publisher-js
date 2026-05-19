/**
 * `crawlertoll keygen` — generate a fresh Ed25519 keypair and write it to
 * disk in PEM form. The public key is suitable for pasting into
 * `attestation.public_key_pem`; the private key is suitable for the
 * publisher backend's signer.
 *
 * Exit codes:
 *   0  success
 *   2  filesystem error
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import pc from "picocolors";

import { generateEd25519Keypair } from "../builders/keys.js";
import { fail, header, info, rule, success, warn } from "../util/output.js";

export interface KeygenOptions {
  /** Output directory. Defaults to `./keys`. */
  outDir?: string;
  /** Filename stem. Defaults to `ed25519`. Will produce `<stem>-priv.pem` and `<stem>-pub.pem`. */
  stem?: string;
  /** Print to stdout instead of writing files. */
  stdout?: boolean;
}

export async function runKeygen(opts: KeygenOptions = {}): Promise<number> {
  header("crawlertoll keygen — Ed25519 keypair");

  const keys = await generateEd25519Keypair();

  if (opts.stdout) {
    process.stdout.write(`# Ed25519 secret key (PKCS#8 PEM) — KEEP SECRET\n`);
    process.stdout.write(keys.secretKeyPem + "\n");
    process.stdout.write(`# Ed25519 public key (SubjectPublicKeyInfo PEM) — paste into attestation.public_key_pem\n`);
    process.stdout.write(keys.publicKeyPem);
    return 0;
  }

  const outDir = resolve(opts.outDir ?? "./keys");
  const stem = opts.stem ?? "ed25519";
  const privPath = join(outDir, `${stem}-priv.pem`);
  const pubPath = join(outDir, `${stem}-pub.pem`);

  try {
    await mkdir(dirname(privPath), { recursive: true });
    await writeFile(privPath, keys.secretKeyPem, { encoding: "utf8", mode: 0o600 });
    await writeFile(pubPath, keys.publicKeyPem, "utf8");
  } catch (err) {
    fail(`Filesystem error: ${(err as Error).message}`);
    return 2;
  }

  success(`Wrote ${pc.bold(relative(process.cwd(), privPath))} (mode 0600 — keep secret)`);
  success(`Wrote ${pc.bold(relative(process.cwd(), pubPath))}`);
  rule();
  info(`Paste the contents of ${pc.cyan(relative(process.cwd(), pubPath))} into your`);
  info(`context-license.json's ${pc.cyan("attestation.public_key_pem")} field.`);
  warn(`Move ${stem}-priv.pem out of git-tracked paths before commit.`);
  return 0;
}
