# Office identity pilot

This additive fork is based on the deployed gateway rc.10. Existing MCP OAuth
clients and grants stay separate from Office OIDC clients.

OFFICE_IDENTITY_ENABLED defaults off. Activation requires the gateway's exact
organization ID, explicitly enrolled office_identity_members, an administratively
seeded confidential OIDC client with PKCE and exact callback
https://mail.office.goalfinn.com/api/auth/office/callback, and scoped service keys.
The new client/resource administration privileges are denied; no public registration
or browser client-management surface is enabled.

Service keys are random base64url bearer secrets (43–128 characters). The gateway
stores only SHA256 lowercase hex digests in OFFICE_IDENTITY_SERVICE_KEYS, a JSON
array of {service,sha256}, with service mailflare, office, or cmdb. Only mailflare
may call password-check. Status checks use the same authenticated service boundary.
No service credential or user password belongs in logs or source.

POST /api/identity/v1/password-check verifies the existing Better Auth credential
hash for the explicitly bound member. Mailflare authenticates the mailbox-to-member
mapping; the gateway never infers it from the address. Native clients require an
active person, explicit mail_clients_allowed, and both IP and account rate limiters.
This native opt-in is independent of whether browser password login is displayed.

OIDC uses the fixed issuer https://office.goalfinn.com, RS256 and five-minute ID
tokens, verified-email and person requirements, and current office_sv. Discovery
is at /.well-known/openid-configuration. The new provider's remaining endpoints
are beneath /api/auth. Mailflare must validate status/version on each session use.

Migration 0023 only adds tables, indexes and triggers. Password changes, account
status/ban changes, membership removal/moves, organization status changes and
native-client policy changes increment the member version. Deleting any unexpired
central browser session also invalidates downstream Mail sessions for that member;
expired-session cleanup does not. The pilot deliberately uses member-wide revocation
because downstream sessions are not yet bound to a specific browser-session ID.

Before activation: retain current Worker version and binding metadata; apply the
additive migration; deploy with the feature off; confirm legacy gateway/auth/MCP
health; provision exact client/subject bindings and service credentials; verify
Access permits the required server-to-server paths without weakening browser
policy; activate and exercise portal→mail and native password/revocation flows.
A local suite or security scan is not proof of deployed end-to-end acceptance.

### Portal pilot self-read credential

The interim portal still uses the existing MCP OAuth client. Each new consent creates a new connection, so a grant keyed to one connection is not durable. The gateway aliases the signed actor only for the registered portal client's `access_my_access` and `access_my_mailboxes` calls to the exact Office pilot Worker. It verifies the stored client ID, redirect, user, organization, connection status and active person enrollment. The stable subject is `credential:oauth:office-portal-<user-id>` and requires an explicit Office viewer grant. Other calls retain their original credential. Signed tool-call binding prevents reuse for other operations, while gateway audit retains the real connection ID. Lookup failure refuses the call without invoking Office.

This bounded pilot compatibility path does not enable person-only administrative actions through MCP or replace the planned portal resource-token integration.
