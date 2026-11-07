import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { clientAddressKey } from "../auth-rate-limit";
export interface IdentityEnv {
  DB: D1Database;
  OFFICE_IDENTITY_ENABLED?: string;
  OFFICE_IDENTITY_ORGANIZATION_ID?: string;
  OFFICE_IDENTITY_SERVICE_KEYS?: string;
  AUTH_RATE_LIMIT_IP?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  AUTH_RATE_LIMIT_ACCOUNT?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}
const serviceKeys = z
  .array(
    z.object({
      service: z.enum(["mailflare", "office", "cmdb"]),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .max(10);
const passwordInput = z
  .object({
    memberId: z.string().min(1).max(200),
    address: z.email().max(254),
    password: z.string().min(1).max(1024),
    source: z
      .object({
        protocol: z.enum(["imap", "smtp", "caldav"]),
        ip: z.union([z.ipv4(), z.ipv6()]),
      })
      .strict(),
  })
  .strict();
async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
function same(a: string, b: string) {
  let n = a.length ^ b.length;
  for (let i = 0; i < 64; i++)
    n |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return n === 0;
}
async function service(env: IdentityEnv, request: Request) {
  const bearer = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];
  if (!bearer) return null;
  const configured = serviceKeys.safeParse(
    JSON.parse(env.OFFICE_IDENTITY_SERVICE_KEYS ?? "[]"),
  );
  if (!configured.success) return null;
  const hash = await digest(bearer);
  return (
    configured.data.find((item) => same(item.sha256, hash))?.service ?? null
  );
}
export async function identityStatus(env: IdentityEnv, memberId: string) {
  if (!env.OFFICE_IDENTITY_ORGANIZATION_ID) return null;
  return env.DB.prepare(
    `SELECT i.user_id AS memberId,i.kind,i.session_version AS sessionVersion,i.mail_clients_allowed AS mailClientsAllowed,
 CASE WHEN u.status='active' AND coalesce(u.banned,0)=0 AND o.status='active' AND m.id IS NOT NULL THEN 'active' ELSE 'deactivated' END AS status
 FROM office_identity_members i JOIN users u ON u.id=i.user_id
 LEFT JOIN members m ON m.user_id=u.id AND m.organization_id=? LEFT JOIN organizations o ON o.id=m.organization_id WHERE i.user_id=?`,
  )
    .bind(env.OFFICE_IDENTITY_ORGANIZATION_ID, memberId)
    .first<{
      memberId: string;
      kind: string;
      sessionVersion: number;
      mailClientsAllowed: number;
      status: string;
    }>();
}
function answer(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function serveIdentity(
  request: Request,
  env: IdentityEnv,
): Promise<Response> {
  if (env.OFFICE_IDENTITY_ENABLED !== "true")
    return answer({ error: "not_found" }, 404);
  try {
    const caller = await service(env, request);
    if (!caller) return answer({ error: "unauthorized" }, 401);
    const url = new URL(request.url),
      match =
        /^\/api\/identity\/v1\/members\/([A-Za-z0-9_-]{1,200})\/status$/.exec(
          url.pathname,
        );
    if (match && request.method === "GET") {
      const member = await identityStatus(env, match[1]!);
      if (!member)
        return answer({
          status: "deactivated",
          kind: "person",
          sessionVersion: 0,
        });
      return answer({
        status: member.status,
        kind: member.kind,
        sessionVersion: member.sessionVersion,
      });
    }
    if (
      url.pathname !== "/api/identity/v1/password-check" ||
      request.method !== "POST"
    )
      return answer({ error: "not_found" }, 404);
    if (caller !== "mailflare") return answer({ error: "forbidden" }, 403);
    if (!env.AUTH_RATE_LIMIT_IP || !env.AUTH_RATE_LIMIT_ACCOUNT)
      return answer({ error: "unavailable" }, 503);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return answer({ error: "invalid_request" }, 400);
    // Stream-bounded: do not trust Content-Length from the caller.
    const reader = request.body?.getReader();
    if (!reader) return answer({ error: "invalid_request" }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return answer({ error: "invalid_request" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = passwordInput.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    if (!parsed.success) return answer({ error: "invalid_request" }, 400);
    const input = parsed.data;
    // IPv6 clients can vary host bits; count their /64 together.
    const ip = clientAddressKey(input.source.ip);
    const limits = await Promise.all([
      env.AUTH_RATE_LIMIT_IP.limit({
        key: "office-mail-ip:" + (await digest(ip)),
      }),
      env.AUTH_RATE_LIMIT_ACCOUNT.limit({
        key: "office-mail-member:" + (await digest(input.memberId)),
      }),
    ]);
    if (limits.some((result) => !result.success))
      return answer({ error: "rate_limited" }, 429);
    const member = await identityStatus(env, input.memberId);
    if (
      !member ||
      member.kind !== "person" ||
      member.status !== "active" ||
      member.mailClientsAllowed !== 1
    )
      return answer({ error: "invalid_credentials" }, 401);
    const account = await env.DB.prepare(
      "SELECT password FROM accounts WHERE user_id=? AND provider_id='credential'",
    )
      .bind(input.memberId)
      .first<{ password: string | null }>();
    if (
      !account?.password ||
      !(await verifyPassword({
        hash: account.password,
        password: input.password,
      }))
    )
      return answer({ error: "invalid_credentials" }, 401);
    // Recheck after the expensive verifier: no success across a concurrent revoke/password change.
    const fresh = await identityStatus(env, input.memberId);
    if (
      !fresh ||
      fresh.status !== "active" ||
      fresh.kind !== "person" ||
      fresh.mailClientsAllowed !== 1 ||
      fresh.sessionVersion !== member.sessionVersion
    )
      return answer({ error: "invalid_credentials" }, 401);
    return answer({
      memberId: fresh.memberId,
      kind: "person",
      status: "active",
      sessionVersion: fresh.sessionVersion,
    });
  } catch {
    return answer({ error: "unavailable" }, 503);
  }
}
