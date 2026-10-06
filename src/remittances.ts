import { randomUUID } from "crypto";
import { AxiosInstance } from "axios";

import { FailureReason, Party, TransactionStatus } from "./common";
import { ProductClient } from "./product";
import { validateRemittance } from "./validate";

export interface RemittanceRequest {
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

export interface Remit {
  amount: string;
  financialTransactionId: string;
  currency: string;
  externalId: string;
  payee: {
    partyIdType: "MSISDN";
    partyId: string;
  };
  status: TransactionStatus;
  reason?: FailureReason;
}

export default class Remittances extends ProductClient<Remit> {
  constructor(client: AxiosInstance) {
    super(client, "remittance");
  }

  /**
   * Sends an international remittance to a payee. Follow it with `getTransaction`.
   *
   * @returns the reference of the remittance (`X-Reference-Id`)
   */
  public remit({ callbackUrl, referenceId = randomUUID(), ...remittanceRequest }: RemittanceRequest): Promise<string> {
    return validateRemittance({ referenceId, ...remittanceRequest }).then(() =>
      this.client
        .post<void>("/remittance/v1_0/transfer", remittanceRequest, {
          headers: {
            "X-Reference-Id": referenceId,
            ...(callbackUrl ? { "X-Callback-Url": callbackUrl } : {})
          }
        })
        .then(() => referenceId)
    );
  }

  protected transactionPath(referenceId: string): string {
    return `/remittance/v1_0/transfer/${encodeURIComponent(referenceId)}`;
  }
}
