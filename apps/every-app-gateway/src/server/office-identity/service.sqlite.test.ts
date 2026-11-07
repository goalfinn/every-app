import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import {
  createTestDb,
  seedMember,
  seedOrganization,
  type TestDb,
} from "@/test/sqlite-db";
import { identityStatus, serveIdentity, type IdentityEnv } from "./service";
const key = "a".repeat(48);
let db: TestDb, env: IdentityEnv, memberId: string;
async function sql(query: string, args: (string | number)[] = []) {
  return db.$client.execute({ sql: query, args });
}
function request(path: string, body?: unknown, token = key) {
  return new Request("https://office.goalfinn.com/api/identity/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function credentials(password = "correct-password") {
  return {
    memberId,
    address: "kevin@pilot.iloveohio.us",
    password,
    source: { protocol: "imap", ip: "2001:db8::1" },
  };
}
beforeEach(async () => {
  db = await createTestDb();
  const org = await seedOrganization(db);
  memberId = await seedMember(db, { organizationId: org });
  await sql(
    "INSERT INTO office_identity_members(user_id,kind,mail_clients_allowed) VALUES (?,'person',1)",
    [memberId],
  );
  await sql(
    "INSERT INTO accounts(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('credential',?,'credential',?,?,0,0)",
    [memberId, memberId, await hashPassword("correct-password")],
  );
  const digest = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
  ).toString("hex");
  const d1 = {
    prepare(query: string) {
      let args: (string | number)[] = [];
      return {
        bind(...values: (string | number)[]) {
          args = values;
          return this;
        },
        async first() {
          return (await sql(query, args)).rows[0] ?? null;
        },
      };
    },
  } as unknown as D1Database;
  env = {
    DB: d1,
    OFFICE_IDENTITY_ENABLED: "true",
    OFFICE_IDENTITY_ORGANIZATION_ID: org,
    OFFICE_IDENTITY_SERVICE_KEYS: JSON.stringify([
      { service: "mailflare", sha256: digest },
    ]),
    AUTH_RATE_LIMIT_IP: { limit: async () => ({ success: true }) },
    AUTH_RATE_LIMIT_ACCOUNT: { limit: async () => ({ success: true }) },
  };
});
describe("Office identity against migrated SQLite", () => {
  it("authenticates the normal credential and returns the stable subject", async () => {
    const r = await serveIdentity(
      request("password-check", credentials()),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      memberId,
      status: "active",
      kind: "person",
      sessionVersion: 2,
    });
  });
  it("denies wrong passwords and untrusted services", async () => {
    expect(
      (
        await serveIdentity(
          request("password-check", credentials("wrong")),
          env,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await serveIdentity(
          request("password-check", credentials(), "b".repeat(48)),
          env,
        )
      ).status,
    ).toBe(401);
  });
  it("fails closed while disabled or when limits are unavailable", async () => {
    expect(
      (
        await serveIdentity(request("password-check", credentials()), {
          ...env,
          OFFICE_IDENTITY_ENABLED: "false",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await serveIdentity(request("password-check", credentials()), {
          ...env,
          AUTH_RATE_LIMIT_IP: undefined,
        })
      ).status,
    ).toBe(503);
  });
  it("counts limits before password verification", async () => {
    env.AUTH_RATE_LIMIT_ACCOUNT = { limit: async () => ({ success: false }) };
    expect(
      (await serveIdentity(request("password-check", credentials()), env))
        .status,
    ).toBe(429);
  });
  it("invalidates prior versions across suspension and reactivation", async () => {
    const before = await identityStatus(env, memberId);
    await sql("UPDATE users SET status='suspended' WHERE id=?", [memberId]);
    expect((await identityStatus(env, memberId))?.status).toBe("deactivated");
    await sql("UPDATE users SET status='active' WHERE id=?", [memberId]);
    expect((await identityStatus(env, memberId))?.sessionVersion).toBe(
      before!.sessionVersion + 2,
    );
  });
  it("invalidates passwords and client permission changes", async () => {
    const before = await identityStatus(env, memberId);
    await sql("UPDATE accounts SET password=? WHERE user_id=?", [
      await hashPassword("new-password"),
      memberId,
    ]);
    expect((await identityStatus(env, memberId))?.sessionVersion).toBe(
      before!.sessionVersion + 1,
    );
    expect(
      (await serveIdentity(request("password-check", credentials()), env))
        .status,
    ).toBe(401);
    await sql(
      "UPDATE office_identity_members SET mail_clients_allowed=0 WHERE user_id=?",
      [memberId],
    );
    expect(
      (
        await serveIdentity(
          request("password-check", credentials("new-password")),
          env,
        )
      ).status,
    ).toBe(401);
  });
  it("denies removed members and non-person principals", async () => {
    await sql(
      "UPDATE office_identity_members SET kind='agent' WHERE user_id=?",
      [memberId],
    );
    expect(
      (await serveIdentity(request("password-check", credentials()), env))
        .status,
    ).toBe(401);
    await sql("DELETE FROM members WHERE user_id=?", [memberId]);
    expect((await identityStatus(env, memberId))?.status).toBe("deactivated");
  });
  it("rejects oversized payloads", async () => {
    expect(
      (
        await serveIdentity(
          request("password-check", {
            ...credentials(),
            password: "x".repeat(5000),
          }),
          env,
        )
      ).status,
    ).toBe(413);
  });
});
