import { errorResponse, okResponse, requireUser } from "@/lib/chain/api";
import { StellarError, fundWithFriendbot } from "@/lib/chain/stellar";
import { ensureWallet, recordTransaction } from "@/lib/chain/wallets";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * Friendbot funding for a Testnet account that has no ledger entry yet.
 * Idempotent by nature: Friendbot refuses to fund an account twice, and we
 * check the account state before calling it.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (e) {
    if (e instanceof CsrfError)
      return errorResponse("forbidden", e.message, 403);
    throw e;
  }

  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const wallet = await ensureWallet(guard.user.id, "stellar");
    const result = await fundWithFriendbot(wallet.address);

    if (result.status === "funded") {
      await recordTransaction({
        userId: guard.user.id,
        walletId: wallet.id,
        chain: "stellar",
        direction: "in",
        type: "fund",
        asset: "XLM",
        amount: "10000",
        senderAddress: "friendbot",
        recipientAddress: wallet.address,
        counterparty: "Friendbot (Stellar Testnet)",
        txHash: result.hash,
        status: "success",
        idempotencyKey: `friendbot:${wallet.address}`,
      });
    }

    return okResponse({
      status: result.status,
      message: result.message,
      hash: result.hash,
      address: wallet.address,
    });
  } catch (error) {
    if (error instanceof StellarError) {
      return errorResponse(error.code, error.message, error.retryable ? 503 : 400, error.retryable);
    }
    console.error("[earnly] friendbot funding failed", (error as Error).message);
    return errorResponse("unavailable", "Friendbot could not be reached. Try again shortly.", 503, true);
  }
}
