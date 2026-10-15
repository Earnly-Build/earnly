import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";

const appUrl = process.env.APP_URL || "https://earnly.vercel.app";
const metadataBaseUrl = appUrl.startsWith("http://") || appUrl.startsWith("https://") ? appUrl : `https://${appUrl}`;

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "Earnly — earn while you learn",
  description:
    "Verified students discover paid tasks, jobs and internships, get paid in USDC, and graduate with a record of real work instead of an empty CV.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

/** Applies the stored theme before first paint so there is no flash. */
const THEME_BOOT = `try{var s=localStorage.getItem("earnly:v3");if(s){var t=JSON.parse(s).theme;if(t)document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
