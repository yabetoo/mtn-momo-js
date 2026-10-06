import { randomBytes } from "crypto";
import { createServer, IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";

import momo, { GlobalConfig, PayerType, ProductConfig } from "../../src";

export const CREDENTIALS = {
  primaryKey: "subscription-key",
  // Not a UUID on purpose: MTN now issues API users in other formats.
  userId: "yabetoo_api_user_01",
  userSecret: "api-key-secret"
};
export const ENVIRONMENT = "mtncongo";
export const CALLBACK_HOST = "callbacks.example.com";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

interface Override {
  method: string;
  path: RegExp;
  status: number;
  body?: unknown;
  delayMs?: number;
}

export interface AccountHolder {
  active: boolean;
  info: Record<string, unknown>;
}

/**
 * MTN gateway double that is as strict as the real one: subscription key and
 * X-Target-Environment on every call (momoapi.momo.africa answers 400 without the latter, mint
 * included), Basic auth on the mint, a Bearer of the same product elsewhere, UUID v4 references.
 */
export class FakeMtn {
  public readonly requests: RecordedRequest[] = [];
  public readonly transactions = new Map<string, Record<string, unknown>>();
  public readonly accountHolders = new Map<string, AccountHolder>();
  public mints = 0;
  public baseUrl = "";

  private readonly tokens = new Map<string, string>();
  private readonly overrides: Override[] = [];
  private readonly server: Server = createServer((req, res) => void this.handle(req, res));

  public async start(): Promise<this> {
    await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  public stop(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise(resolve => this.server.close(() => resolve()));
  }

  /** Every issued token now answers 401, as after an expiry on MTN's side. */
  public revokeTokens(): void {
    this.tokens.clear();
  }

  /** The next request matching `method` and `path` gets this answer instead. */
  public respondOnce(method: string, path: RegExp, status: number, body?: unknown, delayMs?: number): void {
    this.overrides.push({ method, path, status, body, delayMs });
  }

  public productRequests(): RecordedRequest[] {
    return this.requests.filter(request => !request.path.includes("/token/"));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await new Promise<string>(resolve => {
      let data = "";
      req.on("data", chunk => (data += chunk));
      req.on("end", () => resolve(data));
    });
    const method = req.method || "GET";
    const path = (req.url || "/").split("?")[0];
    this.requests.push({ method, path, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });

    const reply = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };

    const index = this.overrides.findIndex(o => o.method === method && o.path.test(path));
    if (index >= 0) {
      const [override] = this.overrides.splice(index, 1);
      if (override.delayMs) {
        await new Promise(resolve => setTimeout(resolve, override.delayMs));
      }
      return reply(override.status, override.body);
    }

    if (req.headers["ocp-apim-subscription-key"] !== CREDENTIALS.primaryKey) {
      return reply(401, { statusCode: 401, message: "Access denied due to invalid subscription key." });
    }

    if (path.startsWith("/v1_0/apiuser")) {
      return this.provisioning(method, path, req.headers, reply);
    }

    if (req.headers["x-target-environment"] !== ENVIRONMENT) {
      return reply(400, { code: "NOT_ALLOWED_TARGET_ENVIRONMENT", message: "Access to target environment is forbidden." });
    }

    const [, product, ...rest] = path.split("/");
    const route = `/${rest.join("/")}`;

    if (method === "POST" && route === "/token/") {
      const expected = Buffer.from(`${CREDENTIALS.userId}:${CREDENTIALS.userSecret}`).toString("base64");
      if (req.headers.authorization !== `Basic ${expected}`) {
        return reply(401, { error: "login_failed" });
      }
      this.mints++;
      const token = randomBytes(12).toString("hex");
      this.tokens.set(token, product);
      return reply(200, { access_token: token, token_type: "access_token", expires_in: 3600 });
    }

    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (this.tokens.get(bearer) !== product) {
      return reply(401, { code: "UNAUTHORIZED", message: "Access token is invalid or expired." });
    }

    return this.product(method, product, route, req.headers, this.requests[this.requests.length - 1].body, reply);
  }

  private provisioning(
    method: string,
    path: string,
    headers: IncomingHttpHeaders,
    reply: (status: number, body?: unknown) => void
  ): void {
    if (method === "POST" && path === "/v1_0/apiuser") {
      return UUID_V4.test(String(headers["x-reference-id"])) ? reply(201) : reply(400, { code: "INVALID_REFERENCE_ID" });
    }
    if (method === "POST" && /^\/v1_0\/apiuser\/[^/]+\/apikey$/.test(path)) {
      return reply(201, { apiKey: "generated-api-key" });
    }
    reply(404, { code: "RESOURCE_NOT_FOUND", message: "Requested resource was not found." });
  }

  private product(
    method: string,
    product: string,
    route: string,
    headers: IncomingHttpHeaders,
    body: unknown,
    reply: (status: number, body?: unknown) => void
  ): void {
    const initiation = { collection: "/v1_0/requesttopay", disbursement: "/v1_0/transfer", remittance: "/v1_0/transfer" }[
      product
    ];
    let match: RegExpMatchArray | null;

    if (method === "POST" && route === initiation) {
      const referenceId = String(headers["x-reference-id"]);
      if (!UUID_V4.test(referenceId)) {
        return reply(400, { code: "INVALID_REFERENCE_ID", message: "Reference id must be a UUID v4." });
      }
      const callback = headers["x-callback-url"];
      if (callback && new URL(String(callback)).host !== CALLBACK_HOST) {
        return reply(400, { code: "INVALID_CALLBACK_URL_HOST", message: "Callback URL with host not allowed." });
      }
      if (this.transactions.has(referenceId)) {
        return reply(409, {
          code: "RESOURCE_ALREADY_EXIST",
          message: "Duplicated reference id. Creation of resource failed."
        });
      }
      this.transactions.set(referenceId, { ...(body as object), financialTransactionId: "", status: "PENDING" });
      return reply(202);
    }

    if (method === "GET" && initiation && route.startsWith(`${initiation}/`)) {
      const transaction = this.transactions.get(route.slice(initiation.length + 1));
      return transaction
        ? reply(200, transaction)
        : reply(404, { code: "RESOURCE_NOT_FOUND", message: "Requested resource was not found." });
    }

    if (method === "GET" && (match = route.match(/^\/v1_0\/account\/balance(?:\/([A-Z]{3}))?$/))) {
      return reply(200, { availableBalance: "1500", currency: match[1] || "XAF" });
    }

    if (method === "GET" && (match = route.match(/^\/v1_0\/accountholder\/(msisdn|email|party_code)\/([^/]+)\/active$/))) {
      return reply(200, { result: this.accountHolders.get(decodeURIComponent(match[2]))?.active ?? false });
    }

    if (method === "GET" && (match = route.match(/^\/v1_0\/accountholder\/msisdn\/(\d+)\/basicuserinfo$/))) {
      const holder = this.accountHolders.get(match[1]);
      return holder
        ? reply(200, holder.info)
        : reply(404, { code: "RESOURCE_NOT_FOUND", message: "Requested resource was not found." });
    }

    reply(404, { code: "RESOURCE_NOT_FOUND", message: "Requested resource was not found." });
  }
}

export function globalConfig(fake: FakeMtn, overrides: Partial<GlobalConfig> = {}): GlobalConfig {
  return { callbackHost: CALLBACK_HOST, baseUrl: fake.baseUrl, environment: ENVIRONMENT, ...overrides };
}

export function clients(fake: FakeMtn, overrides: Partial<GlobalConfig> = {}, credentials: ProductConfig = CREDENTIALS) {
  const client = momo.create(globalConfig(fake, overrides));
  return {
    collections: client.Collections(credentials),
    disbursements: client.Disbursements(credentials),
    remittances: client.Remittances(credentials),
    users: client.Users({ primaryKey: credentials.primaryKey }),
    client
  };
}

export const PAYER = { partyIdType: PayerType.MSISDN, partyId: "242061234567" };
