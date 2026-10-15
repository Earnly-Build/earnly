import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #5 — EVM recorded the transaction AFTER broadcast: a crash or a
 * recordTransaction failure left moved ETH with no local row. The fix
 * mirrors the Stellar ordering: a pending row exists before any bytes
 * hit the network, and a broadcast failure marks it recoverable.
 *
 * These tests drive sendEvmTransfer with every boundary mocked: the
 * wallets module is a row store we can assert against, and viem's wallet
 * client throws on broadcast.
 */

const ADDRESS = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
const OTHER = "0x000000000000000000000000000000000000dEaD";
const KEY = `0x${"11".repeat(32)}`;

// In-memory row store — recordTransaction inserts, updateTransaction
// patches. This is what we assert against.
interface TestRow {
  id: string; tx_hash: string | null; status: string; amount: string;
  idempotency_key: string | null; explorer_url?: string | null;
  error?: string | null; created_at: string;
}
const rows: TestRow[] = [];

const sendTransaction = vi.fn();
const waitForTransactionReceipt = vi.fn();

vi.mock("@/lib/chain/wallets", () => ({
  ensureWallet: vi.fn(async () => ({
    id: "w1", user_id: "u1", chain: "evm", network: "sepolia",
    provider: "earnly-managed", address: ADDRESS,
    provider_wallet_id: null, status: "active",
    enc_secret: "x", enc_iv: "x", enc_tag: "x", key_version: 1,
    created_at: "t", updated_at: "t", balance_synced_at: null,
  })),
  findByIdempotencyKey: vi.fn(async () => null),
  recordTransaction: vi.fn(async (input: { txHash?: string | null; status: string; amount: string; idempotencyKey?: string | null }) => {
    const row = { id: `tx${rows.length + 1}`, tx_hash: input.txHash ?? null,
      status: input.status, amount: input.amount,
      idempotency_key: input.idempotencyKey ?? null,
      created_at: new Date().toISOString() };
    rows.push(row);
    return row;
  }),
  updateTransaction: vi.fn(async (id: string, patch: Partial<Pick<TestRow, "status" | "tx_hash" | "explorer_url" | "error">>) => {
    const row = rows.find((r) => r.id === id);
    if (row) {
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.tx_hash !== undefined) row.tx_hash = patch.tx_hash;
      if (patch.explorer_url !== undefined) row.explorer_url = patch.explorer_url;
      if (patch.error !== undefined) row.error = patch.error;
    }
    return row ?? null;
  }),
  signingSecret: vi.fn(() => KEY),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: ADDRESS })),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    http: vi.fn(() => ({})),
    createWalletClient: vi.fn(() => ({ sendTransaction })),
    createPublicClient: vi.fn(() => ({
      getChainId: vi.fn(async () => 11155111),
      getBalance: vi.fn(async () => 10n ** 18n),     // 1 ETH — plenty
      getTransactionCount: vi.fn(async () => 1),
      getBlockNumber: vi.fn(async () => 12345n),
      getGasPrice: vi.fn(async () => 1_500_000_000n),
      estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 2_000_000_000n })),
      waitForTransactionReceipt,
    })),
  };
});

import { sendEvmTransfer, EvmError } from "@/lib/chain/evm";

describe("record-before-broadcast ordering", () => {
  beforeEach(() => {
    rows.length = 0;
    sendTransaction.mockReset();
    waitForTransactionReceipt.mockReset();
  });

  it("a broadcast failure still leaves an auditable failed row", async () => {
    // The exact acceptance case: record succeeds, broadcast throws.
    sendTransaction.mockRejectedValue(new Error("no network"));

    await expect(
      sendEvmTransfer({
        userId: "u1", to: OTHER, amount: "0.001",
        idempotencyKey: "idem-1",
      })
    ).rejects.toThrow(EvmError);

    // The row exists and is marked failed — the send is recoverable,
    // not invisible.
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].tx_hash).toBeNull();            // nothing was broadcast
    expect(rows[0].idempotency_key).toBe("idem-1");
  });

  it("writes the pending row before sendTransaction is ever called", async () => {
    const order: string[] = [];
    sendTransaction.mockImplementation(async () => {
      order.push("broadcast");
      return "0xdeadbeef" as unknown as `0x${string}`;
    });
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    const { recordTransaction } = await import("@/lib/chain/wallets");
    (recordTransaction as unknown as { mockImplementation: (fn: (input: { txHash?: string | null; status: string; amount: string; idempotencyKey?: string | null }) => Promise<TestRow>) => void }).mockImplementation(async (input) => {
      order.push("record");
      const row = { id: "tx1", tx_hash: input.txHash ?? null,
        status: input.status, amount: input.amount,
        idempotency_key: input.idempotencyKey ?? null,
        created_at: new Date().toISOString() };
      rows.push(row);
      return row;
    });

    const out = await sendEvmTransfer({
      userId: "u1", to: OTHER, amount: "0.001",
    });
    expect(out.status).toBe("success");
    expect(order[0]).toBe("record");               // record ran first
    expect(order[1]).toBe("broadcast");
    // The row carries the real hash after broadcast.
    expect(rows[0].tx_hash).toBe("0xdeadbeef");
    expect(rows[0].status).toBe("success");
  });
});
