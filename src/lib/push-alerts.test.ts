import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowIosHint } from "./push-alerts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";

test("the iPhone and iPad hint shows only outside the home screen app", () => {
  assert.equal(shouldShowIosHint(IPHONE, false), true);
  assert.equal(shouldShowIosHint(IPAD, false), true);
  assert.equal(shouldShowIosHint(IPHONE, true), false);
});

test("other devices never see the iPhone hint", () => {
  assert.equal(shouldShowIosHint(ANDROID, false), false);
  assert.equal(shouldShowIosHint("", false), false);
});
