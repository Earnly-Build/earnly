import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

/**
 * Server-side gate for every /app/* page.
 *
 * Before this, the only auth check was client-side (AppShell's
 * useEffect redirect + render gate) — page payloads shipped to anyone
 * who requested them without JavaScript. This layout resolves the
 * session on the server BEFORE rendering children, mirroring the
 * AppShell conditions exactly: no session → /signin, unverified →
 * /verify, not onboarded → /onboarding. The client-side check stays
 * as the progressive-enhancement fallback.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/signin");
  }
  const profile = session.profile;
  if (!profile || profile.verification !== "verified") {
    redirect("/verify");
  }
  if (!profile.onboarded) {
    redirect("/onboarding");
  }
  return <AppShell>{children}</AppShell>;
}
