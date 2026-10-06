import { AssertionError } from "assert";
import { describe, expect, it } from "vitest";

import momo, { Environment, PayerType } from "../src";
import { validateRequestToPay, validateTransfer } from "../src/validate";

const credentials = { primaryKey: "key", userId: "user", userSecret: "secret" };
const payer = { partyIdType: PayerType.MSISDN, partyId: "242061234567" };

describe("create()", () => {
  it.each([
    [{}, "callbackHost is required"],
    [{ callbackHost: "h", environment: "mtncongo" }, "baseUrl is required if environment is not sandbox"],
    [{ callbackHost: "h", environment: Environment.PRODUCTION, baseUrl: 1 as never }, "baseUrl must be a string"],
    [{ callbackHost: "h", timeout: 0 }, "timeout must be a positive integer"],
    [{ callbackHost: "h", timeout: 1.5 }, "timeout must be a positive integer"]
  ])("rejects %j", (config, message) => {
    expect(() => momo.create(config)).toThrow(expect.objectContaining({ code: "ERR_ASSERTION", message }));
  });

  it("accepts a sandbox config without baseUrl", () => {
    expect(() => momo.create({ callbackHost: "h" })).not.toThrow();
  });

  it.each([
    [{ ...credentials, primaryKey: "" }, "primaryKey is required"],
    [{ ...credentials, userId: "" }, "userId is required"],
    [{ ...credentials, userSecret: 42 as never }, "userSecret must be a string"]
  ])("rejects product credentials %j for every product", (config, message) => {
    const client = momo.create({ callbackHost: "h" });
    expect(() => client.Collections(config)).toThrow(message);
    expect(() => client.Disbursements(config)).toThrow(message);
    expect(() => client.Remittances(config)).toThrow(message);
  });

  it("accepts an API user id that is not a UUID", () => {
    expect(() => momo.create({ callbackHost: "h" }).Collections({ ...credentials, userId: "yabetoo_api_user_01" })).not.toThrow();
  });

  it("requires a subscription key for Users", () => {
    expect(() => momo.create({ callbackHost: "h" }).Users({ primaryKey: "" })).toThrow("primaryKey is required");
  });
});

describe("request validation", () => {
  const payment = { amount: "100", currency: "XAF", payer };

  it.each([
    [{ ...payment, amount: "" }, "amount is required"],
    [{ ...payment, amount: "abc" }, "amount must be a number"],
    [{ ...payment, currency: "" }, "currency is required"],
    [{ ...payment, payer: undefined as never }, "payer is required"],
    [{ ...payment, payer: { ...payer, partyId: "" } }, "payer.partyId is required"],
    [{ ...payment, payer: { ...payer, partyIdType: "" as never } }, "payer.partyIdType is required"],
    [{ ...payment, referenceId: "not-a-uuid" }, "referenceId must be a valid uuid v4"]
  ])("rejects a request to pay %j", async (request, message) => {
    await expect(validateRequestToPay(request)).rejects.toMatchObject({ code: "ERR_ASSERTION", message });
  });

  it("accepts a request to pay without reference", async () => {
    await expect(validateRequestToPay(payment)).resolves.toBeUndefined();
  });

  it("names the payee in transfer errors", async () => {
    await expect(validateTransfer({ amount: "1", currency: "XAF", payee: undefined as never })).rejects.toThrow(
      "payee is required"
    );
  });

  it("rejects a missing request instead of crashing", async () => {
    await expect(validateRequestToPay(undefined as never)).rejects.toBeInstanceOf(AssertionError);
  });
});
