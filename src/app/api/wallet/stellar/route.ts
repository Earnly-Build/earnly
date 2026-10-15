import { STELLAR } from "@/lib/chain/config";
import { errorResponse, okResponse, requireUser } from "@/lib/chain/api";
import { stellarActivityFor } from "@/lib/chain/activity";
import {
  StellarError,
  accountSnapshot,
  feeStats,
  reconcileStellarTransaction,
} from "@/lib/chain/stellar";
import {
  ensureWallet,
  listTransactions,
  markBalanceSynced,
  publicWallet,
} from "@/lib/chain/wallets";
import { mapConcurrent } from "@/lib/concurrency";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * Stellar Testnet dashboard payload: the address, live account state from
 * Horizon, the current fee, and merged activity.
 */
export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (e) {
    if (e instanceof CsrfError)
      return errorResponse("forbidden", e.message, 403);
    throw e;
  }

  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const historyLimit = Math.min(Math.max(Number(url.searchParams.get("history") ?? 15) || 15, 1), 40);

  try {
    const wallet = await ensureWallet(guard.user.id, "stellar");

    // Resolve anything left in flight before reporting a status. Best effort:
    // a Horizon hiccup must not break the dashboard.
    // Bounded-concurrency reconcile — 5 Horizon calls at a time, per-row
    // failures swallowed: a Horizon hiccup must not break the dashboard.
    const rows = await listTransactions(guard.user.id, "stellar", 25);
    await mapConcurrent(rows.filter(
      (row) => (row.status === "pending" || row.status === "unknown") && row.tx_hash
    ), 5, async (row) => {
      try {
        await reconcileStellarTransaction(guard.user.id, row);
      } catch {
        // best effort
      }
    });

    // Bounded reads — a timed-out Horizon degrades to a sparse snapshot
    // instead of hanging the request until the platform kills it.
    let account = null;
    let fees = null;
    try {
      [account, fees] = await Promise.all([accountSnapshot(wallet.address), feeStats()]);
    } catch (e) {
      const se = e instanceof StellarError ? e : null;
      if (!se?.retryable) throw e;
      account = {
        address: wallet.address, exists: false, funded: false, balances: [],
        xlmBalance: "0", subentries: 0, minimumBalanceXlm: "0", spendableXlm: "0",
        sequence: null, lastModifiedLedger: null,
      };
      fees = {
        baseFee: "0", baseFeeXlm: "0", paymentFeeXlm: "0", source: "unavailable" as const,
      };
    }
    const activity = await stellarActivityFor(wallet, historyLimit);
    await markBalanceSynced(wallet.id);

    return okResponse({
      wallet: publicWallet(wallet),
      network: {
        label: STELLAR.networkLabel,
        horizon: STELLAR.horizonUrl,
        asset: STELLAR.asset.code,
        explorer: STELLAR.explorerAccount,
        friendbot: STELLAR.friendbotUrl,
      },
      account: {
        exists: account.exists,
        funded: account.funded,
        xlmBalance: account.xlmBalance,
        balances: account.balances,
        subentries: account.subentries,
        minimumBalanceXlm: account.minimumBalanceXlm,
        spendableXlm: account.spendableXlm,
        sequence: account.sequence,
        lastModifiedLedger: account.lastModifiedLedger,
      },
      fees,
      activity: activity.items,
      degraded: activity.degraded || fees.source === "unavailable",
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof StellarError) {
      return errorResponse(error.code, error.message, error.retryable ? 503 : 400, error.retryable);
    }
    console.error("[earnly] stellar overview failed", (error as Error).message);
    return errorResponse("unavailable", "We could not load your Stellar wallet.", 500, true);
  }
}
