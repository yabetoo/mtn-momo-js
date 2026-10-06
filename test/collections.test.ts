import { AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { expect } from "chai";

import Collections from "../src/collections";

import { createMock } from "./mock";

import { PaymentRequest } from "../src/collections";
import { PartyIdType } from "../src/common";

describe("Collections", function() {
  let collections: Collections;
  let mockAdapter: MockAdapter;
  let mockClient: AxiosInstance;

  beforeEach(() => {
    [mockClient, mockAdapter] = createMock();
    collections = new Collections(mockClient);
  });

  describe("requestToPay", function() {
    context("when the amount is missing", function() {
      it("throws an error", function() {
        const request = {} as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "amount is required"
        );
      });
    });

    context("when the amount is not numeric", function() {
      it("throws an error", function() {
        const request = { amount: "alphabetic" } as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "amount must be a number"
        );
      });
    });

    context("when the currency is missing", function() {
      it("throws an error", function() {
        const request = {
          amount: "1000"
        } as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "currency is required"
        );
      });
    });

    context("when the payer is missing", function() {
      it("throws an error", function() {
        const request = {
          amount: "1000",
          currency: "UGX"
        } as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "payer is required"
        );
      });
    });

    context("when the party id is missing", function() {
      it("throws an error", function() {
        const request = {
          amount: "1000",
          currency: "UGX",
          payer: {
          }
        } as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "payer.partyId is required"
        );
      });
    });

    context("when the party id type is missing", function() {
      it("throws an error", function() {
        const request = {
          amount: "1000",
          currency: "UGX",
          payer: {
            partyId: "xxx",
          }
        } as PaymentRequest;
        return expect(collections.requestToPay(request)).to.be.rejectedWith(
          "payer.partyIdType is required"
        );
      });
    });

    it("makes the correct request", function() {
      const request: PaymentRequest = {
        amount: "50",
        currency: "EUR",
        externalId: "123456",
        payer: {
          partyIdType: PartyIdType.MSISDN,
          partyId: "256774290781"
        },
        payerMessage: "testing",
        payeeNote: "hello"
      };
      return expect(
        collections.requestToPay({ ...request, callbackUrl: "callback url" })
      ).to.be.fulfilled.then(() => {
        expect(mockAdapter.history.post).to.have.lengthOf(1);
        expect(mockAdapter.history.post[0].url).to.eq(
          "/collection/v1_0/requesttopay"
        );
        expect(mockAdapter.history.post[0].data).to.eq(JSON.stringify(request));
        expect(mockAdapter.history.post[0].headers["X-Reference-Id"]).to.be.a(
          "string"
        );
        expect(mockAdapter.history.post[0].headers["X-Callback-Url"]).to.eq(
          "callback url"
        );
      });
    });
  });

  describe("requestToPay referenceId", function() {
    const request: PaymentRequest = {
      amount: "50",
      currency: "EUR",
      payer: { partyIdType: PartyIdType.MSISDN, partyId: "256774290781" }
    };

    it("uses the supplied referenceId and keeps it out of the body", function() {
      const referenceId = "1b6f9c4e-6a7d-4c1e-9f3a-2d5b8e7c0a11";
      return expect(
        collections.requestToPay({ ...request, referenceId })
      ).to.eventually.eq(referenceId).then(() => {
        expect(mockAdapter.history.post[0].headers["X-Reference-Id"]).to.eq(referenceId);
        expect(mockAdapter.history.post[0].data).to.eq(JSON.stringify(request));
      });
    });

    it("rejects a referenceId that is not a uuid v4", function() {
      return expect(
        collections.requestToPay({ ...request, referenceId: "not-a-uuid" })
      ).to.be.rejectedWith("referenceId must be a valid uuid v4");
    });
  });

  describe("getTransaction", function() {
    it("makes the correct request", function() {
      return expect(
        collections.getTransaction("reference")
      ).to.be.fulfilled.then(() => {
        expect(mockAdapter.history.get).to.have.lengthOf(1);
        expect(mockAdapter.history.get[0].url).to.eq(
          "/collection/v1_0/requesttopay/reference"
        );
      });
    });
  });

  describe("getBalance", function() {
    it("makes the correct request", function() {
      return expect(collections.getBalance()).to.be.fulfilled.then(() => {
        expect(mockAdapter.history.get).to.have.lengthOf(1);
        expect(mockAdapter.history.get[0].url).to.eq(
          "/collection/v1_0/account/balance"
        );
      });
    });
  });

  describe("isPayerActive", function() {
    it("makes the correct request", function() {
      return expect(
        collections.isPayerActive("0772000000", PartyIdType.MSISDN)
      ).to.be.fulfilled.then(() => {
        expect(mockAdapter.history.get).to.have.lengthOf(1);
        expect(mockAdapter.history.get[0].url).to.eq(
          "/collection/v1_0/accountholder/MSISDN/0772000000/active"
        );
      });
    });
  });
});
