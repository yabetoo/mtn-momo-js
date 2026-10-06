import { AxiosInstance } from "axios";

import { Balance, BasicUserInfo, PartyIdType, PartyIdTypeValue, Product, TransactionStatus } from "./common";
import { getError, getTransactionError } from "./errors";
import { check } from "./validate";

const MSISDN = /^\d{8,15}$/;

/** Endpoints every MTN product exposes under its own prefix. */
export abstract class ProductClient<T extends { status: TransactionStatus }> {
  // Named `client` on purpose: consumers' tests reach it as `(product as any).client`.
  constructor(
    protected readonly client: AxiosInstance,
    private readonly product: Product
  ) {}

  /** Path of a transaction from its reference, e.g. `/collection/v1_0/requesttopay/{id}`. */
  protected abstract transactionPath(referenceId: string): string;

  /**
   * Reads a transaction. A FAILED transaction rejects with the matching `MtnMoMoError`
   * subclass, carrying the transaction and its `reason` as `failureReason`.
   *
   * @param referenceId the value returned when the transaction was initiated
   */
  public getTransaction(referenceId: string): Promise<T> {
    return this.client.get<T>(this.transactionPath(referenceId)).then(({ data }) =>
      data.status === TransactionStatus.FAILED
        ? Promise.reject(getTransactionError(data as never))
        : data
    );
  }

  /** Account balance, in the account currency or in `currency` when given (ISO 4217). */
  public getBalance(currency?: string): Promise<Balance> {
    const path = `/${this.product}/v1_0/account/balance${currency ? `/${encodeURIComponent(currency)}` : ""}`;
    return this.client.get<Balance>(path).then(response => response.data);
  }

  /**
   * Whether an account holder is registered and active. An answer without a boolean `result`
   * rejects with `UnspecifiedError` rather than reading as `false`: "no answer" is not "inactive".
   *
   * @param id the party id: an MSISDN in international format without `+`, an email or a party code
   */
  public isPayerActive(id: string, type: PartyIdTypeValue = PartyIdType.MSISDN): Promise<boolean> {
    return this.client
      .get<{ result?: unknown }>(this.accountHolderPath(type, id, "active"))
      .then(({ data, status, config }) => {
        if (typeof data?.result === "boolean") {
          return data.result;
        }
        const error = getError(undefined, "MTN answered /active without a boolean result");
        error.status = status;
        error.url = config.url;
        throw error;
      });
  }

  /**
   * Name of an account holder. Rejects with `status: 404` when the number is unknown.
   *
   * @param msisdn international format without `+`, e.g. `242061234567`
   */
  public async getBasicUserInfo(msisdn: string): Promise<BasicUserInfo> {
    check(MSISDN.test(msisdn), "msisdn must be 8 to 15 digits");
    const response = await this.client.get<BasicUserInfo>(
      this.accountHolderPath(PartyIdType.MSISDN, msisdn, "basicuserinfo")
    );
    return response.data;
  }

  private accountHolderPath(type: PartyIdTypeValue, id: string, resource: string): string {
    return `/${this.product}/v1_0/accountholder/${String(type).toLowerCase()}/${encodeURIComponent(id)}/${resource}`;
  }
}
