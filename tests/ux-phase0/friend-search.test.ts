import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFriendName } from "../../src/lib/friendSearch.ts";

test("nickname search trims Thai and English names without converting to friend codes", () => {
  assert.equal(normalizeFriendName("  น้องมิน  "), "น้องมิน");
  assert.equal(normalizeFriendName("Pond"), "Pond");
});
test("nickname lookup cannot be used as a wildcard profile directory", () => {
  for (const name of ["", "ก", "%a", "__", "a\\b", "a\nb", "a".repeat(41)]) {
    assert.throws(() => normalizeFriendName(name));
  }
});
