import { AxiosInstance } from "axios";

import { createAuthClient, createTokenProvider, MemoryTokenStore } from "./auth";
import { createClient, withErrorHandling, withObservability } from "./client";
import Collections from "./collections";
import { Config, Environment, GlobalConfig, Product, ProductConfig, SubscriptionConfig } from "./common";
import Disbursements from "./disbursements";
import Remittances from "./remittances";
import Users from "./users";
import { validateGlobalConfig, validateProductConfig, validateSubscriptionConfig } from "./validate";

export type { Payment, PaymentRequest } from "./collections";
export type { Transfer, TransferRequest } from "./disbursements";
export type { Remit, RemittanceRequest } from "./remittances";
export type {
  AccessToken,
  Balance,
  BasicUserInfo,
  Credentials,
  GlobalConfig,
  MomoEvent,
  Party as Payer,
  PartyIdTypeValue,
  ProductConfig,
  SubscriptionConfig,
  TokenStore,
  UserConfig
} from "./common";
export { Environment, FailureReason, PartyIdType as PayerType, TransactionStatus as Status } from "./common";
export * from "./errors";
export { MemoryTokenStore } from "./auth";
export { Collections, Disbursements, Remittances, Users };

export interface MomoClient {
  Collections(productConfig: ProductConfig): Collections;
  Disbursements(productConfig: ProductConfig): Disbursements;
  Remittances(productConfig: ProductConfig): Remittances;
  Users(subscription: SubscriptionConfig): Users;
}

const defaultGlobalConfig: GlobalConfig = {
  baseUrl: "https://sandbox.momodeveloper.mtn.com",
  environment: Environment.SANDBOX
};

/**
 * Initialises the library. Clients created from one `create()` share its token store, so two
 * `Collections` built with the same API user reuse one token.
 */
export function create(globalConfig: GlobalConfig): MomoClient {
  validateGlobalConfig(globalConfig);
  const tokenStore = globalConfig.tokenStore || new MemoryTokenStore();

  const product = (name: Product, productConfig: ProductConfig): AxiosInstance => {
    validateProductConfig(productConfig);
    const config: Config = { ...defaultGlobalConfig, ...globalConfig, ...productConfig };
    // Order matters: observability sees the raw response, the 401 retry runs before errors are typed.
    return withErrorHandling(
      createAuthClient(
        createTokenProvider(name, config, tokenStore),
        withObservability(createClient(config), name, config.onEvent)
      )
    );
  };

  return {
    Collections: productConfig => new Collections(product("collection", productConfig)),
    Disbursements: productConfig => new Disbursements(product("disbursement", productConfig)),
    Remittances: productConfig => new Remittances(product("remittance", productConfig)),
    Users(subscriptionConfig: SubscriptionConfig): Users {
      validateSubscriptionConfig(subscriptionConfig);
      const config = { ...defaultGlobalConfig, ...globalConfig, ...subscriptionConfig };
      return new Users(withErrorHandling(withObservability(createClient(config), "provisioning", config.onEvent)));
    }
  };
}

export default { create };
