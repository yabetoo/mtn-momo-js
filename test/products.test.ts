import { AssertionError } from "assert";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MtnMoMoError, PayerType, ResourceAlreadyExistError, ResourceNotFoundError, Status } from "../src";
import { CALLBACK_HOST, clients, ENVIRONMENT, FakeMtn, PAYER } from "./support/fake-mtn";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let fake: FakeMtn;
beforeEach(async () => (fake = await new FakeMtn().start()));
afterEach(() => fake.stop());

const payment = { amount: "100", currency: "XAF", externalId: "ord_1", payer: PAYER, payerMessage: "hi", payeeNote: "hello" };
const transfer = { amount: "100", currency: "XAF", externalId: "wd_1", payee: PAYER, payerMessage: "hi", payeeNote: "hello" };

describe("Collections.requestToPay", () => {
  it("sends the request with a generated UUID v4 reference and returns it", async () => {
    const { collections } = clients(fake);

    const referenceId = await collections.requestToPay(payment);

    expect(referenceId).toMatch(UUID_V4);
    const [request] = fake.productRequests();
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/collection/v1_0/requesttopay");
    expect(request.headers["x-reference-id"]).toBe(referenceId);
    expect(request.headers["x-target-environment"]).toBe(ENVIRONMENT);
    expect(request.headers.authorization).toMatch(/^Bearer /);
    expect(request.headers["x-callback-url"]).toBeUndefined();
    expect(request.body).toEqual(payment);
  });

  it("uses the caller's reference and callback URL without sending them in the body", async () => {
    const { collections } = clients(fake);
    const referenceId = "6f0d5b8e-3b1a-4c2d-9e4f-1a2b3c4d5e6f";
    const callbackUrl = `https://${CALLBACK_HOST}/momo`;

    await expect(collections.requestToPay({ ...payment, referenceId, callbackUrl })).resolves.toBe(referenceId);

    const [request] = fake.productRequests();
    expect(request.headers["x-reference-id"]).toBe(referenceId);
    expect(request.headers["x-callback-url"]).toBe(callbackUrl);
    expect(request.body).toEqual(payment);
  });

  it("rejects a reused reference with the 409 MTN sends", async () => {
    const { collections } = clients(fake);
    const referenceId = await collections.requestToPay(payment);

    const error = await collections.requestToPay({ ...payment, referenceId }).catch(e => e);

    expect(error).toBeInstanceOf(ResourceAlreadyExistError);
    expect(error).toMatchObject({ status: 409, failureReason: "RESOURCE_ALREADY_EXIST" });
  });

  it("rejects an invalid request before any network call", async () => {
    const { collections } = clients(fake);

    const error = await collections.requestToPay({ ...payment, amount: "" }).catch(e => e);

    expect(error).toBeInstanceOf(AssertionError);
    expect(error).not.toBeInstanceOf(MtnMoMoError);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("getTransaction", () => {
  it("returns a pending or successful transaction", async () => {
    const { collections } = clients(fake);
    const referenceId = await collections.requestToPay(payment);

    await expect(collections.getTransaction(referenceId)).resolves.toMatchObject({ status: Status.PENDING, amount: "100" });
    fake.transactions.get(referenceId)!.status = Status.SUCCESSFUL;
    await expect(collections.getTransaction(referenceId)).resolves.toMatchObject({ status: Status.SUCCESSFUL });
  });

  it("rejects a FAILED transaction with its typed error, the transaction and its reason", async () => {
    const { collections } = clients(fake);
    const referenceId = await collections.requestToPay(payment);
    Object.assign(fake.transactions.get(referenceId)!, { status: Status.FAILED, reason: "APPROVAL_REJECTED" });

    const error = await collections.getTransaction(referenceId).catch(e => e);

    expect(error.name).toBe("ApprovalRejectedError");
    expect(error).toBeInstanceOf(MtnMoMoError);
    expect(error.failureReason).toBe("APPROVAL_REJECTED");
    expect(error.transaction).toMatchObject({ status: Status.FAILED, amount: "100" });
  });

  it("keeps a reason without a dedicated class as failureReason", async () => {
    const { collections } = clients(fake);
    const referenceId = await collections.requestToPay(payment);
    Object.assign(fake.transactions.get(referenceId)!, { status: Status.FAILED, reason: "SOMETHING_NEW" });

    const error = await collections.getTransaction(referenceId).catch(e => e);

    expect(error.name).toBe("UnspecifiedError");
    expect(error.failureReason).toBe("SOMETHING_NEW");
  });

  it("rejects an unknown reference with a 404", async () => {
    const { collections } = clients(fake);

    const error = await collections.getTransaction("6f0d5b8e-3b1a-4c2d-9e4f-1a2b3c4d5e6f").catch(e => e);

    expect(error).toBeInstanceOf(ResourceNotFoundError);
    expect(error.status).toBe(404);
  });
});

describe("Disbursements and Remittances", () => {
  it("transfers and reads the transfer back", async () => {
    const { disbursements } = clients(fake);

    const referenceId = await disbursements.transfer(transfer);

    const [request] = fake.productRequests();
    expect(request.path).toBe("/disbursement/v1_0/transfer");
    expect(request.headers["x-reference-id"]).toBe(referenceId);
    expect(request.body).toEqual(transfer);
    await expect(disbursements.getTransaction(referenceId)).resolves.toMatchObject({ status: Status.PENDING });
  });

  it("remits and reads the remittance back", async () => {
    const { remittances } = clients(fake);

    const referenceId = await remittances.remit(transfer);

    expect(fake.productRequests()[0].path).toBe("/remittance/v1_0/transfer");
    await expect(remittances.getTransaction(referenceId)).resolves.toMatchObject({ status: Status.PENDING });
  });

  it("validates transfers and remittances", async () => {
    const { disbursements, remittances } = clients(fake);

    await expect(disbursements.transfer({ ...transfer, payee: undefined as never })).rejects.toThrow("payee is required");
    await expect(remittances.remit({ ...transfer, referenceId: "nope" })).rejects.toThrow("referenceId must be a valid uuid v4");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("account endpoints", () => {
  it("reads the balance, in the account currency or a given one", async () => {
    const { collections, disbursements } = clients(fake);

    await expect(collections.getBalance()).resolves.toEqual({ availableBalance: "1500", currency: "XAF" });
    await expect(disbursements.getBalance("EUR")).resolves.toEqual({ availableBalance: "1500", currency: "EUR" });
    expect(fake.productRequests().map(r => r.path)).toEqual([
      "/collection/v1_0/account/balance",
      "/disbursement/v1_0/account/balance/EUR"
    ]);
  });

  it("tells whether an account holder is active", async () => {
    fake.accountHolders.set("242061234567", { active: true, info: {} });
    const { collections } = clients(fake);

    await expect(collections.isPayerActive("242061234567")).resolves.toBe(true);
    await expect(collections.isPayerActive("242069999999")).resolves.toBe(false);
    await expect(collections.isPayerActive("someone@example.com", PayerType.EMAIL)).resolves.toBe(false);
    expect(fake.productRequests()[2].path).toBe("/collection/v1_0/accountholder/email/someone%40example.com/active");
  });

  it("rejects an /active answer without a boolean instead of reading it as inactive", async () => {
    const { collections } = clients(fake);
    fake.respondOnce("GET", /active$/, 200, {});
    fake.respondOnce("GET", /active$/, 200, { result: "true" });

    for (let i = 0; i < 2; i++) {
      await expect(collections.isPayerActive("242061234567")).rejects.toMatchObject({
        name: "UnspecifiedError",
        status: 200,
        url: "/collection/v1_0/accountholder/msisdn/242061234567/active"
      });
    }
  });

  it("returns the account holder's name", async () => {
    const info = { sub: "0", given_name: "Jane", family_name: "Doe" };
    fake.accountHolders.set("242061234567", { active: true, info });
    const { collections } = clients(fake);

    await expect(collections.getBasicUserInfo("242061234567")).resolves.toEqual(info);
    expect(fake.productRequests()[0].path).toBe("/collection/v1_0/accountholder/msisdn/242061234567/basicuserinfo");
  });

  it("rejects an unknown number with status 404", async () => {
    const { collections } = clients(fake);

    const error = await collections.getBasicUserInfo("242069999999").catch(e => e);

    expect(error).toBeInstanceOf(MtnMoMoError);
    expect(error.status).toBe(404);
  });

  it("rejects a malformed msisdn before any network call", async () => {
    const { collections } = clients(fake);

    for (const msisdn of ["+242061234567", "06 12 34", "1234567", "../token/"]) {
      await expect(collections.getBasicUserInfo(msisdn)).rejects.toBeInstanceOf(AssertionError);
    }
    expect(fake.requests).toHaveLength(0);
  });
});

describe("Users", () => {
  it("provisions an API user and its key without a bearer token", async () => {
    const { users } = clients(fake);

    const userId = await users.create(CALLBACK_HOST);
    await expect(users.login(userId)).resolves.toEqual({ apiKey: "generated-api-key" });

    expect(userId).toMatch(UUID_V4);
    expect(fake.requests.map(r => [r.path, r.headers.authorization])).toEqual([
      ["/v1_0/apiuser", undefined],
      [`/v1_0/apiuser/${userId}/apikey`, undefined]
    ]);
    expect(fake.requests[0].body).toEqual({ providerCallbackHost: CALLBACK_HOST });
  });
});
