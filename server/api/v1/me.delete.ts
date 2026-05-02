import { randomUUID } from "node:crypto";
import { deleteCookie, getHeader } from "h3";
import { parseCookieHeader } from "@supabase/ssr";
import { DeleteCurrentUserCommandSchema } from "../../../shared/contracts/delete-current-user";
import { getRequiredUserId } from "../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../utils/security/assert-mutation-origin";
import {
  assertRateLimit,
  getRateLimitKey,
} from "../../utils/security/rate-limit";
import { deleteCurrentUserAccount } from "../../utils/services/delete-current-user-account";
import type { DeleteCurrentUserResponseDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<DeleteCurrentUserResponseDto> => {
    const config = useRuntimeConfig(event);
    const requestId = randomUUID();

    // ── Security guards (run before any privileged operation) ──────────────
    assertMutationOrigin(event);
    assertRateLimit(event, getRateLimitKey(event));

    // ── Auth: resolve current user from SSR session ────────────────────────
    // userId is always sourced from the server-side session, never from the
    // request body or params.
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    // readValidatedBody throws 400 automatically on ZodError.
    await readValidatedBody(event, (body) =>
      DeleteCurrentUserCommandSchema.parse(body),
    );

    // ── Domain operation ───────────────────────────────────────────────────
    await deleteCurrentUserAccount(event, userId, requestId);

    // ── Clear SSR session cookies ──────────────────────────────────────────
    // After deleting the auth.users row the client must not retain a valid
    // session. We expire all cookies whose names share the Supabase cookie
    // prefix so the response is self-contained and the caller can reliably
    // set `signedOut: true`.
    const cookiePrefix = config.public.supabase.cookiePrefix as string;
    const rawCookieHeader = getHeader(event, "cookie") ?? "";
    const allCookies = parseCookieHeader(rawCookieHeader);

    for (const { name } of allCookies) {
      if (name.startsWith(cookiePrefix)) {
        deleteCookie(event, name, {
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
    }

    // ── Response ───────────────────────────────────────────────────────────
    return {
      data: {
        deleted: true,
        signedOut: true,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
