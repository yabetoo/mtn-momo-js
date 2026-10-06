import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import momo, { MemoryTokenStore, MomoEvent, TokenStore } from "../src";
import { tokenTtl } from "../src/auth";
import { CREDENTIALS, clients, FakeMtn, globalConfig } from "./support/fake-mtn";

let fake: FakeMtn;
beforeEach(async () => (fake = await new FakeMtn().start()));
afterEach(() => fake.stop());

describe("token cache", () => {
  it("mints once for concurrent calls and reuses the token", async () => {
    const { collections } = clients(fake);

    await Promise.all([collections.getBalance(), collections.getBalance(), collections.getBalance()]);
    await collections.getBalance();

    expect(fake.mints).toBe(1);
    const mint = fake.requests.find(r => r.path === "/collection/token/")!;
    expect(mint.headers["x-target-environment"]).toBe("mtncongo");
    expect(mint.headers.authorization).toBe(
      `Basic ${Buffer.from(`${CREDENTIALS.userId}:${CREDENTIALS.userSecret}`).toString("base64")}`
    );
  });

  it("shares a token between clients of one create(), never between products", async () => {
    const client = momo.create(globalConfig(fake));

    await client.Collections(CREDENTIALS).getBalance();
    await client.Collections(CREDENTIALS).getBalance();
    await client.Disbursements(CREDENTIALS).getBalance();

    expect(fake.mints).toBe(2);
  });

  it("shares a token across create() calls through a common store", async () => {
    const tokenStore = new MemoryTokenStore();

    await clients(fake, { tokenStore }).collections.getBalance();
    await clients(fake, { tokenStore }).collections.getBalance();
    await clients(fake).collections.getBalance();

    expect(fake.mints).toBe(2);
  });

  it("stores the token under a per-environment, per-user key with a margin on its ttl", async () => {
    const tokenStore = new MemoryTokenStore();
    const set = vi.spyOn(tokenStore, "set");

    await clients(fake, { tokenStore }).collections.getBalance();

    expect(set).toHaveBeenCalledWith(`mtn-momo:collection:mtncongo:${CREDENTIALS.userId}`, expect.any(String), 3540);
  });

  it("computes ttls defensively", () => {
    expect(tokenTtl(3600)).toBe(3540);
    expect(tokenTtl(30)).toBe(60);
    expect(tokenTtl(undefined)).toBe(600);
    expect(tokenTtl("3600")).toBe(600);
  });

  it("keeps working when the store fails, and reports it", async () => {
    const events: MomoEvent[] = [];
    const tokenStore: TokenStore = {
      get: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
      delete: () => Promise.reject(new Error("redis down"))
    };
    const { collections } = clients(fake, { tokenStore, onEvent: event => events.push(event) });

    await expect(collections.getBalance()).resolves.toMatchObject({ currency: "XAF" });

    expect(events.filter(e => e.type === "token_store_error").map(e => e.type === "token_store_error" && e.operation)).toEqual([
      "get",
      "set"
    ]);
  });
});

describe("401 retry", () => {
  it("retries once with a fresh token after a 401", async () => {
    const { collections } = clients(fake);
    await collections.getBalance();
    fake.revokeTokens();

    await expect(collections.getBalance()).resolves.toMatchObject({ currency: "XAF" });

    expect(fake.mints).toBe(2);
    expect(fake.productRequests()).toHaveLength(3);
  });

  it("resends an initiation with the same reference, so MTN can deduplicate it", async () => {
    const { collections } = clients(fake);
    await collections.getBalance();
    fake.revokeTokens();

    const referenceId = await collections.requestToPay({
      amount: "100",
      currency: "XAF",
      payer: { partyIdType: "MSISDN", partyId: "242061234567" }
    });

    const initiations = fake.productRequests().filter(r => r.method === "POST");
    expect(initiations.map(r => r.headers["x-reference-id"])).toEqual([referenceId, referenceId]);
  });

  it("does not retry a second 401", async () => {
    const { collections } = clients(fake);
    const unauthorized = { code: "UNAUTHORIZED", message: "Access token is invalid or expired." };
    fake.respondOnce("GET", /balance/, 401, unauthorized);
    fake.respondOnce("GET", /balance/, 401, unauthorized);

    const error = await collections.getBalance().catch(e => e);

    expect(error).toMatchObject({ status: 401, url: "/collection/v1_0/account/balance" });
    expect(fake.productRequests()).toHaveLength(2);
  });

  it("does not retry a failed mint, whose url says it never reached the product", async () => {
    const { collections } = clients(fake, {}, { ...CREDENTIALS, userSecret: "wrong" });

    const error = await collections.requestToPay({
      amount: "100",
      currency: "XAF",
      payer: { partyIdType: "MSISDN", partyId: "242061234567" }
    }).catch(e => e);

    expect(error).toMatchObject({ status: 401, url: "/collection/token/" });
    expect(fake.requests).toHaveLength(1);
  });

  it("does not retry other errors", async () => {
    const { collections } = clients(fake);
    fake.respondOnce("GET", /balance/, 500, { code: "INTERNAL_PROCESSING_ERROR", message: "boom" });

    await expect(collections.getBalance()).rejects.toMatchObject({ name: "InternalProcessingError", status: 500 });
    expect(fake.productRequests()).toHaveLength(1);
  });
});
