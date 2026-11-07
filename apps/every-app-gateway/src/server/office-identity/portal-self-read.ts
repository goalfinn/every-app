import type { McpPrincipal, ToolBusApp, ToolBusTool } from "@every-app/toolbus";
import { identityStatus, type IdentityEnv } from "./service";
/** Pilot-only stable credential for the registered portal's two own-record reads.
 * Gateway authentication, app scope and audit use the real connection. The signed
 * tool-call name confines the alias, and Office still requires its explicit grant.
 */
export async function portalSelfReadActor(
  env: IdentityEnv,
  principal: McpPrincipal,
  app: ToolBusApp,
  tool: ToolBusTool,
): Promise<string | null> {
  if (
    env.OFFICE_IDENTITY_ENABLED !== "true" ||
    principal.credential.kind !== "oauth" ||
    principal.organizationId !== env.OFFICE_IDENTITY_ORGANIZATION_ID ||
    app.appId !== "office-mail-pilot" ||
    app.audience !== "every-kevinarmstro-office-mail-pilot" ||
    !["access_my_access", "access_my_mailboxes"].includes(tool.name)
  )
    return null;
  const connection = await env.DB.prepare(
    `SELECT id FROM mcp_connections WHERE id=? AND user_id=? AND organization_id=? AND client_id=? AND redirect_uri=? AND revoked_at IS NULL AND kind='mcp'`,
  )
    .bind(
      principal.credential.id,
      principal.userId,
      principal.organizationId,
      "VofWqvkR-3c2vDqo",
      "https://my.goalfinn.com/auth/callback",
    )
    .first();
  if (!connection) return null;
  const person = await identityStatus(env, principal.userId);
  if (person?.kind !== "person" || person.status !== "active") return null;
  return `oauth:office-portal-${principal.userId}`;
}
