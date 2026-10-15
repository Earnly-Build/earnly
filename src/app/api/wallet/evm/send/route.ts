import { errorResponse, okResponse, readJson, readKey, readString, requireUser } from "@/lib/chain/api";
import { EVM, explorerTxUrl } from "@/lib/chain/config";
import { EvmError, previewEvmTransfer, sendEvmTransfer } from "@/lib/chain/evm";
import { ensureWallet } from "@/lib/chain/wallets";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * Two-phase test ETH transfer on Sepolia. Identical contract to the Stellar
 * route: preview returns validated numbers, submit requires an explicit
 * `confirm: true` and is protected by an idempotency key.
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

  const body = await readJson(request);
  const mode = readString(body, "mode") || "preview";
  const to = readString(body, "to") || readString(body, "destination");
  const amount = readString(body, "amount");
  const idempotencyKey = readKey(body);

  try {
    const wallet = await ensureWallet(guard.user.id, "evm");

    if (mode === "preview") {
      const preview = await previewEvmTransfer(wallet, to, amount);
      return okResponse({ preview });
    }
    if (mode !== "submit") {
      return errorResponse("bad_request", "Unknown mode. Use 'preview' or 'submit'.", 400);
    }
    if (body.confirm !== true) {
      return errorResponse("confirmation_required", "Confirm the transfer before it is signed.", 400);
    }

    const outcome = await sendEvmTransfer({ userId: guard.user.id, to, amount, idempotencyKey });
    return okResponse({
      outcome,
      explorer: outcome.hash ? explorerTxUrl("evm", outcome.hash) : null,
      network: EVM.networkLabel,
    });
  } catch (error) {
    if (error instanceof EvmError) {
      const status = error.retryable ? 503 : error.code === "insufficient_balance" ? 422 : 400;
      return errorResponse(error.code, error.message, status, error.retryable);
    }
    console.error("[earnly] evm transfer failed", (error as Error).message);
    return errorResponse("submit_failed", "The transfer could not be completed.", 502, false);
  }
}
