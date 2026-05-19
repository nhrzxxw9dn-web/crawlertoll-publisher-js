/**
 * `crawlertoll validate <target>` — validate a context-license.json file
 * or a publisher's live `/.well-known/context-license.json`.
 *
 * Target forms:
 *   - Local file: `./path/to/context-license.json`
 *   - HTTP URL:   `https://example.com/.well-known/context-license.json`
 *   - Bare domain: `example.com` — resolves to
 *                  `https://example.com/.well-known/context-license.json`
 *
 * Exit codes:
 *   0  valid
 *   1  invalid (schema errors printed to stderr)
 *   2  could not fetch / read target (network / file error)
 */

import { readFile } from "node:fs/promises";

import { fetchAndParse, formatErrors, parse } from "@crawlertoll/parser";

import { fail, header, info, success } from "../util/output.js";

export interface ValidateOptions {
  /** Suppress non-error output. */
  quiet?: boolean;
}

export async function runValidate(
  target: string,
  opts: ValidateOptions = {},
): Promise<number> {
  if (!opts.quiet) {
    header(`crawlertoll validate ${target}`);
  }

  let result;
  if (/^https?:\/\//.test(target)) {
    if (!opts.quiet) info(`Fetching ${target}…`);
    try {
      result = await fetchAndParse(target);
    } catch (err) {
      fail(`Could not fetch: ${(err as Error).message}`);
      return 2;
    }
  } else if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target) && !target.startsWith(".")) {
    const url = `https://${target}/.well-known/context-license.json`;
    if (!opts.quiet) info(`Fetching ${url}…`);
    try {
      result = await fetchAndParse(url);
    } catch (err) {
      fail(`Could not fetch: ${(err as Error).message}`);
      return 2;
    }
  } else {
    let text;
    try {
      text = await readFile(target, "utf8");
    } catch (err) {
      fail(`Could not read file: ${(err as Error).message}`);
      return 2;
    }
    result = parse(text);
  }

  if (result.ok) {
    if (!opts.quiet) {
      success(`Schema-valid: ${result.value.publisher.name} (${result.value.publisher.slug})`);
      info(`  ${result.value.endpoints.length} endpoint(s), pricing ${result.value.pricing.model} @ ${result.value.pricing.unit_price_micros} micros ${result.value.pricing.currency}`);
      if (result.value.attestation) {
        info(`  Attestation key present (kid: ${result.value.attestation.kid})`);
      } else {
        info(`  No attestation declared — buyers cannot verify provenance.`);
      }
    }
    return 0;
  }

  fail(`Invalid:`);
  process.stderr.write(formatErrors(result.errors) + "\n");
  return 1;
}
