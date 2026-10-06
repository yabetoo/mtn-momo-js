import { randomUUID } from "crypto";
import { AxiosInstance } from "axios";

import { FailureReason, Party, TransactionStatus } from "./common";
import { ProductClient } from "./product";
import { validateRequestToPay } from "./validate";

export interface PaymentRequest {
  /** Unique reference (UUID v4), sent as `X-Reference-Id`. Generated when omitted. */
  referenceId?: string;

  /** Amount debited from the payer. */
  amount: string;

  /** ISO 4217 currency. */
  currency: string;

  /** Your reference, kept for reconciliation; need not be unique. */
  externalId?: string;

  /** Account holder debited; an MSISDN is in international format without `+`. */
  payer: Party;

  /** Shown in the payer's transaction history. */
  payerMessage?: string;

  /** Shown in the payee's transaction history. */
  payeeNote?: string;

  /** Overrides the callback URL; its host must be the configured `callbackHost`. */
  callbackUrl?: string;
}

export interface Payment {
  financialTransactionId: string;
  externalId: string;
  amount: string;
  currency: string;
  payer: Party;
  payerMessage: string;
  payeeNote: string;
  reason?: FailureReason;
  status: TransactionStatus;
}

export default class Collections extends ProductClient<Payment> {
  constructor(client: AxiosInstance) {
    super(client, "collection");
  }

  /**
   * Asks the payer to approve a debit. The transaction stays PENDING until the payer approves,
   * declines or lets it expire; follow it with `getTransaction`.
   *
   * @returns the reference of the request (`X-Reference-Id`)
   */
  public requestToPay({ callbackUrl, referenceId = randomUUID(), ...paymentRequest }: PaymentRequest): Promise<string> {
    return validateRequestToPay({ referenceId, ...paymentRequest }).then(() =>
      this.client
        .post<void>("/collection/v1_0/requesttopay", paymentRequest, {
          headers: {
            "X-Reference-Id": referenceId,
            ...(callbackUrl ? { "X-Callback-Url": callbackUrl } : {})
          }
        })
        .then(() => referenceId)
    );
  }

  protected transactionPath(referenceId: string): string {
    return `/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`;
  }
}
