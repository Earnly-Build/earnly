import { errorResponse, okResponse, readJson, readKey, readString, requireUser } from "@/lib/chain/api";
import { STELLAR, explorerTxUrl } from "@/lib/chain/config";
import {
  StellarError,
  previewPayment,
  sendPayment,
} from "@/lib/chain/stellar";
import { ensureWallet } from "@/lib/chain/wallets";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * Two-phase XLM payment.
 *
 *   { mode: "preview", destination, amount, memo? }  → validated numbers only
 *   { mode: "submit", destination, amount, memo?, idempotencyKey, confirm: true }
 *
 * Nothing is signed unless the request explicitly confirms, and a repeated
 * idempotency key returns the first result instead of sending a second payment.
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
  const destination = readString(body, "destination");
  const amount = readString(body, "amount");
  const memo = readString(body, "memo");
  const idempotencyKey = readKey(body);

  try {
    const wallet = await ensureWallet(guard.user.id, "stellar");

    if (mode === "preview") {
      const preview = await previewPayment(wallet, destination, amount, memo);
      return okResponse({ preview });
    }

    if (mode !== "submit") {
      return errorResponse("bad_request", "Unknown mode. Use 'preview' or 'submit'.", 400);
    }
    if (body.confirm !== true) {
      return errorResponse("confirmation_required", "Confirm the payment before it is signed.", 400);
    }

    const outcome = await sendPayment({
      userId: guard.user.id,
      destination,
      amount,
      memo,
      idempotencyKey,
    });
    return okResponse({
      outcome,
      explorer: outcome.hash ? explorerTxUrl("stellar", outcome.hash) : null,
      network: STELLAR.networkLabel,
    });
  } catch (error) {
    if (error instanceof StellarError) {
      const status = error.retryable ? 503 : error.code === "insufficient_balance" ? 422 : 400;
      return errorResponse(error.code, error.message, status, error.retryable);
    }
    console.error("[earnly] stellar payment failed", (error as Error).message);
    return errorResponse("submit_failed", "The payment could not be completed.", 502, false);
  }
}
