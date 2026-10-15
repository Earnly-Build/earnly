/**
 * Exact decimal arithmetic for on-chain amounts.
 *
 * Every amount that can move money is parsed as a decimal string into a BigInt
 * in the chain's atomic unit (stroops for XLM, wei for ETH). Floats are never
 * used, so 0.1 + 0.2 style errors and precision loss cannot reach a signature.
 * No SDK or Node built-ins are imported here, so this module is safe to use
 * from the browser, the server and the unit tests.
 */

export type ParseOk = { ok: true; amount: string; atomic: bigint };
export type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

export interface ParseOptions {
  /** Atomic units per whole coin: 7 decimals for XLM, 18 for ETH. */
  decimals: number;
  /** Ticker used in error messages. */
  symbol: string;
  /** Reject amounts strictly greater than this (in atomic units). */
  maxAtomic?: bigint;
}

const DECIMAL_RE = /^\+?(\d+)(?:\.(\d+))?$/;

/**
 * Validates a user-supplied amount. Rejects empty, malformed, zero, negative,
 * scientific notation, thousands separators and over-precise values.
 */
export function parseDecimalAmount(input: unknown, opts: ParseOptions): ParseResult {
  const { decimals, symbol } = opts;
  if (input === null || input === undefined) {
    return { ok: false, error: `Enter an amount in ${symbol}.` };
  }
  const raw = typeof input === "string" ? input.trim() : String(input).trim();
  if (!raw) return { ok: false, error: `Enter an amount in ${symbol}.` };
  if (raw.startsWith("-")) return { ok: false, error: "The amount must be greater than zero." };
  if (!DECIMAL_RE.test(raw)) {
    return { ok: false, error: `Enter a valid ${symbol} amount, for example 1.5.` };
  }

  const match = DECIMAL_RE.exec(raw)!;
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    return {
      ok: false,
      error: `${symbol} supports at most ${decimals} decimal places.`,
    };
  }
  if (whole.replace(/^0+/, "").length > 30) {
    return { ok: false, error: `That ${symbol} amount is too large.` };
  }

  const atomic = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (atomic <= 0n) return { ok: false, error: "The amount must be greater than zero." };
  if (opts.maxAtomic !== undefined && atomic > opts.maxAtomic) {
    return { ok: false, error: `That ${symbol} amount is too large.` };
  }

  return { ok: true, amount: formatAtomic(atomic, decimals, { trim: true }), atomic };
}

/** Converts an atomic-unit BigInt into a canonical decimal string. */
export function formatAtomic(
  atomic: bigint,
  decimals: number,
  opts: { trim?: boolean } = {}
): string {
  const negative = atomic < 0n;
  const abs = negative ? -atomic : atomic;
  const padded = abs.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  let fraction = decimals ? padded.slice(padded.length - decimals) : "";
  if (opts.trim) fraction = fraction.replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${text}` : text;
}

/** Parses a decimal string into atomic units without the user-input checks. */
export function toAtomic(amount: string | number, decimals: number): bigint {
  const raw = typeof amount === "string" ? amount.trim() : String(amount);
  const match = DECIMAL_RE.exec(raw);
  // Never convert through a float: String(1e-7) is "1e-7", String(1e21)
  // is "1e+21" — neither parses as a decimal literal, and multiplying by
  // 10**decimals reintroduces exactly the precision loss this module
  // exists to remove. A non-literal input is a caller bug — refuse loudly.
  if (!match) {
    throw new Error(
      `toAtomic: "${raw}" is not a decimal literal — pass an exact ` +
      `string/number (scientific notation and malformed input are rejected).`
    );
  }
  const whole = match[1];
  const fraction = (match[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole + fraction);
}

/** Trims a decimal string for display without changing its value. */
export function shortAmount(value: string, decimals = 7): string {
  const [whole, fraction = ""] = value.split(".");
  const kept = fraction.slice(0, decimals).replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
}
