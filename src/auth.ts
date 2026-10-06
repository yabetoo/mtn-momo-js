import { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { createClient, withErrorHandling, withObservability } from "./client";
import { AccessToken, Config, Product, TokenStore } from "./common";

/** Used when MTN answers without a usable `expires_in`. */
const FALLBACK_TTL_SECONDS = 600;

export interface TokenProvider {
  get(): Promise<string>;
  invalidate(): Promise<void>;
}

export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  public async get(key: string): Promise<string | undefined> {
    const entry = this.tokens.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.tokens.delete(key);
      return undefined;
    }
    return entry.token;
  }

  public async set(key: string, token: string, ttlSeconds: number): Promise<void> {
    this.tokens.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  public async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }
}

export function tokenCacheKey(product: Product, config: Config): string {
  return `mtn-momo:${product}:${config.environment || "sandbox"}:${config.userId}`;
}

/** Margin of one minute so a token is never sent in its last seconds. */
export function tokenTtl(expiresIn: unknown): number {
  return typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
    ? Math.max(60, Math.floor(expiresIn) - 60)
    : FALLBACK_TTL_SECONDS;
}

export function authorize(
  product: Product,
  config: Config,
  client: AxiosInstance = withErrorHandling(withObservability(createClient(config), product, config.onEvent))
): Promise<AccessToken> {
  const basic = Buffer.from(`${config.userId}:${config.userSecret}`).toString("base64");
  return client
    .post<AccessToken>(`/${product}/token/`, null, { headers: { Authorization: `Basic ${basic}` } })
    .then(response => response.data);
}

export function createTokenProvider(
  product: Product,
  config: Config,
  store: TokenStore,
  mint: () => Promise<AccessToken> = () => authorize(product, config)
): TokenProvider {
  const key = tokenCacheKey(product, config);
  let inflight: Promise<string> | undefined;

  // The store is a cache, never a dependency: a store outage must not stop payments.
  const safely = async <T>(operation: "get" | "set" | "delete", run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      try {
        config.onEvent?.({ type: "token_store_error", product, operation, error });
      } catch {
        // ignored, like any hook failure
      }
      return undefined;
    }
  };

  const load = async (): Promise<string> => {
    const cached = await safely("get", () => store.get(key));
    if (cached) {
      return cached;
    }
    const { access_token, expires_in } = await mint();
    await safely("set", () => store.set(key, access_token, tokenTtl(expires_in)));
    return access_token;
  };

  return {
    get() {
      inflight = inflight || load().finally(() => (inflight = undefined));
      return inflight;
    },
    async invalidate() {
      await safely("delete", () => store.delete(key));
    }
  };
}

type RetriableConfig = InternalAxiosRequestConfig & { momoRetried?: boolean };

/**
 * Bearer on every product call, and ONE retry after a 401 with a fresh token. The retry resends
 * the same request, so the same `X-Reference-Id`: should the first attempt have been accepted,
 * MTN answers 409 RESOURCE_ALREADY_EXIST instead of executing it twice.
 */
export function createAuthClient(provider: TokenProvider, client: AxiosInstance): AxiosInstance {
  client.interceptors.request.use(async (request: InternalAxiosRequestConfig) => {
    request.headers.set("Authorization", `Bearer ${await provider.get()}`);
    return request;
  });

  client.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const config = error?.config as RetriableConfig | undefined;
      if (error?.response?.status !== 401 || !config || config.momoRetried) {
        throw error;
      }
      await provider.invalidate();
      config.momoRetried = true;
      return client.request(config);
    }
  );

  return client;
}
