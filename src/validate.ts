import { AssertionError } from "assert";

import type { PaymentRequest } from "./collections";
import { Environment, GlobalConfig, Party, ProductConfig, SubscriptionConfig, UserConfig } from "./common";
import type { TransferRequest } from "./disbursements";
import type { RemittanceRequest } from "./remittances";

const UUID_V4 = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

export function validateRequestToPay(paymentRequest: PaymentRequest): Promise<void> {
  const { payer, ...request } = paymentRequest || ({} as PaymentRequest);
  return Promise.resolve().then(() => validateMoneyRequest(request, payer, "payer"));
}

export function validateTransfer(transferRequest: TransferRequest): Promise<void> {
  const { payee, ...request } = transferRequest || ({} as TransferRequest);
  return Promise.resolve().then(() => validateMoneyRequest(request, payee, "payee"));
}

export function validateRemittance(remittanceRequest: RemittanceRequest): Promise<void> {
  const { payee, ...request } = remittanceRequest || ({} as RemittanceRequest);
  return Promise.resolve().then(() => validateMoneyRequest(request, payee, "payee"));
}

export function validateGlobalConfig(config: GlobalConfig): void {
  const { callbackHost, baseUrl, environment, timeout } = config || {};
  check(isTruthy(callbackHost), "callbackHost is required");

  if (environment && environment !== Environment.SANDBOX) {
    check(isTruthy(baseUrl), "baseUrl is required if environment is not sandbox");
    check(isString(baseUrl), "baseUrl must be a string");
  }

  if (timeout !== undefined) {
    check(Number.isInteger(timeout) && timeout > 0, "timeout must be a positive integer");
  }
}

export function validateProductConfig(config: ProductConfig): void {
  validateSubscriptionConfig(config);
  validateUserConfig(config);
}

export function validateSubscriptionConfig(config: SubscriptionConfig): void {
  const { primaryKey } = config || ({} as SubscriptionConfig);
  check(isTruthy(primaryKey), "primaryKey is required");
  check(isString(primaryKey), "primaryKey must be a string");
}

export function validateUserConfig(config: UserConfig): void {
  const { userId, userSecret } = config || ({} as UserConfig);
  check(isTruthy(userId), "userId is required");
  check(isString(userId), "userId must be a string");

  check(isTruthy(userSecret), "userSecret is required");
  check(isString(userSecret), "userSecret must be a string");
}

function validateMoneyRequest(
  { referenceId, amount, currency }: { referenceId?: string; amount: string; currency: string },
  party: Party | undefined,
  role: "payer" | "payee"
): void {
  if (referenceId !== undefined) {
    check(UUID_V4.test(referenceId), "referenceId must be a valid uuid v4");
  }
  check(isTruthy(amount), "amount is required");
  check(isNumeric(amount), "amount must be a number");
  check(isTruthy(currency), "currency is required");
  check(isString(currency), "currency must be a string");
  check(isTruthy(party), `${role} is required`);
  check(isTruthy(party?.partyId), `${role}.partyId is required`);
  check(isTruthy(party?.partyIdType), `${role}.partyIdType is required`);
}

function isNumeric(value: unknown): boolean {
  return !isNaN(parseInt(String(value), 10));
}

function isTruthy(value: unknown): boolean {
  return !!value;
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** An AssertionError with the exact message: `strictEqual` appends a diff on recent Node versions. */
export function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new AssertionError({ message, actual: false, expected: true, operator: "==" });
  }
}
