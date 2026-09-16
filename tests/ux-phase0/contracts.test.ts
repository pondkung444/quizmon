import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { UX_FUNNEL_EVENTS, hasUxFunnelContext, viewportGroup } from "../../src/lib/analyticsContract.ts";

test("Phase 0 funnel contract contains every roadmap event exactly once", () => {
  assert.equal(new Set(UX_FUNNEL_EVENTS).size, 11);
  assert.deepEqual(UX_FUNNEL_EVENTS, [
    "guest_started", "guest_ready", "starter_egg_viewed", "pet_hatched",
    "home_next_action_viewed", "activity_started", "question_answered",
    "activity_completed", "reward_claimed", "review_opened", "locked_cta_clicked",
  ]);
});

test("viewport buckets keep the Phase 0 mobile matrix distinct from desktop", () => {
  assert.equal(viewportGroup(360), "mobile_small");
  assert.equal(viewportGroup(375), "mobile_small");
  assert.equal(viewportGroup(393), "mobile");
  assert.equal(viewportGroup(412), "mobile_large");
  assert.equal(viewportGroup(1440), "desktop");
});

test("funnel events require route, viewport group, and user state", () => {
  assert.equal(hasUxFunnelContext({ route: "/guest", viewport_group: "mobile", user_state: "guest_setup" }), true);
  assert.equal(hasUxFunnelContext({ route: "/guest", viewport_group: "mobile" }), false);
});

test("guest repair is anonymous-only, serialized, and idempotent", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260915090000_guest_provisioning_recovery.sql", import.meta.url), "utf8");
  assert.match(sql, /is_anonymous is true/);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /not exists \([\s\S]*source = 'starter'/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /revoke all on function public\.repair_guest_provisioning\(\) from public/);
  assert.match(sql, /grant execute on function public\.repair_guest_provisioning\(\) to authenticated/);
  assert.doesNotMatch(sql, /push_|notification_/);
});
