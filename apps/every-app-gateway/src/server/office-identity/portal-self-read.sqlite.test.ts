import { beforeEach, expect, it } from "vitest";
import {
  createTestDb,
  seedMember,
  seedOrganization,
  type TestDb,
} from "@/test/sqlite-db";
import { portalSelfReadActor } from "./portal-self-read";
import type { IdentityEnv } from "./service";
import type { McpPrincipal, ToolBusApp, ToolBusTool } from "@every-app/toolbus";
let db: TestDb,
  env: IdentityEnv,
  user: string,
  org: string,
  principal: McpPrincipal;
const app = {
  appId: "office-mail-pilot",
  audience: "every-kevinarmstro-office-mail-pilot",
} as ToolBusApp;
const tool = { name: "access_my_mailboxes" } as ToolBusTool;
const sql = (sql: string, args: (string | number)[] = []) =>
  db.$client.execute({ sql, args });
beforeEach(async () => {
  db = await createTestDb();
  org = await seedOrganization(db);
  user = await seedMember(db, { organizationId: org });
  await sql(
    "INSERT INTO office_identity_members(user_id,kind) VALUES (?,'person')",
    [user],
  );
  for (const id of ["first", "second"])
    await sql(
      "INSERT INTO mcp_connections(id,user_id,organization_id,client_id,client_name,redirect_uri,redirect_host,app_scope,access,created_at) VALUES (?,?,?,'VofWqvkR-3c2vDqo','portal','https://my.goalfinn.com/auth/callback','my.goalfinn.com','all','read',0)",
      [id, user, org],
    );
  const DB = {
    prepare(query: string) {
      let values: (string | number)[] = [];
      return {
        bind(...args: (string | number)[]) {
          values = args;
          return this;
        },
        async first() {
          return (await sql(query, values)).rows[0] ?? null;
        },
      };
    },
  } as unknown as D1Database;
  env = {
    DB,
    OFFICE_IDENTITY_ENABLED: "true",
    OFFICE_IDENTITY_ORGANIZATION_ID: org,
  } as IdentityEnv;
  principal = {
    userId: user,
    organizationId: org,
    credential: { kind: "oauth", id: "first" },
  } as McpPrincipal;
});
it("two consents use one stable alias for exactly both own reads", async () => {
  const alias = `oauth:office-portal-${user}`;
  expect(await portalSelfReadActor(env, principal, app, tool)).toBe(alias);
  expect(
    await portalSelfReadActor(
      env,
      { ...principal, credential: { kind: "oauth", id: "second" } },
      app,
      { ...tool, name: "access_my_access" },
    ),
  ).toBe(alias);
});
it("preserves other credentials, apps, organizations and operations", async () => {
  for (const [p, a, t] of [
    [{ ...principal, credential: { kind: "pat", id: "first" } }, app, tool],
    [{ ...principal, organizationId: "other" }, app, tool],
    [principal, { ...app, appId: "other" }, tool],
    [principal, { ...app, audience: "other" }, tool],
    [principal, app, { ...tool, name: "access_list" }],
  ] as [McpPrincipal, ToolBusApp, ToolBusTool][])
    expect(await portalSelfReadActor(env, p, a, t)).toBeNull();
});
it.each([
  "client_id='another-client'",
  "redirect_uri='https://evil.example'",
  "revoked_at=1",
  "kind='native'",
])("refuses changed connection %s", async (change) => {
  await sql(`UPDATE mcp_connections SET ${change} WHERE id='first'`);
  expect(await portalSelfReadActor(env, principal, app, tool)).toBeNull();
});
it("refuses a different member, disabled enrollment and inactive person", async () => {
  expect(
    await portalSelfReadActor(
      env,
      { ...principal, userId: "different" },
      app,
      tool,
    ),
  ).toBeNull();
  expect(
    await portalSelfReadActor(
      { ...env, OFFICE_IDENTITY_ENABLED: "false" },
      principal,
      app,
      tool,
    ),
  ).toBeNull();
  await sql("UPDATE office_identity_members SET kind='agent' WHERE user_id=?", [
    user,
  ]);
  expect(await portalSelfReadActor(env, principal, app, tool)).toBeNull();
  await sql(
    "UPDATE office_identity_members SET kind='person' WHERE user_id=?",
    [user],
  );
  await sql("UPDATE users SET status='suspended' WHERE id=?", [user]);
  expect(await portalSelfReadActor(env, principal, app, tool)).toBeNull();
});
