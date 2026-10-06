import { randomUUID } from "crypto";
import { AxiosInstance } from "axios";

import { Credentials } from "./common";

/** Sandbox provisioning: in production MTN issues API users from its partner portal. */
export default class Users {
  constructor(protected readonly client: AxiosInstance) {}

  /**
   * Creates an API user.
   *
   * @param host the provider callback host
   * @returns the id of the new API user
   */
  public create(host: string): Promise<string> {
    const userId = randomUUID();
    return this.client
      .post("/v1_0/apiuser", { providerCallbackHost: host }, { headers: { "X-Reference-Id": userId } })
      .then(() => userId);
  }

  /** Creates an API key for an API user. */
  public login(userId: string): Promise<Credentials> {
    return this.client
      .post<Credentials>(`/v1_0/apiuser/${encodeURIComponent(userId)}/apikey`)
      .then(response => response.data);
  }
}
