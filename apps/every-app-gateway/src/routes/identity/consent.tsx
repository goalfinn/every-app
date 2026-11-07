import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/client/auth-client";
import { identityConsentContext } from "@/serverFunctions/identityConsent";
export const Route = createFileRoute("/identity/consent")({
  component: Consent,
});
function Consent() {
  const [context, setContext] = useState<{
      name: string;
      query: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    identityConsentContext({ data: { query: window.location.search } }).then(
      (value) => {
        if (mounted) setContext(value);
      },
      () => {
        if (mounted)
          setError(
            "This sign-in link has expired. Open Mail from your portal again.",
          );
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  async function decide(accept: boolean) {
    if (!context) return;
    setBusy(true);
    try {
      const result = await authClient.oauth2.consent({
        accept,
        oauth_query: context.query,
      });
      if (result.error || !result.data?.url) throw Error();
      window.location.assign(result.data.url);
    } catch {
      setError("Sign-in could not finish. Open Mail from your portal again.");
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">
        Continue to {context?.name ?? "your app"}
      </h1>
      <p className="my-4">Share your verified name and email to sign in.</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <button disabled={!context || busy} onClick={() => void decide(true)}>
            Continue
          </button>
          <button
            className="ml-6"
            disabled={!context || busy}
            onClick={() => void decide(false)}
          >
            Cancel
          </button>
        </>
      )}
    </main>
  );
}
