import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFriendName, friendNamePattern } from "../../src/lib/friendSearch.ts";
import { invitationDestination } from "../../src/lib/friendInvite.ts";

test("nickname search trims Thai and English names without converting to friend codes", () => {
  assert.equal(normalizeFriendName("  น้องมิน  "), "น้องมิน");
  assert.equal(normalizeFriendName("Pond"), "Pond");
});
test("nickname lookup cannot be used as a wildcard profile directory", () => {
  for (const name of ["", "ก", "a\nb", "a".repeat(41)]) {
    assert.throws(() => normalizeFriendName(name));
  }
  assert.equal(friendNamePattern("Pond_1%"), "Pond\\_1\\%");
  assert.equal(friendNamePattern("a\\b"), "a\\\\b");
});
test("invites cannot redirect outside the friend page", () => {
  assert.equal(invitationDestination("abcd1234"), "/social/add-friend?code=ABCD1234");
  for (const code of [null, "", "//evil.test", "https://evil.test", "ABCD1234?x=1"]) assert.equal(invitationDestination(code), "/pet");
});
