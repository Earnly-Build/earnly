import { db } from "../db";
import { EVM, STELLAR, type ChainId } from "./config";
import { openSecret, sealSecret, walletCryptoConfigured, WalletCryptoError } from "./crypto";
import { generateKeypairFor } from "./keys";

/**
 * The wallet store. One row per (user, chain, network); provisioning is
 * idempotent, so a signed-in student always gets the same address no matter how
 * many times the page is opened, refreshed or redeployed.
 *
 * Nothing in this module may be imported from a "use client" file.
 */

export type WalletStatus = "pending" | "active" | "failed" | "disabled";

export interface WalletRow {
  id: string;
  user_id: string;
  chain: ChainId;
  network: string;
  provider: string;
  address: string;
  provider_wallet_id: string | null;
  status: WalletStatus;
  enc_secret: string | null;
  enc_iv: string | null;
  enc_tag: string | null;
  key_version: number;
  created_at: string;
  updated_at: string;
  balance_synced_at: string | null;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  wallet_id: string;
  chain: ChainId;
  network: string;
  direction: "in" | "out";
  type: "send" | "receive" | "fund" | "activate";
  asset: string;
  amount: string;
  fee: string | null;
  sender_address: string | null;
  recipient_address: string | null;
  counterparty: string | null;
  tx_hash: string | null;
  status: "pending" | "success" | "failed" | "unknown";
  ledger: string | null;
  explorer_url: string | null;
  error: string | null;
  reconcile_attempts?: number;
  created_at: string;
  status_synced_at: string | null;
}

/** Public view of a wallet. Signing material is never part of this shape. */
export interface PublicWallet {
  id: string;
  chain: ChainId;
  network: string;
  provider: string;
  address: string;
  status: WalletStatus;
  createdAt: string;
  balanceSyncedAt: string | null;
}

export function networkFor(chain: ChainId): string {
  return chain === "stellar" ? STELLAR.network : EVM.network;
}

export function publicWallet(row: WalletRow): PublicWallet {
  return {
    id: row.id,
    chain: row.chain,
    network: row.network,
    provider: row.provider,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    balanceSyncedAt: row.balance_synced_at,
  };
}

/** The envelope-encryption context. Stable for the lifetime of a wallet. */
function contextFor(userId: string, chain: ChainId, network: string): string {
  return `${chain}:${network}:${userId}`;
}

export async function listWallets(userId: string): Promise<WalletRow[]> {
  const sql = db();
  return (await sql`
    select * from wallets where user_id = ${userId} order by chain
  `) as WalletRow[];
}

export async function getWallet(userId: string, chain: ChainId): Promise<WalletRow | null> {
  const sql = db();
  const rows = (await sql`
    select * from wallets
    where user_id = ${userId} and chain = ${chain} and network = ${networkFor(chain)}
    limit 1
  `) as WalletRow[];
  return rows[0] ?? null;
}

export class WalletProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletProvisioningError";
  }
}

/**
 * Returns the user's wallet for a chain, creating it on first call.
 *
 * The insert is guarded by the `(user_id, chain, network)` unique constraint and
 * `on conflict do nothing`, followed by a re-read, so two concurrent requests
 * cannot produce two wallets or two different addresses.
 */
export async function ensureWallet(userId: string, chain: ChainId): Promise<WalletRow> {
  const existing = await getWallet(userId, chain);
  if (existing && existing.status !== "failed") return existing;

  const network = networkFor(chain);
  const provider = chain === "stellar" ? "earnly-managed" : "earnly-managed";

  let address: string;
  let secret: string;
  try {
    ({ address, secret } = generateKeypairFor(chain));
  } catch (error) {
    throw new WalletProvisioningError(
      `Could not generate a ${chain} keypair: ${(error as Error).message}`
    );
  }

  const sealed = sealSecret(secret, contextFor(userId, chain, network));
  const sql = db();
  await sql`
    insert into wallets
      (user_id, chain, network, provider, address, status, enc_secret, enc_iv, enc_tag, key_version)
    values
      (${userId}, ${chain}, ${network}, ${provider}, ${address}, 'active',
       ${sealed.ciphertext}, ${sealed.iv}, ${sealed.tag}, ${sealed.keyVersion})
    on conflict (user_id, chain, network) do nothing
  `;

  const row = await getWallet(userId, chain);
  if (!row) throw new WalletProvisioningError(`Wallet provisioning for ${chain} did not persist.`);
  if (row.address !== address) {
    // Another request won the race. Its wallet is authoritative; ours was
    // discarded with the conflicting insert.
    return row;
  }
  return row;
}

/** Provisions every supported chain. One failing chain does not block the rest. */
export async function ensureAllWallets(
  userId: string
): Promise<{ provisioned: PublicWallet[]; failed: { chain: ChainId; error: string }[] }> {
  const provisioned: PublicWallet[] = [];
  const failed: { chain: ChainId; error: string }[] = [];
  for (const chain of ["stellar", "evm"] as ChainId[]) {
    try {
      provisioned.push(publicWallet(await ensureWallet(userId, chain)));
    } catch (error) {
      console.error(`[earnly] wallet provisioning failed for ${chain}`, (error as Error).message);
      failed.push({ chain, error: (error as Error).message });
    }
  }
  return { provisioned, failed };
}

/** Unseals the signing secret, in memory, for one signing operation. */
export function signingSecret(wallet: WalletRow): string {
  if (wallet.provider !== "earnly-managed") {
    throw new WalletCryptoError(
      `Wallet ${wallet.id} is held by provider "${wallet.provider}" and cannot sign locally.`
    );
  }
  if (!wallet.enc_secret || !wallet.enc_iv || !wallet.enc_tag) {
    throw new WalletCryptoError(`Wallet ${wallet.id} has no signing material on record.`);
  }
  return openSecret(
    {
      ciphertext: wallet.enc_secret,
      iv: wallet.enc_iv,
      tag: wallet.enc_tag,
      keyVersion: wallet.key_version,
    },
    contextFor(wallet.user_id, wallet.chain, wallet.network)
  );
}

export function walletSigningAvailable(wallet: WalletRow): boolean {
  if (wallet.provider !== "earnly-managed") return true;
  return Boolean(wallet.enc_secret) && walletCryptoConfigured();
}

export async function markBalanceSynced(walletId: string): Promise<void> {
  const sql = db();
  await sql`update wallets set balance_synced_at = now(), updated_at = now() where id = ${walletId}`;
}

export async function markWalletFailed(walletId: string, error: string): Promise<void> {
  const sql = db();
  await sql`
    update wallets
    set status = 'failed', last_error = ${error.slice(0, 500)}, updated_at = now()
    where id = ${walletId}
  `;
}

/* ------------------------------------------------------- transaction records */

export interface RecordInput {
  userId: string;
  walletId: string;
  chain: ChainId;
  direction: "in" | "out";
  type: "send" | "receive" | "fund" | "activate";
  asset: string;
  amount: string;
  fee?: string | null;
  senderAddress?: string | null;
  recipientAddress?: string | null;
  counterparty?: string | null;
  txHash?: string | null;
  status: "pending" | "success" | "failed" | "unknown";
  ledger?: number | null;
  explorerUrl?: string | null;
  error?: string | null;
  idempotencyKey?: string | null;
}

/** Records a transaction attempt. Returns the existing row on a replay. */
export async function recordTransaction(input: RecordInput): Promise<TransactionRow> {
  const sql = db();
  const rows = (await sql`
    insert into wallet_transactions
      (user_id, wallet_id, chain, network, direction, type, asset, amount, fee,
       sender_address, recipient_address, counterparty, tx_hash, status, ledger,
       explorer_url, error, idempotency_key, status_synced_at)
    values
      (${input.userId}, ${input.walletId}, ${input.chain}, ${networkFor(input.chain)},
       ${input.direction}, ${input.type}, ${input.asset}, ${input.amount}, ${input.fee ?? null},
       ${input.senderAddress ?? null}, ${input.recipientAddress ?? null}, ${input.counterparty ?? null},
       ${input.txHash ?? null}, ${input.status}, ${input.ledger ?? null},
       ${input.explorerUrl ?? null}, ${input.error ?? null}, ${input.idempotencyKey ?? null},
       now())
    on conflict do nothing
    returning *
  `) as TransactionRow[];
  if (rows[0]) return rows[0];

  // Conflicted: either a duplicate idempotency key or a transaction we already
  // recorded. Prefer the idempotency key so a retry returns the original row.
  if (input.idempotencyKey) {
    const replay = (await sql`
      select * from wallet_transactions
      where user_id = ${input.userId} and idempotency_key = ${input.idempotencyKey}
      limit 1
    `) as TransactionRow[];
    if (replay[0]) return replay[0];
  }
  if (input.txHash) {
    const same = (await sql`
      select * from wallet_transactions
      where wallet_id = ${input.walletId} and lower(tx_hash) = lower(${input.txHash})
      limit 1
    `) as TransactionRow[];
    if (same[0]) return same[0];
  }
  throw new Error("Could not record the transaction.");
}

export async function findByIdempotencyKey(
  userId: string,
  key: string
): Promise<TransactionRow | null> {
  const sql = db();
  const rows = (await sql`
    select * from wallet_transactions
    where user_id = ${userId} and idempotency_key = ${key}
    limit 1
  `) as TransactionRow[];
  return rows[0] ?? null;
}

export async function updateTransaction(
  id: string,
  patch: Partial<
    Pick<
      TransactionRow,
      "status" | "tx_hash" | "ledger" | "error" | "explorer_url" | "reconcile_attempts"
    >
  >
): Promise<TransactionRow | null> {
  const sql = db();
  const rows = (await sql`
    update wallet_transactions
    set status = coalesce(${patch.status ?? null}, status),
        tx_hash = coalesce(${patch.tx_hash ?? null}, tx_hash),
        ledger = coalesce(${patch.ledger ?? null}, ledger),
        error = coalesce(${patch.error ?? null}, error),
        explorer_url = coalesce(${patch.explorer_url ?? null}, explorer_url),
        reconcile_attempts = coalesce(${patch.reconcile_attempts ?? null}, reconcile_attempts),
        status_synced_at = now()
    where id = ${id}
    returning *
  `) as TransactionRow[];
  return rows[0] ?? null;
}

export async function listTransactions(
  userId: string,
  chain: ChainId,
  limit = 20
): Promise<TransactionRow[]> {
  const sql = db();
  return (await sql`
    select * from wallet_transactions
    where user_id = ${userId} and chain = ${chain}
    order by created_at desc
    limit ${limit}
  `) as TransactionRow[];
}

export async function getTransaction(
  userId: string,
  txHash: string
): Promise<TransactionRow | null> {
  const sql = db();
  const rows = (await sql`
    select * from wallet_transactions
    where user_id = ${userId} and lower(tx_hash) = lower(${txHash})
    order by created_at desc
    limit 1
  `) as TransactionRow[];
  return rows[0] ?? null;
}

/**
 * Concurrently processes an array of items with bounded concurrency.
 * Ensures that individual worker errors are caught so one failing item
 * does not abort or reject the remaining batch.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<(R | undefined)[]> {
  const cap = Math.max(1, Math.min(limit, items.length));
  if (items.length === 0) return [];

  const results: (R | undefined)[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: cap }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      try {
        results[current] = await worker(items[current]);
      } catch {
        // Error isolation: one failing task does not reject others
      }
    }
  });

  await Promise.all(runners);
  return results;
}
