import type { MetadataRoute } from "next";

function getBaseUrl(): string {
  const raw = process.env.APP_URL || "https://earnly.vercel.app";
  const withProto = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app/",
        "/api/",
        "/signin",
        "/verify",
        "/onboarding",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
