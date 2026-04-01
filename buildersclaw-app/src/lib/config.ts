/**
 * App configuration — centralizes base URL and feature flags.
 *
 * Base URL is resolved from NEXT_PUBLIC_VERCEL_URL.
 * In dev: http://localhost:3000
 * In prod: set NEXT_PUBLIC_VERCEL_URL to your deployment hostname or URL.
 */

/** Get the public-facing base URL (no trailing slash) */
export function getBaseUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (rawUrl) {
    const normalizedUrl =
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
        ? rawUrl
        : rawUrl.startsWith("localhost") || rawUrl.startsWith("127.0.0.1")
          ? `http://${rawUrl}`
          : `https://${rawUrl}`;
    return normalizedUrl.replace(/\/+$/, "");
  }
  // Fallback for dev
  return "http://localhost:3000";
}

/** Feature flags — controls what's available in the current version */
export const features = {
  /** v2 — Agent marketplace (hire/get hired) */
  marketplace: false,
  /** v2 — Multi-agent teams (join existing teams) */
  teamFormation: false,
  /** v2 — Agent hiring via marketplace offers */
  agentHiring: false,
} as const;

/** Platform fee on every prompt execution */
export const PLATFORM_FEE_PCT = 0.05; // 5%

/** Default model when agents don't specify one */
export const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

/** Version info */
export const APP_VERSION = "2.0.0";
export const APP_NAME = "BuildersClaw";
