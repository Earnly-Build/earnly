import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EVM, explorerTxUrl } from "./config";
import { parseDecimalAmount } from "./decimal";
import {
  ensureWallet,
  findByIdempotencyKey,
  recordTransaction,
  signingSecret,
  updateTransaction,
  type WalletRow,
} from "./wallets";

/**
 * Ethereum Sepolia service. One place that knows the chain id, the RPC endpoint
 * and how a native transfer is built, signed and confirmed, so nothing else in
 * the application touches an EVM key or an RPC URL.
 */

/** Our own chain definition, pinned to Sepolia so no viem default can drift. */
export const sepolia = defineChain({
  id: EVM.chainId,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [EVM.rpcUrl] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  testnet: true,
});

let publicClientCache: PublicClient | null = null;

export function sepoliaClient(): PublicClient {
  if (!publicClientCache) {
    publicClientCache = createPublicClient({ chain: sepolia, transport: http(EVM.rpcUrl) });
  }
  return publicClientCache;
}

export function isValidEvmAddress(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value.trim());
}

export function normaliseEvmAddress(value: unknown): Address | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isAddress(trimmed) ? (trimmed as Address) : null;
}

export function shortenAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export type EvmErrorCode =
  | "rpc_unavailable"
  | "invalid_destination"
  | "invalid_amount"
  | "insufficient_balance"
  | "signing_unavailable"
  | "wrong_network"
  | "submit_failed"
  | "underpriced";

export class EvmError extends Error {
  code: EvmErrorCode;
  retryable: boolean;
  constructor(code: EvmErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "EvmError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Confirms the RPC really is Sepolia before anything is signed. */
export async function assertSepolia(): Promise<void> {
  let chainId: number;
  try {
    chainId = await sepoliaClient().getChainId();
  } catch {
    throw new EvmError("rpc_unavailable", "Could not reach the Sepolia RPC endpoint.", true);
  }
  if (chainId !== EVM.chainId) {
    throw new EvmError(
      "wrong_network",
      `Refusing to sign: the RPC is chain ${chainId}, not Sepolia (${EVM.chainId}).`,
      false
    );
  }
}

export interface EvmSnapshot {
  address: string;
  balanceWei: string;
  balanceEth: string;
  nonce: number;
  blockNumber: string;
  gasPriceWei: string | null;
  /** Balance minus a conservative gas buffer, in wei. */
  spendableWei: string;
  /** The same figure in ETH, for display. */
  spendableEth: string;
}

export async function evmSnapshot(address: string): Promise<EvmSnapshot> {
  const account = normaliseEvmAddress(address);
  if (!account) throw new EvmError("invalid_destination", "That is not a valid Ethereum address.");
  const client = sepoliaClient();
  try {
    const [balance, nonce, blockNumber, gasPrice] = await Promise.all([
      client.getBalance({ address: account }),
      client.getTransactionCount({ address: account }),
      client.getBlockNumber(),
      client.getGasPrice().catch(() => null),
    ]);
    // 21 000 gas for a native transfer, doubled as a safety margin.
    const buffer = gasPrice ? gasPrice * 21_000n * 2n : 0n;
    const spendable = balance - buffer;
    return {
      address: account,
      balanceWei: balance.toString(),
      balanceEth: formatEther(balance),
      nonce,
      blockNumber: blockNumber.toString(),
      gasPriceWei: gasPrice ? gasPrice.toString() : null,
      spendableWei: (spendable > 0n ? spendable : 0n).toString(),
      spendableEth: formatEther(spendable > 0n ? spendable : 0n),
    };
  } catch (error) {
    if (error instanceof EvmError) throw error;
    throw new EvmError("rpc_unavailable", "Could not read the Sepolia balance.", true);
  }
}

/* -------------------------------------------------------------- history */

export interface EvmActivity {
  id: string;
  txHash: string;
  direction: "in" | "out";
  type: "send" | "receive";
  asset: string;
  amount: string;
  counterparty: string | null;
  status: "success" | "failed" | "pending";
  createdAt: string;
  blockNumber: string | null;
  explorerUrl: string;
}

type BlockscoutTx = {
  hash?: string;
  from?: { hash?: string };
  to?: { hash?: string } | null;
  value?: string;
  status?: string;
  timestamp?: string;
  block_number?: number | string;
  block?: number | string;
};

/**
 * History from the explorer's public API (Blockscout v2, no key required), so
 * the list reflects the chain rather than only our own table.
 */
export async function evmActivity(address: string, limit = 15): Promise<EvmActivity[]> {
  const account = normaliseEvmAddress(address);
  if (!account) return [];
  const url = `${EVM.historyApi.replace(/\/$/, "")}/api/v2/addresses/${account}/transactions?filter=to%20%7C%20from`;
  let items: BlockscoutTx[] = [];
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { items?: BlockscoutTx[] };
      items = Array.isArray(body.items) ? body.items : [];
    }
  } catch {
    throw new EvmError("rpc_unavailable", "Could not load Sepolia history from the explorer.", true);
  }

  const mine = account.toLowerCase();
  return items.slice(0, limit).map((item, index) => {
    const from = (item.from?.hash ?? "").toLowerCase();
    const outgoing = from === mine;
    const value = item.value && /^\d+$/.test(item.value) ? BigInt(item.value) : 0n;
    return {
      id: item.hash ?? `${account}-${index}`,
      txHash: item.hash ?? "",
      direction: outgoing ? ("out" as const) : ("in" as const),
      type: outgoing ? ("send" as const) : ("receive" as const),
      asset: "ETH",
      amount: formatEther(value),
      counterparty: outgoing ? (item.to?.hash ?? null) : (item.from?.hash ?? null),
      status:
        item.status === "ok" ? ("success" as const) : item.status ? ("failed" as const) : ("pending" as const),
      createdAt: item.timestamp ?? new Date().toISOString(),
      blockNumber: item.block_number !== undefined ? String(item.block_number) : null,
      explorerUrl: explorerTxUrl("evm", item.hash) ?? "",
    };
  });
}

/* ------------------------------------------------------------- transfers */

export interface EvmTransferPreview {
  from: string;
  to: string;
  amount: string;
  amountWei: string;
  balanceEth: string;
  spendableEth: string;
  estimatedFeeEth: string | null;
  totalEth: string | null;
  networkLabel: string;
  chainId: number;
}

export interface EvmSendInput {
  userId: string;
  to: string;
  amount: string;
  idempotencyKey?: string | null;
}

export interface EvmSendOutcome {
  status: "success" | "failed" | "unknown";
  hash: string | null;
  amount: string;
  to: string;
  explorerUrl: string | null;
  message: string;
  createdAt: string;
}

export async function previewEvmTransfer(
  wallet: WalletRow,
  to: string,
  amountInput: string
): Promise<EvmTransferPreview> {
  const destination = normaliseEvmAddress(to);
  if (!destination) {
    throw new EvmError(
      "invalid_destination",
      "Enter a valid Ethereum address (0x followed by 40 hex characters)."
    );
  }
  if (destination.toLowerCase() === wallet.address.toLowerCase()) {
    throw new EvmError("invalid_destination", "You cannot send ETH to the same address.");
  }
  const parsed = parseDecimalAmount(amountInput, {
    decimals: 18,
    symbol: "ETH",
    maxAtomic: parseEther("1000000"),
  });
  if (!parsed.ok) throw new EvmError("invalid_amount", parsed.error);

  const snapshot = await evmSnapshot(wallet.address);
  const value = BigInt(parsed.atomic);
  const spendable = BigInt(snapshot.spendableWei);
  if (value > spendable) {
    throw new EvmError(
      "insufficient_balance",
      `Not enough test ETH. After the gas buffer you can send at most ${formatEther(spendable)} ETH.`,
    );
  }
  let estimatedFeeEth: string | null = null;
  let totalEth: string | null = null;
  try {
    const fees = await sepoliaClient().estimateFeesPerGas();
    const maxFee = fees.maxFeePerGas ?? fees.gasPrice;
    if (maxFee) {
      const fee = maxFee * 21_000n;
      estimatedFeeEth = formatEther(fee);
      totalEth = formatEther(value + fee);
    }
  } catch {
    estimatedFeeEth = null;
  }

  return {
    from: wallet.address,
    to: destination,
    amount: parsed.amount,
    amountWei: value.toString(),
    balanceEth: snapshot.balanceEth,
    spendableEth: formatEther(spendable),
    estimatedFeeEth,
    totalEth,
    networkLabel: EVM.networkLabel,
    chainId: EVM.chainId,
  };
}

export async function sendEvmTransfer(input: EvmSendInput): Promise<EvmSendOutcome> {
  const wallet = await ensureWallet(input.userId, "evm");
  const preview = await previewEvmTransfer(wallet, input.to, input.amount);

  const replay = input.idempotencyKey
    ? await findByIdempotencyKey(input.userId, input.idempotencyKey)
    : null;
  if (replay) {
    return {
      status:
        replay.status === "success" ? "success" : replay.status === "failed" ? "failed" : "unknown",
      hash: replay.tx_hash,
      amount: replay.amount,
      to: replay.recipient_address ?? preview.to,
      explorerUrl: replay.explorer_url,
      message:
        replay.status === "success"
          ? "This transfer was already sent."
          : "This transfer was already attempted.",
      createdAt: replay.created_at,
    };
  }

  await assertSepolia();

  let privateKey: Hex;
  try {
    privateKey = signingSecret(wallet) as Hex;
  } catch (error) {
    throw new EvmError("signing_unavailable", (error as Error).message);
  }

  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new EvmError(
      "signing_unavailable",
      "Stored key material does not match the wallet address. Refusing to sign."
    );
  }

  const client = createWalletClient({ account, chain: sepolia, transport: http(EVM.rpcUrl) });
  const value = BigInt(preview.amountWei);

  // Record the pending row BEFORE broadcasting — mirrors the Stellar
  // path's documented ordering ("the application record is written
  // *before* submission"). A crash between record and broadcast leaves
  // a recoverable pending row keyed by the idempotency key; a retried
  // send replays through the guard above instead of broadcasting twice.
  const record = await recordTransaction({
    userId: input.userId,
    walletId: wallet.id,
    chain: "evm",
    direction: "out",
    type: "send",
    asset: "ETH",
    amount: preview.amount,
    fee: preview.estimatedFeeEth,
    senderAddress: preview.from,
    recipientAddress: preview.to,
    txHash: null,
    status: "pending",
    explorerUrl: null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  let hash: Hex;
  try {
    hash = await client.sendTransaction({
      account,
      chain: sepolia,
      to: preview.to as Address,
      value,
    });
  } catch (error) {
    const message = describeEvmError(error);
    // Broadcast never reached the network — the row stays auditable.
    await updateTransaction(record.id, {
      status: "failed",
      error: message,
    });
    throw new EvmError("submit_failed", message);
  }

  // Broadcast accepted — stamp the real hash before waiting on a
  // receipt so the row is reconcileable by hash from here on.
  await updateTransaction(record.id, {
    tx_hash: hash,
    explorer_url: explorerTxUrl("evm", hash),
  });

  try {
    const receipt = await sepoliaClient().waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
    });
    const ok = receipt.status === "success";
    await updateTransaction(record.id, {
      status: ok ? "success" : "failed",
      error: ok ? null : "The network reverted this transfer.",
      ledger: null,
    });
    if (!ok) {
      throw new EvmError("submit_failed", "The transfer was mined but reverted.");
    }
    return {
      status: "success",
      hash,
      amount: preview.amount,
      to: preview.to,
      explorerUrl: explorerTxUrl("evm", hash),
      message: `Sent ${preview.amount} test ETH on Sepolia.`,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof EvmError) throw error;
    await updateTransaction(record.id, {
      status: "unknown",
      error: "Timed out waiting for the Sepolia receipt.",
    });
    return {
      status: "unknown",
      hash,
      amount: preview.amount,
      to: preview.to,
      explorerUrl: explorerTxUrl("evm", hash),
      message:
        "The transfer was broadcast but not confirmed within the timeout. It is recorded as pending; use Refresh to reconcile it.",
      createdAt: new Date().toISOString(),
    };
  }
}

export async function reconcileEvmTransaction(
  recordId: string,
  hash: string
): Promise<"success" | "failed" | "pending" | null> {
  try {
    const receipt = await sepoliaClient().getTransactionReceipt({ hash: hash as Hex });
    const status = receipt.status === "success" ? "success" : "failed";
    await updateTransaction(recordId, { status });
    return status;
  } catch {
    // No receipt yet: either still pending or not mined. Leave the row alone.
    return null;
  }
}

function describeEvmError(error: unknown): string {
  const shaped = error as {
    shortMessage?: string;
    details?: string;
    message?: string;
    code?: number;
  };
  if (shaped?.code === 4001) return "The signature request was rejected.";
  return (
    shaped?.shortMessage ||
    shaped?.details ||
    shaped?.message ||
    "The Sepolia RPC rejected the transfer."
  );
}
