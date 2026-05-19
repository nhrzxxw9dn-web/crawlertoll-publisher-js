/**
 * Tiny CLI-output helpers. Picocolors for color, structured printers for
 * the four common outcomes (header, success, warning, failure). Honors
 * `NO_COLOR=1` automatically via picocolors.
 */

import pc from "picocolors";

export function header(text: string): void {
  process.stdout.write(`\n${pc.bold(pc.cyan(text))}\n`);
}

export function success(text: string): void {
  process.stdout.write(`${pc.green("✓")} ${text}\n`);
}

export function info(text: string): void {
  process.stdout.write(`${pc.dim("·")} ${pc.dim(text)}\n`);
}

export function warn(text: string): void {
  process.stdout.write(`${pc.yellow("!")} ${pc.yellow(text)}\n`);
}

export function fail(text: string): void {
  process.stderr.write(`${pc.red("✗")} ${pc.red(text)}\n`);
}

export function rule(): void {
  process.stdout.write(pc.dim("─".repeat(48)) + "\n");
}

export function code(text: string): string {
  return pc.cyan(text);
}

export function dim(text: string): string {
  return pc.dim(text);
}

/**
 * Format a numeric path-of-totals as `n/m`, color-coded.
 */
export function progress(n: number, total: number): string {
  return pc.dim(`(${n}/${total})`);
}
