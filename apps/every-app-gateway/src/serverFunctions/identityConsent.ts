import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@/auth";
export const identityConsentContext = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ query: z.string().max(16384) }).parse(data),
  )
  .handler(async ({ data }) => {
    if (env.OFFICE_IDENTITY_ENABLED !== "true")
      throw Error("Identity unavailable");
    const params = new URLSearchParams(data.query),
      names = new Set(params.getAll("ba_param")),
      signed = new URLSearchParams();
    for (const [key, value] of params)
      if (key === "sig" || key === "ba_param" || names.has(key))
        signed.append(key, value);
    if (
      !(await verifyOAuthQueryParams(
        signed.toString(),
        (await auth.$context).secret,
      ))
    )
      throw Error("Invalid sign-in request");
    const clientId = signed.get("client_id");
    if (!clientId) throw Error("Invalid sign-in request");
    const client = await auth.api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: getRequest().headers,
    });
    return {
      name: client.client_name ?? "Office app",
      query: signed.toString(),
    };
  });
