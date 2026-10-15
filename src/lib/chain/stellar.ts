import { createHash } from "node:crypto";
import {
  Asset,
  BASE_FEE,
  Config,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";
import { STELLAR, explorerTxUrl } from "./config";
import { formatAtomic, parseDecimalAmount, toAtomic } from "./decimal";
import {
  ensureWallet,
  recordTransaction,
  findByIdempotencyKey,
  signingSecret,
  updateTransaction,
  type WalletRow,
} from "./wallets";

/**
 * Stellar Testnet service. Everything that talks to Horizon or signs a Stellar
 * transaction lives here, so no route handler or component has to know about
 * stroops, sequence numbers or the network passphrase.
 */

/** The official Testnet passphrase, taken from the SDK rather than retyped. */
export const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

/** Stellar Testnet was the only network this release may talk to. */
export function assertStellarTestnet(): void {
  if (STELLAR_NETWORK_PASSPHRASE !== "Test SDF Network ; September 2015") {
    throw new Error(
      `Refusing to sign: unexpected Stellar network passphrase "${STELLAR_NETWORK_PASSPHRASE}".`
    );
  }
  if ((STELLAR_NETWORK_PASSPHRASE as string) === (Networks.PUBLIC as string)) {
    throw new Error("Refusing to sign Stellar transactions on Mainnet.");
  }
  if (/(^|\/\/)horizon\.stellar\.org/.test(STELLAR.horizonUrl)) {
    throw new Error("Refusing to use a Mainnet Horizon endpoint.");
  }
}

export const HORIZON_TIMEOUT_MS = 15_000;

let cachedServer: Horizon.Server | null = null;

export function horizon(): Horizon.Server {
  assertStellarTestnet();
  if (!cachedServer) {
    // Bounded reads (issue #10): the SDK's axios adapter honors the
    // global Config timeout for every call — loadAccount/feeStats/
    // .call()/submitTransaction all die at 15s instead of stalling the
    // request until the platform kills it.
    Config.setTimeout(HORIZON_TIMEOUT_MS);
    cachedServer = new Horizon.Server(STELLAR.horizonUrl, { allowHttp: false });
  }
  return cachedServer;
}

/* ------------------------------------------------------------ addresses */

export function isValidStellarAddress(value: unknown): value is string {
  return typeof value === "string" && StrKey.isValidEd25519PublicKey(value.trim());
}

export function normaliseStellarAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return StrKey.isValidEd25519PublicKey(trimmed) ? trimmed : null;
}

/* ------------------------------------------------------- account reading */

export interface StellarBalanceLine {
  asset: string;
  code: string;
  issuer: string | null;
  balance: string;
}

export interface StellarAccountSnapshot {
  address: string;
  /** false when the address has never been funded, i.e. no ledger entry yet. */
  exists: boolean;
  /** true when the account exists, holds XLM and can therefore send. */
  funded: boolean;
  balances: StellarBalanceLine[];
  xlmBalance: string;
  subentries: number;
  /** (2 + subentries + sponsoring - sponsored) × base reserve, in XLM. */
  minimumBalanceXlm: string;
  /** How much the account can actually spend right now, in XLM. */
  spendableXlm: string;
  sequence: string | null;
  lastModifiedLedger: number | null;
}

export type StellarServiceError = {
  code:
    | "account_not_found"
    | "horizon_unavailable"
    | "timeout"
    | "rate_limited"
    | "not_funded"
    | "already_funded"
    | "invalid_destination"
    | "invalid_amount"
    | "insufficient_balance"
    | "submit_failed"
    | "source_not_found"
    | "signing_unavailable"
    | "memo_too_long";
  message: string;
  retryable: boolean;
};

export class StellarError extends Error {
  code: StellarServiceError["code"];
  retryable: boolean;
  constructor(code: StellarServiceError["code"], message: string, retryable = false) {
    super(message);
    this.name = "StellarError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const name = (error as { name?: string })?.name;
  return status === 404 || name === "NotFoundError";
}

function isRateLimited(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 429;
}


export function minimumBalanceXlm(subentries: number, sponsoring: number, sponsored: number): string {
  const units = 2 + subentries + sponsoring - sponsored;
  const total = BigInt(Math.max(units, 0)) * toAtomic(String(STELLAR.baseReserveXlm), 7);
  return formatAtomic(total, 7, { trim: true });
}

export function spendableXlm(
  xlmBalance: string,
  minimumBalance: string,
  feeXlm: string
): string {
  const available = toAtomic(xlmBalance, 7) - toAtomic(minimumBalance, 7) - toAtomic(feeXlm, 7);
  return formatAtomic(available > 0n ? available : 0n, 7, { trim: true });
}

/** Reads an account. Returns `exists: false` for a never-funded address. */
export async function accountSnapshot(address: string): Promise<StellarAccountSnapshot> {
  if (!isValidStellarAddress(address)) {
    throw new StellarError("account_not_found", "That is not a valid Stellar address.");
  }
  try {
    const account = (await horizon().loadAccount(address)) as unknown as {
      balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[];
      subentry_count: number;
      num_sponsoring: number;
      num_sponsored: number;
      sequence: string;
      last_modified_ledger: number;
    };
    const balances: StellarBalanceLine[] = account.balances.map((line) => ({
      asset:
        line.asset_type === "native"
          ? "XLM"
          : `${line.asset_code}:${line.asset_issuer ?? ""}`,
      code: line.asset_type === "native" ? "XLM" : (line.asset_code ?? "?"),
      issuer: line.asset_issuer ?? null,
      balance: line.balance,
    }));
    const nativeLine = balances.find((b) => b.code === "XLM");
    const xlmBalance = nativeLine?.balance ?? "0";
    const minimum = minimumBalanceXlm(
      account.subentry_count ?? 0,
      account.num_sponsoring ?? 0,
      account.num_sponsored ?? 0
    );
    return {
      address,
      exists: true,
      funded: true,
      balances,
      xlmBalance,
      subentries: account.subentry_count ?? 0,
      minimumBalanceXlm: minimum,
      spendableXlm: spendableXlm(xlmBalance, minimum, "0"),
      sequence: account.sequence ?? null,
      lastModifiedLedger: account.last_modified_ledger ?? null,
    };
  } catch (error) {
    if (isTimeoutLike(error)) {
      throw new StellarError("timeout", "The Horizon account read timed out.", true);
    }
    if (isNotFound(error)) {
      return {
        address,
        exists: false,
        funded: false,
        balances: [],
        xlmBalance: "0",
        subentries: 0,
        minimumBalanceXlm: minimumBalanceXlm(0, 0, 0),
        spendableXlm: "0",
        sequence: null,
        lastModifiedLedger: null,
      };
    }
    if (isRateLimited(error)) {
      throw new StellarError(
        "rate_limited",
        "Stellar Testnet is rate limiting requests. Try again in a moment.",
        true
      );
    }
    throw new StellarError(
      "horizon_unavailable",
      "Could not reach Stellar Testnet Horizon. Balances may be stale.",
      true
    );
  }
}

/* -------------------------------------------------------------- fee stats */

export interface StellarFees {
  /** Base fee in stroops as a string. */
  baseFee: string;
  /** Base fee in XLM, for display. */
  baseFeeXlm: string;
  /** Fee for a single-operation payment, in XLM. */
  paymentFeeXlm: string;
  source: "network" | "default";
}

export async function feeStats(): Promise<StellarFees> {
  const fallback = (): StellarFees => ({
    baseFee: String(BASE_FEE),
    baseFeeXlm: formatAtomic(BigInt(BASE_FEE), 7, { trim: true }),
    paymentFeeXlm: formatAtomic(BigInt(BASE_FEE), 7, { trim: true }),
    source: "default",
  });
  try {
    const stats = (await horizon().feeStats()) as unknown as {
      last_ledger_base_fee?: string;
      fee_charged?: { mode?: string; p50?: string };
    };
    const candidates = [stats?.last_ledger_base_fee, stats?.fee_charged?.mode, stats?.fee_charged?.p50]
      .map((v) => (v === undefined || v === null ? NaN : Number(v)))
      .filter((n) => Number.isFinite(n) && n > 0);
    const base = candidates.length ? Math.max(...candidates) : Number(BASE_FEE);
    // Never bid above 1 XLM per operation: a runaway fee is worse than a delay.
    const clamped = Math.min(Math.max(base, Number(BASE_FEE)), 10_000_000);
    const rounded = BigInt(Math.ceil(clamped));
    return {
      baseFee: rounded.toString(),
      baseFeeXlm: formatAtomic(rounded, 7, { trim: true }),
      paymentFeeXlm: formatAtomic(rounded, 7, { trim: true }),
      source: "network",
    };
  } catch {
    return fallback();
  }
}

/* ------------------------------------------------------------- history */

export interface StellarActivity {
  id: string;
  txHash: string;
  direction: "in" | "out";
  type: "send" | "receive" | "fund";
  asset: string;
  amount: string;
  counterparty: string | null;
  status: "success" | "failed" | "pending";
  createdAt: string;
  ledger: number | null;
  explorerUrl: string;
  /** true when the row also exists in the application database. */
  recorded: boolean;
}

type OperationRecord = {
  id: string;
  type: string;
  transaction_hash: string;
  created_at: string;
  transaction_successful?: boolean;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  funder?: string;
  account?: string;
  starting_balance?: string;
};

/**
 * Network-sourced activity. The application database is merged in only to
 * resolve rows Horizon has not exposed yet (a submission we have not yet seen
 * in a ledger), never as the source of truth.
 */
export async function accountActivity(address: string, limit = 15): Promise<StellarActivity[]> {
  const server = horizon();
  let operations: OperationRecord[] = [];
  try {
    const page = (await server
      .operations()
      .forAccount(address)
      .order("desc")
      .limit(Math.min(Math.max(limit, 1), 50))
      .call()) as unknown as { records: OperationRecord[] };
    operations = page.records ?? [];
  } catch (error) {
    if (isTimeoutLike(error)) {
      throw new StellarError("timeout", "The Horizon activity read timed out.", true);
    }
    if (isNotFound(error)) return [];
    if (isRateLimited(error)) {
      throw new StellarError("rate_limited", "Stellar Testnet is rate limiting requests.", true);
    }
    throw new StellarError(
      "horizon_unavailable",
      "Could not load transaction history from Stellar Testnet.",
      true
    );
  }

  const rows: StellarActivity[] = [];
  for (const op of operations) {
    const native = op.asset_type === undefined || op.asset_type === "native";
    if (op.type === "create_account" && op.account === address) {
      rows.push({
        id: op.id,
        txHash: op.transaction_hash,
        direction: "in",
        type: "fund",
        asset: "XLM",
        amount: op.starting_balance ?? "0",
        counterparty: op.funder ?? null,
        status: op.transaction_successful === false ? "failed" : "success",
        createdAt: op.created_at,
        ledger: null,
        explorerUrl: explorerTxUrl("stellar", op.transaction_hash) ?? "",
        recorded: false,
      });
      continue;
    }
    if ((op.type === "payment" || op.type.startsWith("path_payment")) && native) {
      const outgoing = op.from === address;
      rows.push({
        id: op.id,
        txHash: op.transaction_hash,
        direction: outgoing ? "out" : "in",
        type: outgoing ? "send" : "receive",
        asset: "XLM",
        amount: op.amount ?? "0",
        counterparty: (outgoing ? op.to : op.from) ?? null,
        status: op.transaction_successful === false ? "failed" : "success",
        createdAt: op.created_at,
        ledger: null,
        explorerUrl: explorerTxUrl("stellar", op.transaction_hash) ?? "",
        recorded: false,
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------- friendbot */

export interface FundResult {
  status: "funded" | "already_funded";
  hash: string | null;
  message: string;
}

/**
 * Friendbot funds a Testnet account with 10 000 test XLM. Testnet only: the
 * guard below refuses to call it when the configured Horizon is Mainnet.
 */
export async function fundWithFriendbot(address: string): Promise<FundResult> {
  assertStellarTestnet();
  if (!isValidStellarAddress(address)) {
    throw new StellarError("invalid_destination", "That is not a valid Stellar address.");
  }
  const existing = await accountSnapshot(address);
  if (existing.exists) {
    return {
      status: "already_funded",
      hash: null,
      message: "This account is already active on Testnet, so Friendbot will not fund it again.",
    };
  }

  const url = `${STELLAR.friendbotUrl.replace(/\/$/, "")}/?addr=${encodeURIComponent(address)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new StellarError(
      "horizon_unavailable",
      "Could not reach Friendbot. It may be busy — try again shortly.",
      true
    );
  }

  const body = await response.text();
  if (response.ok) {
    let hash: string | null = null;
    try {
      const parsed = JSON.parse(body) as { hash?: string };
      hash = parsed.hash ?? null;
    } catch {
      hash = null;
    }
    return {
      status: "funded",
      hash,
      message: "Friendbot sent 10,000 test XLM. These have no real-world value.",
    };
  }

  if (response.status === 429) {
    throw new StellarError(
      "rate_limited",
      "Friendbot is rate limiting requests. Wait a minute and try again.",
      true
    );
  }
  if (/already|exist/i.test(body) || response.status === 400) {
    return {
      status: "already_funded",
      hash: null,
      message: "This account is already active on Testnet, so Friendbot will not fund it again.",
    };
  }
  throw new StellarError(
    "horizon_unavailable",
    `Friendbot could not fund this account (HTTP ${response.status}).`,
    true
  );
}

/* -------------------------------------------------------------- payments */

export interface PaymentPreview {
  sourceAddress: string;
  destination: string;
  amount: string;
  amountAtomic: string;
  /** Base fee per operation, in stroops — what the SDK's builder expects. */
  feeStroops: string;
  /** The same fee in XLM, for display. */
  fee: string;
  totalDebit: string;
  /** Spendable before this payment. */
  spendable: string;
  /** Spendable after this payment. */
  remaining: string;
  memo: string | null;
  networkLabel: string;
  accountExists: boolean;
}

export interface PaymentInput {
  userId: string;
  destination: string;
  amount: string;
  memo?: string | null;
  idempotencyKey?: string | null;
}

export interface PaymentOutcome {
  status: "success" | "failed" | "unknown";
  hash: string | null;
  ledger: number | null;
  amount: string;
  destination: string;
  explorerUrl: string | null;
  message: string;
  createdAt: string;
}

const MEMO_MAX_BYTES = 28;

function validateMemo(memo: string | null | undefined): string | null {
  if (memo === undefined || memo === null) return null;
  const trimmed = String(memo).trim();
  if (!trimmed) return null;
  if (Buffer.byteLength(trimmed, "utf8") > MEMO_MAX_BYTES) {
    throw new StellarError(
      "memo_too_long",
      `A Stellar memo can be at most ${MEMO_MAX_BYTES} bytes.`,
      false
    );
  }
  return trimmed;
}

/**
 * Validates a payment against live network state without signing anything. Used
 * by the review step so the user sees the exact numbers before approving.
 */
export async function previewPayment(
  wallet: WalletRow,
  destination: string,
  amountInput: string,
  memo?: string | null
): Promise<PaymentPreview> {
  const to = normaliseStellarAddress(destination);
  if (!to) {
    throw new StellarError(
      "invalid_destination",
      "Enter a valid Stellar public address (it starts with G and is 56 characters).",
      false
    );
  }
  if (to === wallet.address) {
    throw new StellarError("invalid_destination", "You cannot send XLM to the same address.", false);
  }
  const parsed = parseDecimalAmount(amountInput, {
    decimals: STELLAR.asset.decimals,
    symbol: "XLM",
    maxAtomic: BigInt(1_000_000_000) * BigInt(STELLAR.stroopsPerXlm),
  });
  if (!parsed.ok) throw new StellarError("invalid_amount", parsed.error, false);

  const memoText = validateMemo(memo);
  const [account, fees] = await Promise.all([accountSnapshot(wallet.address), feeStats()]);
  if (!account.exists) {
    throw new StellarError(
      "not_funded",
      "Your Stellar Testnet account is not active yet. Fund it first, then try again.",
      false
    );
  }
  const spendable = spendableXlm(account.xlmBalance, account.minimumBalanceXlm, fees.paymentFeeXlm);
  const total = toAtomic(parsed.amount, 7) + toAtomic(fees.paymentFeeXlm, 7);
  if (toAtomic(spendable, 7) < total) {
    throw new StellarError(
      "insufficient_balance",
      `Not enough spendable XLM. You can send at most ${spendable} XLM after the network fee and the account reserve.`,
      false
    );
  }
  const remaining = toAtomic(spendable, 7) - total;
  return {
    sourceAddress: wallet.address,
    destination: to,
    amount: parsed.amount,
    amountAtomic: parsed.atomic.toString(),
    feeStroops: fees.baseFee,
    fee: fees.paymentFeeXlm,
    totalDebit: formatAtomic(total, 7, { trim: true }),
    spendable,
    remaining: formatAtomic(remaining > 0n ? remaining : 0n, 7, { trim: true }),
    memo: memoText,
    networkLabel: STELLAR.networkLabel,
    accountExists: account.exists,
  };
}

function describeSubmitError(error: unknown): string {
  const shaped = error as {
    response?: {
      status?: number;
      data?: {
        detail?: string;
        extras?: { result_codes?: { transaction?: string; operations?: string[] } };
      };
    };
    message?: string;
  };
  const codes = shaped?.response?.data?.extras?.result_codes;
  if (codes) {
    const parts = [codes.transaction, ...(codes.operations ?? [])].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  const status = shaped?.response?.status;
  if (status === 429) return "Stellar Testnet is rate limiting submissions. Try again shortly.";
  if (status === 504) return "Transaction timed out with an uncertain outcome.";
  return shaped?.response?.data?.detail || shaped?.message || "The network rejected the transaction.";
}

export function isTimeoutLike(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 504 || status === 408) return true;
  // axios-side aborts — the Config timeout fires as ECONNABORTED /
  // "timeout of Nms exceeded" without an HTTP status.
  const code = (error as { code?: string })?.code;
  const msg = (error as { message?: string })?.message ?? "";
  return code === "ECONNABORTED" || /timeout of \d/.test(msg);
}

/** Horizon failures → typed StellarError; timeouts are retryable so the
 * route can degrade instead of dying. */
export function asStellarError(error: unknown): StellarError | null {
  if (error instanceof StellarError) return error;
  if (isTimeoutLike(error))
    return new StellarError("timeout", "The Stellar Horizon request timed out.", true);
  if (isRateLimited(error))
    return new StellarError("rate_limited", "Stellar Testnet is rate limiting requests.", true);
  return null;
}

/**
 * Builds, signs and submits a native XLM payment on Testnet.
 *
 * The application record is written *before* submission so a timeout leaves a
 * `pending` row keyed by transaction hash, which reconciliation can resolve
 * instead of a retry creating a second payment.
 */
/** The transaction hash is the SHA-256 of the SDK's signature base. */
function transactionHash(transaction: Transaction): string {
  return createHash("sha256").update(Buffer.from(transaction.signatureBase())).digest("hex");
}

function buildSignedPayment(preview: PaymentPreview, secret: string, source: Horizon.AccountResponse) {
  // `fee` on the builder is the base fee per operation, in stroops.
  const builder = new TransactionBuilder(source, {
    fee: preview.feeStroops || String(BASE_FEE),
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: preview.destination,
        asset: Asset.native(),
        amount: preview.amount,
      })
    )
    .setTimeout(180);
  if (preview.memo) builder.addMemo(Memo.text(preview.memo));
  const transaction = builder.build();
  transaction.sign(Keypair.fromSecret(secret));
  return transaction;
}

/**
 * Builds, signs and submits one native XLM payment on Testnet.
 *
 * The single signed envelope is what gets hashed, recorded and submitted, so
 * the hash in the database is always the hash on the ledger. The application
 * record is written *before* submission: if the call times out, the row is left
 * `pending`/`unknown` for reconciliation rather than being retried blindly.
 */
export async function sendPayment(input: PaymentInput): Promise<PaymentOutcome> {
  assertStellarTestnet();
  const wallet = await ensureWallet(input.userId, "stellar");
  const preview = await previewPayment(wallet, input.destination, input.amount, input.memo);

  // Replay guard: a duplicate submission returns the first result untouched.
  const replay = input.idempotencyKey
    ? await findByIdempotencyKey(input.userId, input.idempotencyKey)
    : null;
  if (replay) {
    return {
      status:
        replay.status === "success" ? "success" : replay.status === "failed" ? "failed" : "unknown",
      hash: replay.tx_hash,
      ledger: replay.ledger ? Number(replay.ledger) : null,
      amount: replay.amount,
      destination: replay.recipient_address ?? preview.destination,
      explorerUrl: replay.explorer_url,
      message:
        replay.status === "success"
          ? "This payment was already sent."
          : "This payment was already attempted.",
      createdAt: replay.created_at,
    };
  }

  let secret: string;
  try {
    secret = signingSecret(wallet);
  } catch (error) {
    throw new StellarError("signing_unavailable", (error as Error).message, false);
  }

  let transaction: Transaction;
  let hash: string;
  try {
    const source = (await horizon().loadAccount(preview.sourceAddress)) as Horizon.AccountResponse;
    transaction = buildSignedPayment(preview, secret, source);
    hash = transactionHash(transaction);
  } catch (error) {
    if (error instanceof StellarError) throw error;
    const message = describeSubmitError(error);
    throw new StellarError(isNotFound(error) ? "source_not_found" : "submit_failed", message, false);
  }

  const record = await recordTransaction({
    userId: input.userId,
    walletId: wallet.id,
    chain: "stellar",
    direction: "out",
    type: "send",
    asset: "XLM",
    amount: preview.amount,
    fee: preview.fee,
    senderAddress: preview.sourceAddress,
    recipientAddress: preview.destination,
    txHash: hash,
    status: "pending",
    explorerUrl: explorerTxUrl("stellar", hash),
    idempotencyKey: input.idempotencyKey ?? null,
  });

  try {
    const result = (await horizon().submitTransaction(transaction)) as unknown as {
      hash: string;
      ledger: number;
    };
    const finalHash = result.hash ?? hash;
    await updateTransaction(record.id, {
      status: "success",
      tx_hash: finalHash,
      ledger: result.ledger != null ? String(result.ledger) : null,
      explorer_url: explorerTxUrl("stellar", finalHash),
    });
    return {
      status: "success",
      hash: finalHash,
      ledger: result.ledger ?? null,
      amount: preview.amount,
      destination: preview.destination,
      explorerUrl: explorerTxUrl("stellar", finalHash),
      message: `Sent ${preview.amount} XLM on Stellar Testnet.`,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (isTimeoutLike(error)) {
      // Uncertain outcome. Never resubmit here: the row stays pending until
      // reconciliation proves whether the ledger accepted it.
      await updateTransaction(record.id, {
        status: "unknown",
        error: "Submission timed out; the network outcome is not yet known.",
      });
      return {
        status: "unknown",
        hash,
        ledger: null,
        amount: preview.amount,
        destination: preview.destination,
        explorerUrl: explorerTxUrl("stellar", hash),
        message:
          "The submission timed out. We are checking the network before retrying, so the payment is not sent twice.",
        createdAt: new Date().toISOString(),
      };
    }
    const message = describeSubmitError(error);
    await updateTransaction(record.id, {
      status: "failed",
      tx_hash: hash,
      error: message,
    });
    throw new StellarError("submit_failed", message, false);
  }
}

/** Grace period before a Horizon 404 marks a pending transaction as failed. */
export const STELLAR_RECONCILE_GRACE_MS = STELLAR.reconcileGraceMs;
/** Maximum 404 reconciliation attempts within the grace window before failing. */
export const STELLAR_RECONCILE_MAX_ATTEMPTS = STELLAR.reconcileMaxAttempts;

export interface ReconcileStellarRecord {
  id: string;
  tx_hash: string | null;
  created_at?: string | Date | null;
  status_synced_at?: string | Date | null;
  reconcile_attempts?: number | null;
}

/**
 * Reconciles a recorded transaction against Horizon. Used to resolve rows left
 * `pending`/`unknown` and to keep our record in step with the network.
 */
export async function reconcileStellarTransaction(
  userId: string,
  record: ReconcileStellarRecord
): Promise<boolean> {
  if (!record.tx_hash) return false;
  try {
    const tx = (await horizon().transactions().transaction(record.tx_hash).call()) as unknown as {
      successful: boolean;
      ledger: number;
    };
    await updateTransaction(record.id, {
      status: tx.successful ? "success" : "failed",
      ledger: tx.ledger != null ? String(tx.ledger) : null,
      error: tx.successful ? null : "The network rejected this transaction.",
      explorer_url: explorerTxUrl("stellar", record.tx_hash),
    });
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      const nextAttempts = (record.reconcile_attempts ?? 0) + 1;
      const createdAtMs =
        record.created_at != null ? new Date(record.created_at).getTime() : Date.now();
      const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, Date.now() - createdAtMs) : 0;
      const graceExpired =
        ageMs >= STELLAR_RECONCILE_GRACE_MS || nextAttempts >= STELLAR_RECONCILE_MAX_ATTEMPTS;

      if (!graceExpired) {
        // Horizon has not ingested the transaction yet; keep it pending during the grace window.
        await updateTransaction(record.id, {
          status: "pending",
          reconcile_attempts: nextAttempts,
        });
        return false;
      }

      // Past the grace window or max attempts: Horizon has no record of this transaction.
      await updateTransaction(record.id, {
        status: "failed",
        reconcile_attempts: nextAttempts,
        error:
          "Stellar Testnet has no record of this transaction after the reconciliation grace period.",
      });
      return true;
    }
    return false;
  }
}
