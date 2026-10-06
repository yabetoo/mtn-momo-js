export type Product = "collection" | "disbursement" | "remittance";

export type Config = GlobalConfig & ProductConfig;

export type ProductConfig = SubscriptionConfig & UserConfig;

export interface GlobalConfig {
  /** Host MTN calls back on (`X-Callback-Url` must belong to it). */
  callbackHost?: string;

  /** Gateway base URL, e.g. `https://sandbox.momodeveloper.mtn.com`. Required outside the sandbox. */
  baseUrl?: string;

  /** Value of `X-Target-Environment`: `sandbox`, or the market name MTN gave you (e.g. `mtncongo`). */
  environment?: Environment | string;

  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  timeout?: number;

  /**
   * Where access tokens are cached. Defaults to an in-memory store scoped to this `create()` call.
   * Pass a shared store (Redis…) so every process and client reuses one token per API user.
   */
  tokenStore?: TokenStore;

  /** Observability hook. Never receives URLs with phone numbers, headers or secrets. */
  onEvent?: (event: MomoEvent) => void;
}

export interface SubscriptionConfig {
  /** Subscription key of the product (`Ocp-Apim-Subscription-Key`). */
  primaryKey: string;
}

export interface UserConfig {
  /** API key of the API user. */
  userSecret: string;

  /** API user id. Not necessarily a UUID: MTN now issues other formats. */
  userId: string;
}

/**
 * Token cache. Errors are never fatal: a failing `get` is treated as a miss and a failing
 * `set`/`delete` is ignored, both reported through `onEvent`.
 */
export interface TokenStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, token: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export type MomoEvent =
  | {
      type: "response";
      product: Product | "provisioning";
      method: string;
      /** Path with phone numbers and references replaced by placeholders. */
      route: string;
      /** Absent when no response came back (network error, timeout). */
      status?: number;
      durationMs: number;
      /** MTN error code, or the network error code. */
      errorCode?: string;
    }
  | {
      type: "token_store_error";
      product: Product;
      operation: "get" | "set" | "delete";
      error: unknown;
    };

export interface Credentials {
  apiKey: string;
}

export interface AccessToken {
  access_token: string;
  token_type: string;
  /** Validity in seconds. */
  expires_in: number;
}

export interface Balance {
  availableBalance: string;
  /** ISO 4217 currency. */
  currency: string;
}

/**
 * MTN Congo production only returns `sub`, `given_name` and `family_name`; the sandbox returns
 * more. Code against the optional fields.
 */
export interface BasicUserInfo {
  sub?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  [field: string]: unknown;
}

/** The enum member or its string value: `PayerType.MSISDN` and `"MSISDN"` are both accepted. */
export type PartyIdTypeValue = PartyIdType | `${PartyIdType}`;

export interface Party {
  partyIdType: PartyIdTypeValue;
  partyId: string;
}

export enum PartyIdType {
  MSISDN = "MSISDN",
  EMAIL = "EMAIL",
  PARTY_CODE = "PARTY_CODE"
}

export enum Environment {
  SANDBOX = "sandbox",
  PRODUCTION = "production"
}

export enum TransactionStatus {
  SUCCESSFUL = "SUCCESSFUL",
  PENDING = "PENDING",
  FAILED = "FAILED"
}

export enum FailureReason {
  PAYEE_NOT_FOUND = "PAYEE_NOT_FOUND",
  PAYER_NOT_FOUND = "PAYER_NOT_FOUND",
  NOT_ALLOWED = "NOT_ALLOWED",
  NOT_ALLOWED_TARGET_ENVIRONMENT = "NOT_ALLOWED_TARGET_ENVIRONMENT",
  INVALID_CALLBACK_URL_HOST = "INVALID_CALLBACK_URL_HOST",
  INVALID_CURRENCY = "INVALID_CURRENCY",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  INTERNAL_PROCESSING_ERROR = "INTERNAL_PROCESSING_ERROR",
  NOT_ENOUGH_FUNDS = "NOT_ENOUGH_FUNDS",
  PAYER_LIMIT_REACHED = "PAYER_LIMIT_REACHED",
  PAYEE_NOT_ALLOWED_TO_RECEIVE = "PAYEE_NOT_ALLOWED_TO_RECEIVE",
  PAYMENT_NOT_APPROVED = "PAYMENT_NOT_APPROVED",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  APPROVAL_REJECTED = "APPROVAL_REJECTED",
  EXPIRED = "EXPIRED",
  TRANSACTION_CANCELED = "TRANSACTION_CANCELED",
  RESOURCE_ALREADY_EXIST = "RESOURCE_ALREADY_EXIST",
  COULD_NOT_PERFORM_TRANSACTION = "COULD_NOT_PERFORM_TRANSACTION",
  LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED = "LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED"
}
