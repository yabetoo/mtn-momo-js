// Runs against the built package, as a CommonJS consumer would load it.
const assert = require("assert");
const momo = require("@yabetoo/mtn-momo-js");

assert.strictEqual(typeof momo.create, "function");
assert.strictEqual(typeof momo.default.create, "function");
assert.ok(new momo.UnspecifiedError() instanceof momo.MtnMoMoError);
assert.strictEqual(typeof momo.MemoryTokenStore, "function");
assert.strictEqual(momo.Status.FAILED, "FAILED");
momo.create({ callbackHost: "example.com" }).Collections({ primaryKey: "k", userId: "u", userSecret: "s" });
console.log("cjs ok");
