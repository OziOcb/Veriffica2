import { getRequestHeader, getRequestHost } from "h3";
import type { H3Event } from "h3";

/**
 * Validates the `Origin` or `Referer` header of a cookie-authenticated
 * mutation request to protect against cross-site request forgery.
 *
 * In development (`NODE_ENV !== "production"`) the check is skipped so that
 * Postman / curl calls from localhost work without setting custom headers.
 *
 * Throws `403 Forbidden` when the origin cannot be verified against the
 * server's own host.
 */
export function assertMutationOrigin(event: H3Event): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const origin = getRequestHeader(event, "origin");
  const referer = getRequestHeader(event, "referer");

  // Derive expected host from the incoming request so it works across
  // environments without an extra runtime config entry.
  const host = getRequestHost(event, { xForwardedHost: true });

  const candidate = origin ?? referer ?? "";

  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    // Non-parseable origin / missing header is treated as a mismatch.
    candidateHost = "";
  }

  if (candidateHost !== host) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
      message: "Origin validation failed.",
    });
  }
}
