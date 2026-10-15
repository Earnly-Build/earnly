import { describe, expect, it } from "vitest";
import { formatAtomic, parseDecimalAmount, shortAmount, toAtomic } from "@/lib/chain/decimal";

const XLM = { decimals: 7, symbol: "XLM" };
const ETH = { decimals: 18, symbol: "ETH" };

describe("parseDecimalAmount", () => {
  it("accepts whole and fractional amounts", () => {
    expect(parseDecimalAmount("1", XLM)).toEqual({ ok: true, amount: "1", atomic: 10_000_000n });
    expect(parseDecimalAmount("1.5", XLM)).toEqual({ ok: true, amount: "1.5", atomic: 15_000_000n });
    expect(parseDecimalAmount(" 2.0000001 ", XLM)).toEqual({
      ok: true,
      amount: "2.0000001",
      atomic: 20_000_001n,
    });
    expect(parseDecimalAmount(1.5, XLM).ok).toBe(true);
  });

  it("rejects the values that must never reach a signature", () => {
    for (const bad of ["", " ", "0", "0.0", "-1", "-0.5", "abc", "1,000", "1e3", "1.2.3", ".5", "1."]) {
      expect(parseDecimalAmount(bad, XLM).ok, `expected ${JSON.stringify(bad)} to be rejected`).toBe(
        false
      );
    }
  });

  it("enforces per-chain precision", () => {
    expect(parseDecimalAmount("1.12345678", XLM).ok).toBe(false); // 8 dp on a 7 dp chain
    expect(parseDecimalAmount("1.1234567", XLM).ok).toBe(true);
    expect(parseDecimalAmount("1.0000000000000000001", ETH).ok).toBe(false);
    expect(parseDecimalAmount("1.000000000000000001", ETH).ok).toBe(true);
  });

  it("carries no floating point error at the edges of the mantissa", () => {
    const parsed = parseDecimalAmount("0.1", ETH);
    expect(parsed).toEqual({ ok: true, amount: "0.1", atomic: 100_000_000_000_000_000n });
    expect(parseDecimalAmount("9007199254740993", XLM)).toEqual({
      ok: true,
      amount: "9007199254740993",
      atomic: 90_071_992_547_409_930_000_000n,
    });
  });

  it("rejects amounts above an explicit ceiling", () => {
    expect(parseDecimalAmount("1001", { ...XLM, maxAtomic: toAtomic("1000", 7) }).ok).toBe(false);
    expect(parseDecimalAmount("999", { ...XLM, maxAtomic: toAtomic("1000", 7) }).ok).toBe(true);
  });
});

describe("formatAtomic", () => {
  it("round trips without losing precision", () => {
    expect(formatAtomic(15_000_000n, 7, { trim: true })).toBe("1.5");
    expect(formatAtomic(1n, 7, { trim: true })).toBe("0.0000001");
    expect(formatAtomic(0n, 7, { trim: true })).toBe("0");
    expect(formatAtomic(-15_000_000n, 7, { trim: true })).toBe("-1.5");
  });

  it("pads when trim is off", () => {
    expect(formatAtomic(15_000_000n, 7)).toBe("1.5000000");
  });

  it("shortAmount is display-only", () => {
    expect(shortAmount("1.23456789", 4)).toBe("1.2345");
    expect(shortAmount("1.000000", 4)).toBe("1");
  });
});

describe("toAtomic — no float path (issue #13)", () => {
  it("exact for valid inputs, unchanged", () => {
    expect(toAtomic("0.1", 7)).toBe(1000000n);
    expect(toAtomic("1.5", 18)).toBe(1500000000000000000n);
    expect(toAtomic(42, 7)).toBe(420000000n);
  });

  it("rejects scientific notation instead of float-converting", () => {
    // String(1e-7) = "1e-7" — the old path computed Math.round(1e-7*1e7)=1n,
    // silently inventing a stroop. Now it refuses.
    expect(() => toAtomic(1e-7, 7)).toThrow(/decimal literal/);
    expect(() => toAtomic(1e21, 18)).toThrow(/decimal literal/);
    expect(() => toAtomic("abc", 7)).toThrow();
    expect(() => toAtomic(Number.NaN, 7)).toThrow();
  });

  it("a number beyond 2^53 still parses exactly as a string", () => {
    // 9007199254740993 as a NUMBER loses precision before we see it — the
    // string form is the contract; the literal keeps every digit.
    expect(toAtomic("9007199254740993", 0)).toBe(9007199254740993n);
  });
});
