"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { AppStage } from "@/lib/types";

/* ------------------------------------------------------------------ icons */

const PATHS: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
  badge: <><path d="M8 0l1.9 2.1 2.8-.5.5 2.8L15.3 6l-1.4 2.5 1.4 2.5-2.1 1.6-.5 2.8-2.8-.5L8 16l-1.9-2.1-2.8.5-.5-2.8L.7 10l1.4-2.5L.7 5l2.1-1.6.5-2.8 2.8.5z" /><path d="M6.9 10.6L4.6 8.3l1-1 1.3 1.3 3-3 1 1z" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></>,
  arrowUpRight: <><path d="M7 17L17 7" /><path d="M8 7h9v9" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4.5L6 21z" /></>,
  filter: <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>,
  ai: <><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" /><path d="M18.5 15l.8 2.2L21.5 18l-2.2.8-.8 2.2-.8-2.2L15.5 18l2.2-.8z" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A2.5 2.5 0 0111.5 3h1A2.5 2.5 0 0115 5.5V7" /><path d="M3 12h18" /></>,
  cap: <><path d="M2.5 8.5L12 4l9.5 4.5L12 13 2.5 8.5z" /><path d="M6 10.7V16c0 1.3 2.7 2.6 6 2.6s6-1.3 6-2.6v-5.3" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20c.7-3.6 3.7-5.6 7.2-5.6s6.5 2 7.2 5.6" /></>,
  layers: <><path d="M12 3l8.5 4.5L12 12 3.5 7.5z" /><path d="M4 12.5L12 17l8-4.5" /><path d="M4 16.5L12 21l8-4.5" /></>,
  star: <><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" /></>,
  check: <><path d="M4.5 12.5l5 5 10-11" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  arrowLeft: <><path d="M20 12H5" /><path d="M11 6l-6 6 6 6" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  shield: <><path d="M12 3l7 3v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.8 7l8.2 6 8.2-6" /></>,
  google: <><path d="M21 11.2h-8.8v3.4h5.1c-.5 2.3-2.4 3.6-5.1 3.6a5.6 5.6 0 110-11.2c1.5 0 2.8.6 3.8 1.5l2.5-2.5A9.2 9.2 0 0012 3a9 9 0 100 18c5.2 0 8.8-3.6 8.8-8.9 0-.3 0-.6-.1-.9z" /></>,
  bank: <><path d="M3.5 9.5L12 4l8.5 5.5" /><path d="M5.5 10v9" /><path d="M18.5 10v9" /><path d="M9.5 10v9" /><path d="M14.5 10v9" /><path d="M3 19.5h18" /></>,
  cart: <><path d="M3 5h2.2l2 11h11l2-8H6" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
  users: <><circle cx="9" cy="9" r="3.4" /><path d="M2.8 19.5c.6-3.1 3.2-4.8 6.2-4.8s5.6 1.7 6.2 4.8" /><path d="M16 6.2a3.2 3.2 0 010 6" /><path d="M18 15.2c2 .6 3.3 2.1 3.6 4.3" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="10" width="3" height="7" /></>,
  play: <><path d="M7 4.8v14.4L19 12z" /></>,
  quote: <><path d="M9.5 6C6.9 7 5.5 8.9 5.5 11.6V18h5.2v-6.2H8.2c0-1.6.6-2.7 2-3.4z" /><path d="M18.5 6c-2.6 1-4 2.9-4 5.6V18h5.2v-6.2h-2.5c0-1.6.6-2.7 2-3.4z" /></>,
  box: <><path d="M3.5 7.6L12 3.5l8.5 4.1v8.8L12 20.5l-8.5-4.1z" /><path d="M3.5 7.6L12 11.8l8.5-4.2" /><path d="M12 11.8v8.7" /></>,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="M10.6 12.6L20 3.2" /><path d="M17 6.2l2.2 2.2" /><path d="M14.6 8.6l2.2 2.2" /></>,
  github: <><path d="M9.2 20.4v-2.6c-3 .6-3.7-1.4-3.7-1.4-.5-1.2-1.2-1.6-1.2-1.6-1-.7 0-.7 0-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.4-.3-4.9-1.2-4.9-5.3 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 3 1.1a10 10 0 015.4 0c2.1-1.4 3-1.1 3-1.1.6 1.4.2 2.5.1 2.8.7.8 1.1 1.7 1.1 2.9 0 4.1-2.5 5-4.9 5.3.4.4.7 1 .7 2.1v3.1" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5.5 15H5a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 015 3.5h8.5A1.5 1.5 0 0115 5v.5" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  refresh: <><path d="M20 12a8 8 0 10-2.6 5.9" /><path d="M20 6.5V12h-5.5" /></>,
  link: <><path d="M10 14a4 4 0 015.7 0l2.6-2.6a4 4 0 10-5.7-5.7L11 7.3" /><path d="M14 10a4 4 0 01-5.7 0L5.7 12.6a4 4 0 105.7 5.7l1.6-1.6" /></>,
  qr: <><rect x="3.5" y="3.5" width="6" height="6" rx="1.5" /><rect x="14.5" y="3.5" width="6" height="6" rx="1.5" /><rect x="3.5" y="14.5" width="6" height="6" rx="1.5" /><path d="M14.5 14.5h2.5v2.5h-2.5z" /><path d="M20.5 20.5h-3" /><path d="M20.5 14.5v3" /></>,
  alert: <><path d="M12 4.5l8.5 15h-17z" /><path d="M12 10v4" /><path d="M12 16.8v.2" /></>,
  swap: <><path d="M4 8.5h13" /><path d="M13.5 5L17 8.5 13.5 12" /><path d="M20 15.5H7" /><path d="M10.5 12L7 15.5 10.5 19" /></>,
};

export function Icon({
  name,
  size = 20,
  className = "",
  filled = false,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name] ?? PATHS.grid}
    </svg>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  full?: boolean;
  iconRight?: string;
};

export function Button({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
  full,
  iconRight,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-[transform,background-color,color,border-color] duration-150 active:translate-y-[2px] disabled:opacity-50 disabled:pointer-events-none rounded-full";
  const sizes = {
    sm: "text-[13px] px-3.5 py-2",
    md: "text-[14px] px-5 py-2.5",
    lg: "text-[15px] px-6 py-3.5",
  }[size];
  const variants = {
    primary: "bg-accent text-onaccent hover:brightness-[1.06] hard-sm",
    outline: "border border-ink/25 text-ink hover:border-ink/60",
    ghost: "text-ink2 hover:text-ink",
    dark: "bg-ink text-ground hover:opacity-90",
  }[variant];
  const cls = `${base} ${sizes} ${variants} ${full ? "w-full" : ""} ${className}`;
  const inner = (
    <>
      {children}
      {iconRight ? <Icon name={iconRight} size={16} /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ atoms */

export function Tag({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "positive" | "quiet";
  className?: string;
}) {
  const tones = {
    default: "bg-ink/8 text-ink2",
    accent: "bg-accent/20 text-accentx",
    positive: "bg-positive/15 text-positive",
    quiet: "bg-transparent text-ink3 border border-rule",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-medium ${tones} ${className}`}
    >
      {children}
    </span>
  );
}

export function VerifiedBadge({ label = "Verified student" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11.5px] font-bold text-accentx">
      <Icon name="badge" size={13} filled />
      {label}
    </span>
  );
}

export function MatchPill({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span
      className={`figure inline-block rounded-full bg-accent font-bold text-onaccent ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"
      }`}
    >
      {value}%
    </span>
  );
}

const STAGE_TONE: Record<AppStage, string> = {
  Applied: "bg-ink/10 text-ink2",
  Accepted: "bg-[#0b6bd4]/12 text-[#0b6bd4] dark:bg-[#7cc4ff]/20 dark:text-[#9ad4ff]",
  "In progress": "bg-accent/20 text-accentx",
  Submitted: "bg-[#6b3fc4]/12 text-[#5b2fb8] dark:bg-[#c9a6ff]/20 dark:text-[#d7bcff]",
  Completed: "bg-positive/15 text-positive",
  Paid: "bg-positive/25 text-positive",
};

export function StageBadge({ stage }: { stage: AppStage }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STAGE_TONE[stage]}`}>
      {stage}
    </span>
  );
}

export function Money({
  amount,
  currency = "USDC",
  className = "",
}: {
  amount: number;
  currency?: string;
  className?: string;
}) {
  const negative = amount < 0;
  return (
    <span className={`figure font-semibold ${negative ? "text-negative" : ""} ${className}`}>
      {negative ? "−" : ""}
      {Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
      <span className="ml-1 text-[0.72em] font-medium">{currency}</span>
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h2 className="display-tight text-[24px] sm:text-[28px]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label ? (
        <div className="mb-2 flex justify-between text-[12px] text-ink3">
          <span>{label}</span>
          <span className="figure">{value}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(value) ? "text-accentx" : "text-ink3/50"}>
          <Icon name="star" size={size} filled />
        </span>
      ))}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="tagshape border border-dashed border-rule bg-raised/40 p-8 text-center">
      <div className="display-tight mx-auto mb-2 max-w-[30ch] text-[20px]">{title}</div>
      <p className="mx-auto mb-5 max-w-[44ch] text-[14px] text-ink2">{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export function Modal({
  open,
  onClose,
  children,
  wide = false,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    const dialog = dialogRef.current;
    // Focus the first focusable element inside, else the dialog itself —
    // a keyboard user lands IN the dialog, not on the page behind it.
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusables?.[0] ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialog) return;
      // Tab trap: cycle focus inside the dialog.
      const items = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!items.length) { e.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Focus returns to the element that opened the dialog.
      (restoreRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`settle relative z-10 max-h-[92vh] w-full overflow-y-auto overscroll-contain bg-raised p-6 shadow-2xl sm:m-6 sm:rounded-[24px] rounded-t-[24px] ${
          wide ? "sm:max-w-[860px]" : "sm:max-w-[560px]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
