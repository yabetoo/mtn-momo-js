import { randomUUID } from "crypto";
import { AxiosInstance } from "axios";

import { FailureReason, Party, TransactionStatus } from "./common";
import { ProductClient } from "./product";
import { validateTransfer } from "./validate";

export interface TransferRequest {
  /** Unique reference (UUID v4), sent as `X-Reference-Id`. Generated when omitted. */
  referenceId?: string;

  /** Amount credited to the payee. */
  amount: string;

  /** ISO 4217 currency. */
  currency: string;

  /** Your reference, kept for reconciliation; need not be unique. */
  externalId?: string;

  /** Account holder credited; an MSISDN is in international format without `+`. */
  payee: Party;

  /** Shown in the payer's transaction history. */
  payerMessage?: string;

  /** Shown in the payee's transaction history. */
  payeeNote?: string;

  /** Overrides the callback URL; its host must be the configured `callbackHost`. */
  callbackUrl?: string;
}

export interface Transfer {
  amount: string;
  currency: string;
  financialTransactionId: string;
  externalId: string;
  payee: {
    partyIdType: "MSISDN";
    partyId: string;
  };
  status: TransactionStatus;
  reason?: FailureReason;
}

export default class Disbursements extends ProductClient<Transfer> {
  constructor(client: AxiosInstance) {
    super(client, "disbursement");
  }

  /**
   * Transfers money from the disbursement account to a payee. Follow it with `getTransaction`.
   *
   * @returns the reference of the transfer (`X-Reference-Id`)
   */
  public transfer({ callbackUrl, referenceId = randomUUID(), ...payoutRequest }: TransferRequest): Promise<string> {
    return validateTransfer({ referenceId, ...payoutRequest }).then(() =>
      this.client
        .post<void>("/disbursement/v1_0/transfer", payoutRequest, {
          headers: {
            "X-Reference-Id": referenceId,
            ...(callbackUrl ? { "X-Callback-Url": callbackUrl } : {})
          }
        })
        .then(() => referenceId)
    );
  }

  protected transactionPath(referenceId: string): string {
    return `/disbursement/v1_0/transfer/${encodeURIComponent(referenceId)}`;
  }
}
