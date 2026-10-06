import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { GlobalConfig, MomoEvent, SubscriptionConfig } from "./common";
import { handleError } from "./errors";

export const DEFAULT_TIMEOUT_MS = 30_000;

type TimedConfig = InternalAxiosRequestConfig & { momoStartedAt?: number };

export function createClient(
  config: SubscriptionConfig & GlobalConfig,
  client: AxiosInstance = axios.create()
): AxiosInstance {
  client.defaults.baseURL = config.baseUrl;
  client.defaults.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
  Object.assign(client.defaults.headers.common, {
    "Ocp-Apim-Subscription-Key": config.primaryKey,
    "X-Target-Environment": config.environment || "sandbox"
  });
  return client;
}

/** Registered last: later response interceptors would see a typed error instead of the axios one. */
export function withErrorHandling(client: AxiosInstance): AxiosInstance {
  client.interceptors.response.use(
    response => response,
    error => Promise.reject(handleError(error))
  );
  return client;
}

export function withObservability(
  client: AxiosInstance,
  product: Extract<MomoEvent, { type: "response" }>["product"],
  onEvent?: GlobalConfig["onEvent"]
): AxiosInstance {
  if (!onEvent) {
    return client;
  }

  // A failed token mint reaches this client's error path too; it was already reported by the mint's own client.
  const sent = new WeakSet<object>();

  client.interceptors.request.use((request: TimedConfig) => {
    request.momoStartedAt = Date.now();
    sent.add(request);
    return request;
  });

  const emit = (config: TimedConfig | undefined, status?: number, errorCode?: string) => {
    try {
      onEvent({
        type: "response",
        product,
        method: (config?.method ?? "get").toUpperCase(),
        route: toRoute(config?.url ?? ""),
        status,
        durationMs: config?.momoStartedAt ? Date.now() - config.momoStartedAt : 0,
        errorCode
      });
    } catch {
      // A broken hook must never break a payment.
    }
  };

  client.interceptors.response.use(
    (response: AxiosResponse) => {
      emit(response.config, response.status);
      return response;
    },
    (error: AxiosError<{ code?: string }>) => {
      if (error?.config && sent.has(error.config)) {
        emit(error.config, error.response?.status, error.response?.data?.code ?? error.code);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/collection/v1_0/accountholder/msisdn/242061234567/active` → `…/msisdn/{id}/active`. */
export function toRoute(url: string): string {
  return url
    .split("?")[0]
    .replace(UUID, "{referenceId}")
    .replace(/\/accountholder\/([^/]+)\/[^/]+/i, "/accountholder/$1/{id}")
    .replace(/\/apiuser\/[^/]+/i, "/apiuser/{userId}");
}
