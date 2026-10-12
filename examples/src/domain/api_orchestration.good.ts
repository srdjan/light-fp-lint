// Intermediate API example (after): the domain returns an HTTP plan instead of performing IO.
// Benefits:
// - Request builders return data rather than calling an adapter directly.
// - Result types make the error cases explicit in the returned plan.
// - The Http effect is branded so the call site knows it performs IO.
// - Auto-fix friendly: running `deno lint --fix` on this file is a no-op because it already respects the rule hints.

import {
  brandWithCapability,
  causeMessage,
  err,
  handleThrow,
  map,
  ok,
  type Result,
  type WithCapability,
} from "./shared/primitives.ts";

type HttpMethod = "GET" | "POST";

export type HttpRequest = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
};

export type HttpResponse = {
  readonly status: number;
  readonly json: () => Promise<unknown>;
};

export type HttpCapability = {
  readonly request: (input: HttpRequest) => Promise<HttpResponse>;
};

export type ApiError =
  | { readonly type: "Unauthorized"; readonly message: string }
  | { readonly type: "Network"; readonly message: string }
  | { readonly type: "UnexpectedResponse"; readonly message: string };

export type HttpEffect = WithCapability<
  "Http",
  HttpCapability,
  Result<ApiError, HttpResponse>
>;

const bearer = (token: string): string => `Bearer ${token}`;

const networkError = (cause: unknown): ApiError => ({
  type: "Network",
  message: causeMessage(cause, "Network request failed"),
});

const buildProfileRequest = (token: string): Result<ApiError, HttpRequest> =>
  token.trim().length === 0
    ? err({ type: "Unauthorized", message: "Missing token" })
    : ok({
      method: "GET",
      path: "/me",
      headers: { authorization: bearer(token) },
    });

const buildAuditRequest = (
  token: string,
  event: Readonly<Record<string, unknown>>,
  issuedAt: number,
): Result<ApiError, HttpRequest> =>
  token.trim().length === 0
    ? err({ type: "Unauthorized", message: "Missing token" })
    : ok({
      method: "POST",
      path: "/audit",
      headers: {
        authorization: bearer(token),
        "content-type": "application/json",
      },
      body: { ...event, issuedAt },
    });

export const planProfileFetch = (
  cap: HttpCapability,
  token: string,
): Result<ApiError, HttpEffect> =>
  map(
    buildProfileRequest(token),
    (request) =>
      brandWithCapability("Http", cap, async (http) => {
        const received = await handleThrow(
          () => http.request(request),
          networkError,
        );
        if (received._tag === "Err") return received;
        const response = received.value;
        if (response.status === 401) {
          return err({ type: "Unauthorized", message: "Token revoked" });
        }
        return ok(response);
      }),
  );

export const planAuditPost = (
  cap: HttpCapability,
  token: string,
  event: Readonly<Record<string, unknown>>,
  issuedAt: number,
): Result<ApiError, HttpEffect> =>
  map(
    buildAuditRequest(token, event, issuedAt),
    (request) =>
      brandWithCapability("Http", cap, async (http) => {
        // handleThrow is the prelude's boundary: the throwing call goes in, a
        // Result comes out, and this domain module does not catch the exception.
        const sent = await handleThrow(
          () => http.request(request),
          networkError,
        );
        if (sent._tag === "Err") return sent;
        if (sent.value.status >= 400) {
          return err({
            type: "UnexpectedResponse",
            message: `Adapter returned ${sent.value.status}`,
          });
        }
        return ok(sent.value);
      }),
  );
