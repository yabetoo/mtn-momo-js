// Runs against the built package, as an ESM consumer would load it.
import assert from "assert";
import momo, { create, MtnMoMoError, UnspecifiedError } from "@yabetoo/mtn-momo-js";

assert.strictEqual(typeof create, "function");
assert.ok(new UnspecifiedError() instanceof MtnMoMoError);

// Consumers stub the default export's `create` in their tests (sinon.stub(momo, "create")).
const original = momo.create;
momo.create = () => "stubbed";
assert.strictEqual(momo.create(), "stubbed");
momo.create = original;
console.log("esm ok");
