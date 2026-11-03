"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Button, Icon, Money, SectionHeading, Skeleton, Tag } from "@/components/ui";
import { NetworkBadge } from "@/components/wallet/parts";

interface WalletSummary {
  id: string;
  chain: "stellar" | "evm";
  network: string;
  provider: string;
  address: string;
  status: string;
  balanceSyncedAt: string | null;
}

interface WalletIndex {
  wallets: WalletSummary[];
  failed: { chain: string; error: string }[];
}

function shorten(address: string, size = 6) {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export default function PaymentsPage() {
  const { txns, student } = useApp();
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState<WalletIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadWallets = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as
        | ({ ok?: boolean; error?: string } & Partial<WalletIndex>)
        | null;
      if (!response.ok || !body?.ok) {
        setIndexError(body?.error ?? "Wallets are unavailable right now.");
        return;
      }
      setIndex({ wallets: body.wallets ?? [], failed: body.failed ?? [] });
      setIndexError(null);
    } catch {
      setIndexError("We could not reach the wallet service.");
    }
  }, []);

  useEffect(() => {
    // Deferred into a promise so the effect body never sets state synchronously.
    void Promise.resolve().then(loadWallets);
  }, [loadWallets]);

  const retryProvisioning = async () => {
    setRetrying(true);
    try {
      await fetch("/api/wallet/provision", { method: "POST" });
      await loadWallets();
    } finally {
      setRetrying(false);
    }
  };

  const available = txns
    .filter((t) => t.kind === "earning" && t.status === "Paid")
    .reduce((s, t) => s + t.amount, 0);
  const pending = txns.filter((t) => t.kind === "pending").reduce((s, t) => s + t.amount, 0);
  const withdrawn = Math.abs(
    txns.filter((t) => t.kind === "withdrawal").reduce((s, t) => s + t.amount, 0)
  );
  const total = student.earnedTotal;

  const stellar = index?.wallets.find((w) => w.chain === "stellar") ?? null;
  const evm = index?.wallets.find((w) => w.chain === "evm") ?? null;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Payments</span>
          <h1 className="display mt-2 text-[36px] sm:text-[46px]">Money, and how it moves</h1>
          <p className="mt-3 max-w-[58ch] text-[14.5px] leading-relaxed text-ink2">
            Two live Testnet wallets created with your Earnly account, and the earning ledger. No
            external wallet to connect and no seed phrase to keep.
          </p>
        </div>
        <Tag tone="quiet">Testnet only — no real funds</Tag>
      </header>

      {/* wallet destinations */}
      <section aria-labelledby="wallets-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="wallets-heading" className="display-tight text-[20px]">
            My wallets
          </h2>
          {indexError ? (
            <button
              type="button"
              onClick={() => void retryProvisioning()}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-[12.5px] font-semibold text-ink2 hover:text-ink disabled:opacity-50"
            >
              <Icon name="refresh" size={14} />
              {retrying ? "Retrying…" : "Retry"}
            </button>
          ) : null}
        </div>

        {indexError ? (
          <div
            role="alert"
            className="tagshape mb-4 border border-negative/40 bg-negative/8 p-4 text-[13px] text-ink2"
          >
            {indexError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WalletCard
            chain="stellar"
            title="Stellar"
            href="/app/payments/stellar"
            blurb="Native XLM on Stellar Testnet. Send, receive and claim free test XLM."
            wallet={stellar}
            loading={!index && !indexError}
            primary
          />
          <WalletCard
            chain="evm"
            title="Ethereum"
            href="/app/payments/ethereum"
            blurb="Embedded Sepolia wallet for test ETH. No MetaMask, no external wallet."
            wallet={evm}
            loading={!index && !indexError}
          />
          <SwapCard />
        </div>
      </section>

      {/* earning ledger — unchanged from the prototype, still demo money */}
      <div className="mt-10">
        <SectionHeading
          eyebrow="Earnly balance"
          title="Earning ledger"
          action={<Tag tone="quiet">DEMO MONEY</Tag>}
        />
        <p className="-mt-2 mb-4 max-w-[62ch] text-[12.5px] leading-relaxed text-ink3">
          USDC settlement arrives with the off-ramp. These figures are demo money: they are not chain
          balances and no transaction backs them. Bounty payments for merged PRs are handled
          separately via the wallet provided in your claim comment.
        </p>
        <p className="-mt-2 mb-4 max-w-[62ch] text-[12.5px] leading-relaxed text-ink3">
          Need help with a bounty? Check <a href="https://github.com/Earnly-Build/earnly/blob/main/CONTRIBUTING.md#claiming-a-bounty" className="underline">CONTRIBUTING.md</a> or open an issue if your payment is overdue.
        </p>
      </div>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="tagshape relative overflow-hidden border border-rule bg-raised p-6 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/12 blur-3xl"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="eyebrow">Available now</div>
              <Tag tone="quiet">DEMO</Tag>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="display text-[52px] sm:text-[68px]">
                {available.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="mb-2 text-[16px] font-bold text-accentx">USDC</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-5">
              <div>
                <div className="eyebrow mb-1">Pending</div>
                <Money amount={pending} className="text-[18px] text-ink2" />
              </div>
              <div>
                <div className="eyebrow mb-1">Total earned</div>
                <Money amount={total} className="text-[18px]" />
              </div>
              <div>
                <div className="eyebrow mb-1">Withdrawn</div>
                <Money amount={-withdrawn} className="text-[18px] text-ink2" />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => setNotice("Withdrawals open with the off-ramp. Not yet.")}>
                Withdraw
              </Button>
              <Button
                variant="outline"
                onClick={() => setNotice("Bank and mobile money payouts arrive with the off-ramp.")}
              >
                Payout methods
              </Button>
            </div>
            {notice ? (
              <p className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-ink3">
                <Icon name="clock" size={14} />
                {notice}
              </p>
            ) : null}
          </div>
        </div>

        <div className="tagshape border border-rule bg-raised p-6">
          <div className="eyebrow mb-3">How custody works</div>
          <ul className="space-y-3 text-[12.5px] leading-relaxed text-ink2">
            <li className="flex gap-2">
              <span className="mt-0.5 text-positive">
                <Icon name="shield" size={15} />
              </span>
              Your signing keys are sealed with AES-256-GCM and never leave the server or reach the
              browser.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-positive">
                <Icon name="key" size={15} />
              </span>
              Only your signed-in session can read your address or sign a payment.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-positive">
                <Icon name="lock" size={15} />
              </span>
              Mainnet is refused at the signing boundary, so a Testnet mistake cannot move real money.
            </li>
          </ul>
          <p className="mt-4 border-t border-rule pt-4 text-[11.5px] leading-relaxed text-ink3">
            Full custody model, environment variables and limitations are in
            <span className="figure"> docs/wallet-integration.md</span>.
          </p>
        </div>
      </section>

      {/* off-ramp teaser */}
      <section className="tagshape mt-9 flex flex-wrap items-center justify-between gap-5 border border-rule bg-raised p-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="eyebrow">Off-ramp</span>
            <span className="rounded-full border border-rule px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-ink3">
              COMING SOON
            </span>
          </div>
          <h2 className="display-tight text-[22px]">USDC to your bank or mobile money</h2>
          <p className="mt-2 max-w-[52ch] text-[13.5px] text-ink2">
            The flow is designed: USDC, then local currency, then a bank account or mobile money
            wallet. It is not switched on yet.
          </p>
        </div>
        <Link
          href="/app/offramp"
          className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2.5 text-[13.5px] font-semibold text-ink2 transition-colors hover:text-ink"
        >
          See the plan
          <Icon name="arrowRight" size={16} />
        </Link>
      </section>
    </div>
  );
}

function WalletCard({
  chain,
  title,
  href,
  blurb,
  wallet,
  loading,
  primary = false,
}: {
  chain: "stellar" | "evm";
  title: string;
  href: string;
  blurb: string;
  wallet: WalletSummary | null;
  loading: boolean;
  primary?: boolean;
}) {
  const failed = wallet && wallet.status === "failed";
  return (
    <Link
      href={href}
      className={`tagshape group flex flex-col justify-between border p-5 transition-colors ${
        primary
          ? "border-accent/50 bg-raised hover:border-accent"
          : "border-rule bg-raised hover:border-ink/30"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{primary ? "Primary wallet" : "Wallet"}</div>
            <h3 className="display-tight mt-1 text-[22px]">{title}</h3>
          </div>
          <NetworkBadge chain={chain} />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink2">{blurb}</p>
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        {loading ? (
          <>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </>
        ) : failed ? (
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-negative">
            <Icon name="alert" size={14} />
            Provisioning failed — open to retry
          </span>
        ) : wallet ? (
          <>
            <code className="figure block truncate text-[12.5px] text-ink">
              {shorten(wallet.address)}
            </code>
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink3">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              Active · {wallet.network}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-ink3">Not provisioned yet</span>
        )}
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accentx">
          Open dashboard
          <Icon name="arrowRight" size={14} />
        </span>
      </div>
    </Link>
  );
}

function SwapCard() {
  return (
    <Link
      href="/app/payments/swap"
      className="tagshape group flex flex-col justify-between border border-dashed border-rule bg-raised/60 p-5 transition-colors hover:border-ink/30"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Cross-chain</div>
            <h3 className="display-tight mt-1 text-[22px]">Swap</h3>
          </div>
          <span className="rounded-full border border-rule px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-ink3">
            COMING SOON
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink2">Swap between blockchain</p>
      </div>
      <div className="mt-5 border-t border-rule pt-4">
        <span className="text-[12.5px] text-ink3">
          A placeholder. No rate is quoted and nothing is traded.
        </span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2">
          Read what is planned
          <Icon name="arrowRight" size={14} />
        </span>
      </div>
    </Link>
  );
}
