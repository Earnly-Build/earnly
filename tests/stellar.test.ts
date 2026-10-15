import { describe, expect, it, vi } from "vitest";
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  STELLAR_NETWORK_PASSPHRASE,
  assertStellarTestnet,
  isValidStellarAddress,
  minimumBalanceXlm,
  normaliseStellarAddress,
  spendableXlm,
} from "@/lib/chain/stellar";

/** Deterministic fixture keypair: no real network key is ever used in tests. */
const TEST_KEYPAIR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

describe("network guard", () => {
  it("uses the SDK's official Testnet passphrase", () => {
    expect(STELLAR_NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
    expect(() => assertStellarTestnet()).not.toThrow();
  });

  it("refuses to operate against a Mainnet Horizon endpoint", async () => {
    vi.resetModules();
    vi.stubEnv("STELLAR_HORIZON_URL", "https://horizon.stellar.org");
    const fresh = await import("@/lib/chain/stellar");
    expect(() => fresh.assertStellarTestnet()).toThrow(/Mainnet/i);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("address validation", () => {
  it("accepts a real Ed25519 public key", () => {
    expect(isValidStellarAddress(TEST_KEYPAIR.publicKey())).toBe(true);
  });

  it("rejects secrets, malformed and empty values", () => {
    expect(isValidStellarAddress(TEST_KEYPAIR.secret())).toBe(false);
    expect(isValidStellarAddress(TEST_KEYPAIR.publicKey().toLowerCase())).toBe(false);
    expect(isValidStellarAddress(TEST_KEYPAIR.publicKey().slice(0, -1))).toBe(false);
    expect(isValidStellarAddress("0x1234")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
    expect(isValidStellarAddress(null)).toBe(false);
    expect(normaliseStellarAddress("  ")).toBeNull();
    expect(normaliseStellarAddress(` ${TEST_KEYPAIR.publicKey()} `)).toBe(TEST_KEYPAIR.publicKey());
  });
});

describe("reserve and spendable maths", () => {
  it("reserves base reserve per ledger entry", () => {
    expect(minimumBalanceXlm(0, 0, 0)).toBe("1"); // 2 base entries × 0.5
    expect(minimumBalanceXlm(1, 0, 0)).toBe("1.5");
    expect(minimumBalanceXlm(3, 2, 0)).toBe("3.5");
    expect(minimumBalanceXlm(0, 0, 1)).toBe("0.5"); // sponsored entry
  });

  it("never reports a negative spendable balance", () => {
    expect(spendableXlm("100", "1", "0.00001")).toBe("98.99999");
    expect(spendableXlm("1", "1", "0.00001")).toBe("0");
    expect(spendableXlm("0.2", "1", "0.00001")).toBe("0");
  });
});

describe("transaction construction", () => {
  const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey();

  function build(networkPassphrase: string) {
    const source = new Account(TEST_KEYPAIR.publicKey(), "1042");
    return new TransactionBuilder(source, { fee: "100", networkPassphrase })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: "1" }))
      .setTimeout(180)
      .build();
  }

  it("is deterministic for the same inputs (hash is stable)", () => {
    const first = build(STELLAR_NETWORK_PASSPHRASE);
    const second = build(STELLAR_NETWORK_PASSPHRASE);
    expect(Buffer.from(first.signatureBase()).equals(Buffer.from(second.signatureBase()))).toBe(true);
  });

  it("signs against the Testnet network id, not Mainnet", () => {
    const testnet = build(STELLAR_NETWORK_PASSPHRASE);
    const mainnet = build(Networks.PUBLIC);
    // Different network passphrases must produce different signature bases; if
    // they were equal, a Testnet transaction could be replayed on Mainnet.
    expect(Buffer.from(testnet.signatureBase()).equals(Buffer.from(mainnet.signatureBase()))).toBe(
      false
    );
  });

  it("carries a fee and a memo only when one is asked for", () => {
    const source = new Account(TEST_KEYPAIR.publicKey(), "1042");
    const plain = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: "1" }))
      .setTimeout(180)
      .build();
    expect(plain.fee).toBe("100");
    expect(plain.memo.type).toBe("none");

    const withMemo = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: "1" }))
      .addMemo(Memo.text("earnly"))
      .setTimeout(180)
      .build();
    expect(withMemo.memo.type).toBe("text");
    expect(Buffer.from(withMemo.memo.value as Buffer).toString("utf8")).toBe("earnly");
  });
});

describe("reconcileStellarTransaction", () => {
  it("leaves a transaction pending on a 404 within the grace window and marks it failed after the grace window", async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    vi.resetModules();
    vi.doMock("@/lib/chain/wallets", async () => {
      const actual = await vi.importActual<typeof import("@/lib/chain/wallets")>(
        "@/lib/chain/wallets"
      );
      return {
        ...actual,
        updateTransaction: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
          return null;
        }),
      };
    });

    const stellar = await import("@/lib/chain/stellar");
    const server = stellar.horizon();
    const notFoundErr = Object.assign(new Error("Not Found"), { response: { status: 404 } });
    const txSpy = vi.spyOn(server, "transactions").mockReturnValue({
      transaction: () => ({
        call: vi.fn().mockRejectedValue(notFoundErr),
      }),
    } as unknown as ReturnType<typeof server.transactions>);

    // 1. 404 right after creation -> stays pending, increments reconcile_attempts
    const recentRecord = {
      id: "tx-recent",
      tx_hash: "a".repeat(64),
      created_at: new Date().toISOString(),
      reconcile_attempts: 0,
    };
    const resolvedRecent = await stellar.reconcileStellarTransaction("user-1", recentRecord);
    expect(resolvedRecent).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      id: "tx-recent",
      patch: { status: "pending", reconcile_attempts: 1 },
    });

    // 2. 404 after the grace window (created_at older than STELLAR_RECONCILE_GRACE_MS) -> transitions to failed
    const expiredRecord = {
      id: "tx-expired",
      tx_hash: "b".repeat(64),
      created_at: new Date(Date.now() - stellar.STELLAR_RECONCILE_GRACE_MS - 1_000).toISOString(),
      reconcile_attempts: 1,
    };
    const resolvedExpired = await stellar.reconcileStellarTransaction("user-1", expiredRecord);
    expect(resolvedExpired).toBe(true);
    expect(updates[1]?.id).toBe("tx-expired");
    expect(updates[1]?.patch.status).toBe("failed");
    expect(updates[1]?.patch.reconcile_attempts).toBe(2);
    expect(String(updates[1]?.patch.error)).toMatch(/grace period/i);

    // 3. 404 after reaching STELLAR_RECONCILE_MAX_ATTEMPTS -> transitions to failed
    const maxAttemptsRecord = {
      id: "tx-max-attempts",
      tx_hash: "c".repeat(64),
      created_at: new Date().toISOString(),
      reconcile_attempts: stellar.STELLAR_RECONCILE_MAX_ATTEMPTS - 1,
    };
    const resolvedMax = await stellar.reconcileStellarTransaction("user-1", maxAttemptsRecord);
    expect(resolvedMax).toBe(true);
    expect(updates[2]?.id).toBe("tx-max-attempts");
    expect(updates[2]?.patch.status).toBe("failed");
    expect(updates[2]?.patch.reconcile_attempts).toBe(stellar.STELLAR_RECONCILE_MAX_ATTEMPTS);

    txSpy.mockRestore();
    vi.doUnmock("@/lib/chain/wallets");
    vi.resetModules();
  });

  it("transitions straight to failed when Horizon returns a transaction with successful: false", async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    vi.resetModules();
    vi.doMock("@/lib/chain/wallets", async () => {
      const actual = await vi.importActual<typeof import("@/lib/chain/wallets")>(
        "@/lib/chain/wallets"
      );
      return {
        ...actual,
        updateTransaction: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
          return null;
        }),
      };
    });

    const stellar = await import("@/lib/chain/stellar");
    const server = stellar.horizon();
    const txSpy = vi.spyOn(server, "transactions").mockReturnValue({
      transaction: () => ({
        call: vi.fn().mockResolvedValue({ successful: false, ledger: 98765 }),
      }),
    } as unknown as ReturnType<typeof server.transactions>);

    const resolved = await stellar.reconcileStellarTransaction("user-1", {
      id: "tx-rejected",
      tx_hash: "d".repeat(64),
      created_at: new Date().toISOString(),
      reconcile_attempts: 0,
    });

    expect(resolved).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe("tx-rejected");
    expect(updates[0]?.patch.status).toBe("failed");
    expect(updates[0]?.patch.ledger).toBe("98765");
    expect(String(updates[0]?.patch.error)).toMatch(/rejected/i);

    txSpy.mockRestore();
    vi.doUnmock("@/lib/chain/wallets");
    vi.resetModules();
  });
});

