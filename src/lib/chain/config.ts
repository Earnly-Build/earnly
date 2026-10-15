/**
 * Single source of truth for every chain endpoint, network identifier and
 * display label used by the Earnly wallet.
 *
 * This module is deliberately free of SDK imports and secrets so it can be
 * imported from client components. The Stellar network passphrase is not
 * duplicated here: it is read from `@stellar/stellar-sdk` (`Networks.TESTNET`)
 * in `src/lib/chain/stellar.ts`, where it is asserted to be Testnet before any
 * transaction is built.
 */

export type ChainId = "stellar" | "evm";

export const CHAINS: readonly ChainId[] = ["stellar", "evm"] as const;

/* --------------------------------------------------------------- Stellar */

export const STELLAR = {
  chain: "stellar" as const,
  network: "testnet" as const,
  networkLabel: "Stellar Testnet",
  horizonUrl: process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  friendbotUrl: process.env.STELLAR_FRIENDBOT_URL || "https://friendbot.stellar.org",
  explorerTx: "https://stellar.expert/explorer/testnet/tx",
  explorerAccount: "https://stellar.expert/explorer/testnet/account",
  /** Native asset. Stellar's native asset has no issuer. */
  asset: { code: "XLM", decimals: 7, issuer: null as string | null },
  /** Stroops in one XLM. */
  stroopsPerXlm: 10_000_000,
  /** Protocol base reserve, in XLM. Minimum balance = (2 + subentries) * base. */
  baseReserveXlm: 0.5,
  /** Ledger close is ~5s; a payment is normally included in a few ledgers. */
  confirmationLedgers: 3,
  /** Grace window before a Horizon 404 marks a pending transaction as failed (5 minutes). */
  reconcileGraceMs: 5 * 60 * 1000,
  /** Maximum 404 reconciliation attempts within the grace window before marking failed. */
  reconcileMaxAttempts: 5,
} as const;

/* ------------------------------------------------------------------- EVM */

export const EVM = {
  chain: "evm" as const,
  network: "sepolia" as const,
  networkLabel: "Ethereum Sepolia",
  chainId: 11155111,
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org",
  explorerTx: "https://sepolia.etherscan.io/tx",
  explorerAccount: "https://sepolia.etherscan.io/address",
  /** Free, no-key history API for Sepolia (Blockscout v2 REST). */
  historyApi: process.env.SEPOLIA_EXPLORER_API || "https://eth-sepolia.blockscout.com",
  asset: { symbol: "ETH", decimals: 18 },
  faucets: [
    { label: "Chainlink faucet", url: "https://faucets.chain.link/sepolia" },
    { label: "Alchemy faucet", url: "https://www.alchemy.com/faucets/ethereum-sepolia" },
    { label: "pk910 PoW faucet", url: "https://sepolia-faucet.pk910.de/" },
  ],
} as const;

/* ---------------------------------------------------------------- helpers */

/** Builds an explorer link, or null when there is nothing to link to. */
export function explorerTxUrl(chain: ChainId, hash: string | null | undefined): string | null {
  if (!hash) return null;
  return chain === "stellar" ? `${STELLAR.explorerTx}/${hash}` : `${EVM.explorerTx}/${hash}`;
}

export function explorerAccountUrl(chain: ChainId, address: string): string {
  return chain === "stellar"
    ? `${STELLAR.explorerAccount}/${address}`
    : `${EVM.explorerAccount}/${address}`;
}

export function chainDisplay(chain: ChainId) {
  return chain === "stellar"
    ? { name: "Stellar", network: STELLAR.networkLabel, chainId: null as number | null }
    : { name: "Ethereum", network: EVM.networkLabel, chainId: EVM.chainId as number | null };
}
