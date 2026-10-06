# @yabetoo/mtn-momo-js

Typed Node.js client for the [MTN Mobile Money (MoMo) API](https://momodeveloper.mtn.com/): collections,
disbursements, remittances and sandbox provisioning.

[![CI](https://github.com/yabetoo/mtn-momo-js/actions/workflows/ci.yml/badge.svg)](https://github.com/yabetoo/mtn-momo-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@yabetoo/mtn-momo-js.svg)](https://www.npmjs.com/package/@yabetoo/mtn-momo-js)

- **ESM and CommonJS**, TypeScript declarations included, one runtime dependency (`axios`).
- **Token cache** with single-flight minting and a pluggable store (Redis…), shared across processes.
- **One retry after a 401**, with the same `X-Reference-Id`, so a retried initiation can never execute twice.
- **Typed errors** carrying the HTTP status, the failing path and MTN's raw reason code.
- **Observability hook** with templated routes: no phone number, header or secret ever reaches it.
- Works with API user ids in any format (MTN no longer issues only UUIDs).

Requires Node.js 20 or later.

## Installation

```sh
npm install @yabetoo/mtn-momo-js
```

## Quick start

```ts
import momo from "@yabetoo/mtn-momo-js";

const { Collections } = momo.create({
  callbackHost: "callbacks.example.com",
  baseUrl: "https://momoapi.momo.africa",
  environment: "mtncongo" // the X-Target-Environment MTN assigned to you
});

const collections = Collections({
  primaryKey: process.env.MOMO_COLLECTION_PRIMARY_KEY!,
  userId: process.env.MOMO_COLLECTION_USER_ID!,
  userSecret: process.env.MOMO_COLLECTION_USER_SECRET!
});

const referenceId = await collections.requestToPay({
  amount: "1000",
  currency: "XAF",
  externalId: "order_123",
  payer: { partyIdType: "MSISDN", partyId: "242061234567" },
  payerMessage: "Order 123",
  payeeNote: "Order 123"
});

const payment = await collections.getTransaction(referenceId); // PENDING until the payer answers
```

CommonJS works the same way: `const momo = require("@yabetoo/mtn-momo-js")`.

## Configuration

`momo.create(config)` takes:

| Option | Required | Description |
| --- | --- | --- |
| `callbackHost` | yes | Host MTN calls back on. Any `callbackUrl` must belong to it. |
| `baseUrl` | outside the sandbox | Gateway URL. Defaults to `https://sandbox.momodeveloper.mtn.com`. |
| `environment` | no | `X-Target-Environment`, sent on every request including the token mint. Defaults to `sandbox`. |
| `timeout` | no | Per-request timeout in milliseconds. Defaults to `30000`. |
| `tokenStore` | no | Where access tokens are cached. Defaults to an in-memory store scoped to this `create()`. |
| `onEvent` | no | Observability hook, see [Observability](#observability). |

Each product then takes its own credentials: `{ primaryKey, userId, userSecret }`.

Clients built from the same `create()` share their tokens. Building a client is cheap: it is fine to build
one per request.

## API

Every product client (`Collections`, `Disbursements`, `Remittances`) exposes:

| Method | Returns |
| --- | --- |
| `getTransaction(referenceId)` | The transaction. A `FAILED` one rejects with its typed error. |
| `getBalance(currency?)` | `{ availableBalance, currency }`, in the account currency or the one given. |
| `isPayerActive(id, type = "MSISDN")` | `true` if the account holder is registered and active. An answer without a boolean rejects. |
| `getBasicUserInfo(msisdn)` | The holder's name (`given_name`, `family_name`…). Rejects with `status: 404` for an unknown number. |

And one initiation, each returning the reference sent as `X-Reference-Id`:

| Product | Method |
| --- | --- |
| `Collections` | `requestToPay({ amount, currency, payer, externalId?, payerMessage?, payeeNote?, referenceId?, callbackUrl? })` |
| `Disbursements` | `transfer({ amount, currency, payee, … })` |
| `Remittances` | `remit({ amount, currency, payee, … })` |

`referenceId` must be a UUID v4 and is generated when omitted. Pass your own to make an initiation
idempotent: MTN answers `409 RESOURCE_ALREADY_EXIST` to a reused reference.

MSISDNs are in international format without `+` (`242061234567`).

## Token cache

Tokens are minted once per product, environment and API user, cached until one minute before expiry, and
shared by concurrent calls. To share them across processes, pass a store:

```ts
import type { TokenStore } from "@yabetoo/mtn-momo-js";

const tokenStore: TokenStore = {
  get: key => redis.get(key),
  set: async (key, token, ttlSeconds) => void (await redis.set(key, token, "EX", ttlSeconds)),
  delete: async key => void (await redis.del(key))
};

momo.create({ callbackHost, baseUrl, environment, tokenStore });
```

The store is a cache, never a dependency. A failing `get` counts as a miss, and a failing `set` or
`delete` is ignored. Each failure is reported to `onEvent` as `token_store_error`.

When MTN answers `401` to a product call, the token is dropped and the request is retried **once** with a
fresh one. The retry carries the same `X-Reference-Id`. A failed mint is never retried.

## Errors

Validation errors are thrown **before** any network call, as Node's `AssertionError`.

Errors returned by MTN reject as subclasses of `MtnMoMoError`, chosen from MTN's error code
(`NotEnoughFundsError`, `PayerNotFoundError`, `ResourceAlreadyExistError`…). A code without a dedicated class
gives `UnspecifiedError`.

| Property | Meaning |
| --- | --- |
| `status` | HTTP status of the MTN response. |
| `url` | Path that failed. `/{product}/token/` means the token mint failed and the product call was never sent. |
| `failureReason` | MTN's raw code or transaction `reason`, including codes without a class. |
| `transaction` | The transaction, when `getTransaction` read a `FAILED` one. |

Network failures (timeout, refused connection, DNS) are **not** wrapped. They reject with the axios error,
whose `code` (`ECONNABORTED`, `ECONNREFUSED`, `ENOTFOUND`…) tells you whether the request may have reached
MTN. Its request headers and socket are stripped, so it is safe to log.

```ts
import { MtnMoMoError, NotEnoughFundsError } from "@yabetoo/mtn-momo-js";

try {
  await collections.getTransaction(referenceId);
} catch (error) {
  if (error instanceof NotEnoughFundsError) {
    // the payer could not pay
  } else if (error instanceof MtnMoMoError) {
    console.error(error.status, error.url, error.failureReason);
  } else {
    throw error; // network error: the outcome is unknown, read the transaction again later
  }
}
```

## Observability

`onEvent` receives one event per HTTP response, token mints included:

```ts
momo.create({
  // …
  onEvent: event => {
    if (event.type === "response") {
      metrics.observe("momo_request", event.durationMs, {
        product: event.product,
        method: event.method,
        route: event.route,
        status: String(event.status ?? "network_error")
      });
    }
  }
});
```

`route` is templated (`/collection/v1_0/accountholder/msisdn/{id}/basicuserinfo`,
`/collection/v1_0/requesttopay/{referenceId}`), so it is safe as a metric label. `errorCode` holds MTN's code
or the network error code. A hook that throws is ignored.

## Sandbox provisioning

In the sandbox, create an API user and its key with the subscription key of a product:

```ts
const { Users } = momo.create({ callbackHost: "callbacks.example.com" });
const users = Users({ primaryKey: process.env.MOMO_SANDBOX_PRIMARY_KEY! });

const userId = await users.create("callbacks.example.com");
const { apiKey: userSecret } = await users.login(userId);
```

In production, MTN issues API users from its partner portal.

## Development

```sh
npm ci
npm run typecheck
npm test            # against a strict in-process fake of the MTN gateway
npm run build
npm run smoke       # loads the built package through require and import
```

## License

MIT
