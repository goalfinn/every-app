import { beforeEach, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { createTestDb, type TestDb } from "@/test/sqlite-db";
import * as schema from "@/db/schema";
import { officeIdentityPlugins } from "./office-identity";
import type { IdentityEnv } from "@/server/office-identity/service";
const origin = "https://office.goalfinn.com",
  callback = "https://mail.office.goalfinn.com/api/auth/office/callback";
let listResources: () => Promise<unknown>;
let db: TestDb,
  auth: { handler: (request: Request) => Promise<Response> },
  cookie: string,
  clientId: string,
  clientSecret: string,
  userId: string;
beforeEach(async () => {
  db = await createTestDb();
  const d1 = {
    prepare(sql: string) {
      let args: string[] = [];
      return {
        bind(...values: string[]) {
          args = values;
          return this;
        },
        async first() {
          return (await db.$client.execute({ sql, args })).rows[0] ?? null;
        },
      };
    },
  } as unknown as D1Database;
  const identityEnv: IdentityEnv = {
    DB: d1,
    OFFICE_IDENTITY_ENABLED: "true",
    OFFICE_IDENTITY_ORGANIZATION_ID: "org",
  };
  const instance = betterAuth({
    baseURL: origin,
    secret: "test-secret-that-is-long-enough-for-better-auth",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    emailAndPassword: { enabled: true },
    plugins: [...officeIdentityPlugins(identityEnv)],
  });
  auth = instance;
  listResources = () =>
    instance.api.adminListOAuthResources({ headers: new Headers({ cookie }) });
  const signed = await instance.api.signUpEmail({
    body: {
      email: "person@example.com",
      password: "correct-password",
      name: "Person",
    },
    asResponse: true,
  });
  expect(signed.status).toBe(200);
  const body = (await signed.json()) as { user: { id: string } };
  userId = body.user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  await db.$client.execute({
    sql: "UPDATE users SET email_verified=1 WHERE id=?",
    args: [userId],
  });
  await db.$client.execute(
    "INSERT INTO organizations(id,name,slug,created_at,status) VALUES ('org','Org','org',0,'active')",
  );
  await db.$client.execute({
    sql: "INSERT INTO members(id,user_id,organization_id,role,created_at) VALUES ('member',?,'org','member',0)",
    args: [userId],
  });
  await db.$client.execute({
    sql: "INSERT INTO office_identity_members(user_id,kind) VALUES (?,'person')",
    args: [userId],
  });
  clientId = "mailflare-test";
  clientSecret = "client-secret-for-test-only";
  const hash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(clientSecret),
    ),
  ).toString("base64url");
  await db.insert(schema.officeOidcClients).values({
    id: "test-client",
    clientId,
    clientSecret: hash,
    name: "Mail",
    redirectUris: [callback],
    scopes: ["openid", "email", "profile"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "client_secret_basic",
    requirePKCE: true,
    skipConsent: true,
  });
});
async function authorize(overrides: Record<string, string> = {}) {
  const verifier = "v".repeat(64),
    challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid email profile",
    state: "state-value",
    nonce: "nonce-value",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...overrides,
  });
  const result = await auth.handler(
    new Request(origin + "/api/auth/oauth2/authorize?" + query, {
      headers: { cookie },
    }),
  );
  return { result, verifier };
}
async function exchange(code: string, verifier: string) {
  return auth.handler(
    new Request(origin + "/api/auth/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: callback,
      }),
    }),
  );
}
it("exchanges a PKCE code for a signed stable identity and denies replay", async () => {
  const { result, verifier } = await authorize();
  expect(result.status).toBe(302);
  const location = result.headers.get("location")!;
  expect(location.startsWith(callback)).toBe(true);
  const code = new URL(location).searchParams.get("code")!;
  const token = await exchange(code, verifier);
  expect(token.status).toBe(200);
  const body = (await token.json()) as { id_token: string };
  const jwks = await (
    await auth.handler(new Request(origin + "/api/auth/jwks"))
  ).json();
  const verified = await jwtVerify(
    body.id_token,
    createLocalJWKSet(jwks as JSONWebKeySet),
    {
      issuer: origin,
      audience: clientId,
    },
  );
  expect(verified.payload).toMatchObject({
    sub: userId,
    office_kind: "person",
    office_sv: 1,
    email_verified: true,
    nonce: "nonce-value",
  });
  expect((await exchange(code, verifier)).status).toBe(400);
});
it("rejects an unregistered callback and bad PKCE", async () => {
  const bad = await authorize({
    redirect_uri: "https://evil.example/callback",
  });
  expect(bad.result.headers.get("location") ?? "").not.toContain(
    "evil.example",
  );
  expect(bad.result.headers.get("location") ?? "").not.toContain("code=");
  const { result } = await authorize();
  const code = new URL(result.headers.get("location")!).searchParams.get(
    "code",
  )!;
  expect((await exchange(code, "wrong".repeat(10))).status).toBe(401);
});
it("does not issue identity claims for a deactivated member", async () => {
  const { result, verifier } = await authorize();
  const code = new URL(result.headers.get("location")!).searchParams.get(
    "code",
  )!;
  await db.$client.execute({
    sql: "UPDATE users SET status='suspended' WHERE id=?",
    args: [userId],
  });
  const response = await exchange(code, verifier);
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await response.text()).not.toContain("id_token");
});

it("continues a signed-out browser through normal password sign-in", async () => {
  const verifier = "q".repeat(64);
  const challenge = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  ).toString("base64url");
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid email profile",
    state: "browser-state",
    nonce: "browser-nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const start = await auth.handler(
    new Request(origin + "/api/auth/oauth2/authorize?" + query),
  );
  expect(start.status).toBe(302);
  const login = new URL(start.headers.get("location")!, origin);
  expect(login.pathname).toBe("/sign-in");
  const signed = await auth.handler(
    new Request(origin + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        email: "person@example.com",
        password: "correct-password",
        oauth_query: login.search.slice(1),
      }),
    }),
  );
  expect(signed.status).toBe(200);
  const payload = (await signed.json()) as { redirect: boolean; url: string };
  expect(payload.redirect).toBe(true);
  expect(payload.url.startsWith(callback)).toBe(true);
  const code = new URL(payload.url).searchParams.get("code")!;
  expect((await exchange(code, verifier)).status).toBe(200);
});

it("refuses resource administration by an ordinary signed-in user", async () => {
  await expect(listResources()).rejects.toMatchObject({ statusCode: 401 });
  for (const method of ["GET", "POST"]) {
    const response = await auth.handler(
      new Request(origin + "/api/auth/admin/oauth2/resources", {
        method,
        headers: { cookie, Origin: origin, "Content-Type": "application/json" },
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                identifier: "https://evil.example",
                name: "Unauthorized",
              }),
            }
          : {}),
      }),
    );
    expect(response.status).toBe(404);
  }
});

it("invalidates downstream identity on singular and internal session deletion", async () => {
  const version = async () =>
    Number(
      (
        await db.$client.execute({
          sql: "SELECT session_version FROM office_identity_members WHERE user_id=?",
          args: [userId],
        })
      ).rows[0]!.session_version,
    );
  const original = await version();
  const session = (
    await db.$client.execute({
      sql: "SELECT token FROM sessions WHERE user_id=?",
      args: [userId],
    })
  ).rows[0]!;
  const revoked = await auth.handler(
    new Request(origin + "/api/auth/revoke-session", {
      method: "POST",
      headers: { cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: session.token }),
    }),
  );
  expect(revoked.status).toBe(200);
  expect(await version()).toBe(original + 1);
  await db.$client.execute({
    sql: "INSERT INTO sessions(id,token,user_id,expires_at,created_at,updated_at) VALUES ('internal','internal',?,?,0,0)",
    args: [userId, Date.now() + 60000],
  });
  await db.$client.execute("DELETE FROM sessions WHERE id='internal'");
  expect(await version()).toBe(original + 2);
  await db.$client.execute({
    sql: "INSERT INTO sessions(id,token,user_id,expires_at,created_at,updated_at) VALUES ('expired','expired',?,1,0,0)",
    args: [userId],
  });
  await db.$client.execute("DELETE FROM sessions WHERE id='expired'");
  expect(await version()).toBe(original + 2);
});
