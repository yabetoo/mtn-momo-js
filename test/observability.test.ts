import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MomoEvent } from "../src";
import { toRoute } from "../src/client";
import { clients, FakeMtn, PAYER } from "./support/fake-mtn";

let fake: FakeMtn;
beforeEach(async () => (fake = await new FakeMtn().start()));
afterEach(() => fake.stop());

describe("onEvent", () => {
  it("reports every response with a route free of phone numbers and references", async () => {
    const events: MomoEvent[] = [];
    fake.accountHolders.set(PAYER.partyId, { active: true, info: { given_name: "Jane" } });
    const { collections } = clients(fake, { onEvent: event => events.push(event) });

    const referenceId = await collections.requestToPay({ amount: "100", currency: "XAF", payer: PAYER });
    await collections.getTransaction(referenceId);
    await collections.getBasicUserInfo(PAYER.partyId);
    await collections.getBasicUserInfo("242069999999").catch(() => undefined);

    expect(events.map(e => e.type === "response" && [e.product, e.method, e.route, e.status, e.errorCode])).toEqual([
      ["collection", "POST", "/collection/token/", 200, undefined],
      ["collection", "POST", "/collection/v1_0/requesttopay", 202, undefined],
      ["collection", "GET", "/collection/v1_0/requesttopay/{referenceId}", 200, undefined],
      ["collection", "GET", "/collection/v1_0/accountholder/msisdn/{id}/basicuserinfo", 200, undefined],
      ["collection", "GET", "/collection/v1_0/accountholder/msisdn/{id}/basicuserinfo", 404, "RESOURCE_NOT_FOUND"]
    ]);
    expect(JSON.stringify(events)).not.toMatch(/2420|subscription-key|Bearer|Basic/);
    expect(events.every(e => e.type === "response" && e.durationMs >= 0)).toBe(true);
  });

  it("reports a network error with its code and no status", async () => {
    const events: MomoEvent[] = [];
    const { collections } = clients(fake, { timeout: 50, onEvent: event => events.push(event) });
    fake.respondOnce("POST", /token/, 200, {}, 200);

    await collections.getBalance().catch(() => undefined);

    expect(events).toEqual([expect.objectContaining({ route: "/collection/token/", status: undefined, errorCode: "ECONNABORTED" })]);
  });

  it("never lets a failing hook break a call", async () => {
    const { collections } = clients(fake, {
      onEvent: () => {
        throw new Error("hook bug");
      }
    });

    await expect(collections.getBalance()).resolves.toMatchObject({ currency: "XAF" });
  });

  it("templates provisioning routes", () => {
    expect(toRoute("/v1_0/apiuser/yabetoo_api_user_01/apikey")).toBe("/v1_0/apiuser/{userId}/apikey");
    expect(toRoute("/collection/v1_0/accountholder/email/a%40b.c/active?x=1")).toBe(
      "/collection/v1_0/accountholder/email/{id}/active"
    );
  });
});
