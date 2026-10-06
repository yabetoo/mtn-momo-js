# Changelog

## 0.2.0

### Added

- `getBasicUserInfo(msisdn)` on every product: the account holder's name.
- `getBalance(currency?)`: balance in a given currency.
- `tokenStore` option: pluggable token cache (Redis…), shared across `create()` calls and processes;
  store failures never fail a call and are reported to `onEvent`.
- One retry after a `401` with a fresh token, carrying the same `X-Reference-Id`.
- `timeout` option (default 30 s) and `onEvent` observability hook with templated routes.
- `MtnMoMoError` now carries `status`, `url` and `failureReason`; `failureReason` keeps codes without a
  dedicated class, such as `COULD_NOT_PERFORM_TRANSACTION`.
- `partyIdType` accepts the plain string (`"MSISDN"`) as well as the enum member.
- Native ESM build next to CommonJS, with type declarations for both.

### Changed

- Concurrent calls share one token mint instead of minting one each.
- Network errors keep their axios `code` but lose their request headers and socket, so they are safe to log.
- `isPayerActive` returns a `boolean` instead of MTN's `{ result }` body.
- Validation error messages no longer depend on the Node.js version.
- `axios` 1.x; `uuid` and `commander` removed. Node.js 20 or later.

### Removed

- The `momo-sandbox` CLI: provision sandbox users with `Users.create` and `Users.login`.

## 0.1.5

- API user ids are no longer required to be UUIDs.
