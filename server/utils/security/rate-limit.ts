import type { H3Event } from "h3";
import { getRequestHeader } from "h3";

/**
 * Simple in-process rate limiter for destructive account endpoints.
 *
 * Tracks attempts per key (IP or user-id) using a sliding window. This is an
 * application-level safety net for edge cases; it complements — and does not
 * replace — infrastructure-level throttling on Vercel or the Supabase edge.
 *
 * Limitations: state is per-process and resets on cold starts. For a
 * distributed deployment upgrade to a shared store (e.g. Redis / KV) when the
 * project grows beyond a single serverless instance.
 */

interface WindowEntry {
  count: number;
  windowStart: number;
}

const _store = new Map<string, WindowEntry>();

/** Burst limit per key per window. */
const MAX_REQUESTS = 5;
/** Sliding window duration in milliseconds. */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Asserts that the request rate for the given key is within the allowed burst
 * limit. Throws `429 Too Many Requests` when the limit is exceeded.
 *
 * @param key - A stable, non-sensitive identifier, e.g. userId or IP address.
 */
export function assertRateLimit(event: H3Event, key: string): void {
  const now = Date.now();
  const entry = _store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    _store.set(key, { count: 1, windowStart: now });
    return;
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    throw createError({
      statusCode: 429,
      statusMessage: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    });
  }
}

/**
 * Derives a rate-limit key from the request. Prefers the client IP address
 * forwarded by the edge proxy.
 */
export function getRateLimitKey(event: H3Event): string {
  const forwarded = getRequestHeader(event, "x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  // Fallback: use the raw socket address. In local dev this is "::1".
  return event.node?.req?.socket?.remoteAddress ?? "unknown";
}
