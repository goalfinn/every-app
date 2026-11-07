import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  identityStatus,
  type IdentityEnv,
} from "../server/office-identity/service";
/** Separate OIDC endpoints; existing MCP OAuth grants and clients are unchanged. */
export function officeIdentityPlugins(env: IdentityEnv) {
  return [
    jwt({
      jwt: { issuer: "https://office.goalfinn.com", expirationTime: "5m" },
      jwks: { keyPairConfig: { alg: "RS256" } },
    }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/identity/consent",
      schema: {
        oauthClient: { modelName: "officeOidcClient" },
        oauthResource: { modelName: "officeOidcResource" },
        oauthClientResource: { modelName: "officeOidcClientResource" },
        oauthRefreshToken: { modelName: "officeOidcRefreshToken" },
        oauthAccessToken: { modelName: "officeOidcAccessToken" },
        oauthConsent: { modelName: "officeOidcConsent" },
        oauthClientAssertion: { modelName: "officeOidcClientAssertion" },
      },
      clientPrivileges: () => false,
      resourcePrivileges: () => false,
      scopes: ["openid", "email", "profile"],
      grantTypes: ["authorization_code"],
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      idTokenExpiresIn: 300,
      accessTokenExpiresIn: 300,
      customIdTokenClaims: async ({ user }) => {
        if (env.OFFICE_IDENTITY_ENABLED !== "true")
          throw Error("Identity unavailable");
        const member = await identityStatus(env, user.id);
        if (
          !member ||
          member.kind !== "person" ||
          member.status !== "active" ||
          !user.emailVerified
        )
          throw Error("Identity unavailable");
        return {
          office_kind: "person",
          office_sv: member.sessionVersion,
          email: user.email,
          email_verified: true,
        };
      },
    }),
  ] as const;
}
