import type { AxiosError } from "axios";
import type { Payment } from "./collections";
import { FailureReason } from "./common";
import type { Transfer } from "./disbursements";
import type { Remit } from "./remittances";

interface ErrorBody {
  code?: string;
  message?: string;
}

export class MtnMoMoError extends Error {
  /** Set when the error comes from a FAILED transaction read with `getTransaction`. */
  public transaction?: Payment | Transfer | Remit;
  /** HTTP status of the MTN response that produced this error. */
  public status?: number;
  /** Request path that produced this error (`/token/` for a failed token mint). */
  public url?: string;
  /** Raw MTN error code or transaction `reason`, including codes without a dedicated class. */
  public failureReason?: string;

  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApprovalRejectedError extends MtnMoMoError {
  public override name = "ApprovalRejectedError";
}
export class ExpiredError extends MtnMoMoError {
  public override name = "ExpiredError";
}
export class InternalProcessingError extends MtnMoMoError {
  public override name = "InternalProcessingError";
}
export class InvalidCallbackUrlHostError extends MtnMoMoError {
  public override name = "InvalidCallbackUrlHostError";
}
export class InvalidCurrencyError extends MtnMoMoError {
  public override name = "InvalidCurrencyError";
}
export class NotAllowedTargetEnvironmentError extends MtnMoMoError {
  public override name = "NotAllowedTargetEnvironmentError";
}
export class NotAllowedError extends MtnMoMoError {
  public override name = "NotAllowedError";
}
export class NotEnoughFundsError extends MtnMoMoError {
  public override name = "NotEnoughFundsError";
}
export class PayeeNotFoundError extends MtnMoMoError {
  public override name = "PayeeNotFoundError";
}
export class PayeeNotAllowedToReceiveError extends MtnMoMoError {
  public override name = "PayeeNotAllowedToReceiveError";
}
export class PayerLimitReachedError extends MtnMoMoError {
  public override name = "PayerLimitReachedError";
}
export class PayerNotFoundError extends MtnMoMoError {
  public override name = "PayerNotFoundError";
}
export class PaymentNotApprovedError extends MtnMoMoError {
  public override name = "PaymentNotApprovedError";
}
export class ResourceAlreadyExistError extends MtnMoMoError {
  public override name = "ResourceAlreadyExistError";
}
export class ResourceNotFoundError extends MtnMoMoError {
  public override name = "ResourceNotFoundError";
}
export class ServiceUnavailableError extends MtnMoMoError {
  public override name = "ServiceUnavailableError";
}
export class TransactionCancelledError extends MtnMoMoError {
  public override name = "TransactionCancelledError";
}
export class UnspecifiedError extends MtnMoMoError {
  public override name = "UnspecifiedError";
}

type MtnErrorClass = new (message?: string) => MtnMoMoError;

// Codes absent from this map (COULD_NOT_PERFORM_TRANSACTION…) stay UnspecifiedError, with
// the code kept on `failureReason`: consumers match on `name`, a new class would change it.
const ERRORS: Partial<Record<string, MtnErrorClass>> = {
  [FailureReason.APPROVAL_REJECTED]: ApprovalRejectedError,
  [FailureReason.EXPIRED]: ExpiredError,
  [FailureReason.INTERNAL_PROCESSING_ERROR]: InternalProcessingError,
  [FailureReason.INVALID_CALLBACK_URL_HOST]: InvalidCallbackUrlHostError,
  [FailureReason.INVALID_CURRENCY]: InvalidCurrencyError,
  [FailureReason.NOT_ALLOWED]: NotAllowedError,
  [FailureReason.NOT_ALLOWED_TARGET_ENVIRONMENT]: NotAllowedTargetEnvironmentError,
  [FailureReason.NOT_ENOUGH_FUNDS]: NotEnoughFundsError,
  [FailureReason.PAYEE_NOT_FOUND]: PayeeNotFoundError,
  [FailureReason.PAYEE_NOT_ALLOWED_TO_RECEIVE]: PayeeNotAllowedToReceiveError,
  [FailureReason.PAYER_LIMIT_REACHED]: PayerLimitReachedError,
  [FailureReason.PAYER_NOT_FOUND]: PayerNotFoundError,
  [FailureReason.PAYMENT_NOT_APPROVED]: PaymentNotApprovedError,
  [FailureReason.RESOURCE_ALREADY_EXIST]: ResourceAlreadyExistError,
  [FailureReason.RESOURCE_NOT_FOUND]: ResourceNotFoundError,
  [FailureReason.SERVICE_UNAVAILABLE]: ServiceUnavailableError,
  [FailureReason.TRANSACTION_CANCELED]: TransactionCancelledError
};

export function getError(code?: FailureReason | string, message?: string): MtnMoMoError {
  const ErrorClass = (code && ERRORS[code]) || UnspecifiedError;
  return new ErrorClass(message);
}

export function getTransactionError(transaction: Payment | Transfer | Remit): MtnMoMoError {
  const error = getError(transaction.reason);
  error.transaction = transaction;
  error.failureReason = transaction.reason;
  return error;
}

/**
 * Maps an MTN response to a typed error. Without a response (network error, timeout) the axios
 * error is returned as is, minus what carries secrets: its `code` is how a caller tells
 * "never connected" from "may have reached MTN".
 */
export function handleError(error: AxiosError): Error {
  if (!error.response) {
    return redact(error);
  }

  const { code, message }: ErrorBody = (error.response.data as ErrorBody) || {};
  const mtnError = getError(code, message);
  mtnError.status = error.response.status;
  mtnError.url = error.config && error.config.url;
  mtnError.failureReason = code;
  return mtnError;
}

/** Drops the request headers (Bearer, subscription key) and the socket objects from an axios error. */
function redact<T extends AxiosError>(error: T): T {
  if (error && typeof error === "object") {
    if (error.config) {
      error.config = { url: error.config.url, method: error.config.method } as T["config"];
    }
    delete error.request;
  }
  return error;
}
