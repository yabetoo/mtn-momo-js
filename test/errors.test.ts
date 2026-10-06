import { FailureReason } from "../src/common";
import {
  ApprovalRejectedError,
  ExpiredError,
  getError,
  handleError,
  InternalProcessingError,
  InvalidCallbackUrlHostError,
  InvalidCurrencyError,
  NotAllowedError,
  NotAllowedTargetEnvironmentError,
  NotEnoughFundsError,
  PayeeNotAllowedToReceiveError,
  PayeeNotFoundError,
  PayerLimitReachedError,
  PayerNotFoundError,
  PaymentNotApprovedError,
  ResourceAlreadyExistError,
  ResourceNotFoundError,
  ServiceUnavailableError,
  TransactionCancelledError,
  UnspecifiedError
} from "../src/errors";
import { expect } from "./chai";

describe("Errors", function() {
  describe("getError", function() {
    context("when there is no error code", function() {
      it("returns unspecified error", function() {
        expect(getError()).is.instanceOf(UnspecifiedError);
      });
    });

    context("when there is an error code", function() {
      it("returns the correct error", function() {
        expect(getError(FailureReason.APPROVAL_REJECTED, "test message"))
          .is.instanceOf(ApprovalRejectedError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.EXPIRED, "test message"))
          .is.instanceOf(ExpiredError)
          .and.has.property("message", "test message");

        expect(
          getError(FailureReason.INTERNAL_PROCESSING_ERROR, "test message")
        )
          .is.instanceOf(InternalProcessingError)
          .and.has.property("message", "test message");

        expect(
          getError(FailureReason.INVALID_CALLBACK_URL_HOST, "test message")
        )
          .is.instanceOf(InvalidCallbackUrlHostError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.INVALID_CURRENCY, "test message"))
          .is.instanceOf(InvalidCurrencyError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.NOT_ALLOWED, "test message"))
          .is.instanceOf(NotAllowedError)
          .and.has.property("message", "test message");

        expect(
          getError(FailureReason.NOT_ALLOWED_TARGET_ENVIRONMENT, "test message")
        )
          .is.instanceOf(NotAllowedTargetEnvironmentError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.NOT_ENOUGH_FUNDS, "test message"))
          .is.instanceOf(NotEnoughFundsError)
          .and.has.property("message", "test message");

        expect(
          getError(FailureReason.PAYEE_NOT_ALLOWED_TO_RECEIVE, "test message")
        )
          .is.instanceOf(PayeeNotAllowedToReceiveError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.PAYEE_NOT_FOUND, "test message"))
          .is.instanceOf(PayeeNotFoundError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.PAYER_LIMIT_REACHED, "test message"))
          .is.instanceOf(PayerLimitReachedError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.PAYER_NOT_FOUND, "test message"))
          .is.instanceOf(PayerNotFoundError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.PAYMENT_NOT_APPROVED, "test message"))
          .is.instanceOf(PaymentNotApprovedError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.RESOURCE_ALREADY_EXIST, "test message"))
          .is.instanceOf(ResourceAlreadyExistError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.RESOURCE_NOT_FOUND, "test message"))
          .is.instanceOf(ResourceNotFoundError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.SERVICE_UNAVAILABLE, "test message"))
          .is.instanceOf(ServiceUnavailableError)
          .and.has.property("message", "test message");

        expect(getError(FailureReason.TRANSACTION_CANCELED, "test message"))
          .is.instanceOf(TransactionCancelledError)
          .and.has.property("message", "test message");
      });
    });
  });

  describe("handleError", function() {
    it("carries the HTTP status, url and raw MTN code", function() {
      const error = handleError({
        config: { url: "/collection/v1_0/requesttopay" },
        response: { status: 409, data: { code: FailureReason.RESOURCE_ALREADY_EXIST, message: "dup" } }
      } as any);
      expect(error).is.instanceOf(ResourceAlreadyExistError);
      expect(error).to.include({
        status: 409,
        url: "/collection/v1_0/requesttopay",
        failureReason: FailureReason.RESOURCE_ALREADY_EXIST
      });
    });
  });
});
