import { createServer } from "net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleError, MtnMoMoError, NotEnoughFundsError, UnspecifiedError } from "../src";
import { clients, FakeMtn } from "./support/fake-mtn";

let fake: FakeMtn;
beforeEach(async () => (fake = await new FakeMtn().start()));
afterEach(() => fake.stop());

const freePort = () =>
  new Promise<number>(resolve => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

describe("MTN error responses", () => {
  it("maps the MTN body to a typed error with status, url and reason", async () => {
    const { collections } = clients(fake);
    fake.respondOnce("GET", /balance/, 400, { code: "NOT_ENOUGH_FUNDS", message: "The payer does not have enough funds." });

    const error = await collections.getBalance().catch(e => e);

    expect(error).toBeInstanceOf(NotEnoughFundsError);
    expect(error).toBeInstanceOf(MtnMoMoError);
    expect(error).toMatchObject({
      name: "NotEnoughFundsError",
      message: "The payer does not have enough funds.",
      status: 400,
      url: "/collection/v1_0/account/balance",
      failureReason: "NOT_ENOUGH_FUNDS"
    });
  });

  it("falls back to UnspecifiedError for an unknown code or an empty body", async () => {
    const { collections } = clients(fake);
    fake.respondOnce("GET", /balance/, 400, { code: "BRAND_NEW_CODE", message: "?" });
    fake.respondOnce("GET", /balance/, 503);

    await expect(collections.getBalance()).rejects.toMatchObject({
      name: "UnspecifiedError",
      status: 400,
      failureReason: "BRAND_NEW_CODE"
    });
    const empty = await collections.getBalance().catch(e => e);
    expect(empty).toBeInstanceOf(UnspecifiedError);
    expect(empty.status).toBe(503);
  });

  it("keeps the codes MTN Congo returns on a failed transfer as failureReason", async () => {
    const { disbursements } = clients(fake);
    fake.respondOnce("POST", /transfer/, 500, { code: "COULD_NOT_PERFORM_TRANSACTION", message: "Could not perform transaction" });

    const error = await disbursements
      .transfer({ amount: "100", currency: "XAF", payee: { partyIdType: "MSISDN", partyId: "242061234567" } })
      .catch(e => e);

    expect(error).toMatchObject({ name: "UnspecifiedError", status: 500, failureReason: "COULD_NOT_PERFORM_TRANSACTION" });
  });
});

describe("network errors", () => {
  it("passes a timeout through as the axios error, code ECONNABORTED", async () => {
    const { collections } = clients(fake, { timeout: 50 });
    await collections.getBalance();
    fake.respondOnce("GET", /balance/, 200, {}, 200);

    const error = await collections.getBalance().catch(e => e);

    expect(error).not.toBeInstanceOf(MtnMoMoError);
    expect(error.isAxiosError).toBe(true);
    expect(error.code).toBe("ECONNABORTED");
  });

  it("passes a refused connection through, without headers or socket", async () => {
    const port = await freePort();
    const { collections } = clients(fake, { baseUrl: `http://127.0.0.1:${port}` });

    const error = await collections.getBalance().catch(e => e);

    expect(error.isAxiosError).toBe(true);
    expect(error.code).toBe("ECONNREFUSED");
    expect(error.config).toEqual({ url: "/collection/token/", method: "post" });
    expect(error.request).toBeUndefined();
    expect(JSON.stringify(error.toJSON?.() ?? {})).not.toContain("subscription-key");
  });

  it("leaves an already typed error untouched", () => {
    const error = new UnspecifiedError("x");
    expect(handleError(error as never)).toBe(error);
  });
});

describe("configuration", () => {
  it("applies the timeout and keeps the axios instance reachable as `client`", () => {
    const { collections } = clients(fake, { timeout: 5000 });
    expect((collections as unknown as { client: { defaults: { timeout: number } } }).client.defaults.timeout).toBe(5000);
    expect((clients(fake).collections as any).client.defaults.timeout).toBe(30_000);
  });
});
