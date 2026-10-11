import { test } from "node:test";
import assert from "node:assert/strict";
import { farmBusyPets } from "../../src/lib/farm/busy-pets.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
function fixture(missing = false) {
  const scopes: unknown[] = [];
  const result = {
    farm_school_projects: {
      data: { leader_id: "school", status: "puzzle", ready_at: null },
    },
    farm_garden_projects: {
      data: [
        { leader_id: "done", status: "finishing", ready_at: "2000-01-01" },
        { leader_id: "garden", status: "building", ready_at: null },
      ],
    },
    farm_projects: missing
      ? { data: null, error: { code: "PGRST205" } }
      : {
          data: [
            { id: "new", status: "puzzle", ready_at: null },
            { id: "ready", status: "finishing", ready_at: "2000-01-01" },
          ],
        },
    farm_project_assignments: {
      data: [
        { project_id: "new", pet_id: "leader" },
        { project_id: "new", pet_id: "helper" },
      ],
    },
  };
  return {
    scopes,
    db: {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq(key: string, value: string) {
            scopes.push([table, key, value]);
            return this;
          },
          in(key: string, value: string[]) {
            scopes.push([table, key, value]);
            return this;
          },
          maybeSingle() {
            return Promise.resolve(result[table as keyof typeof result]);
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(result[table as keyof typeof result]).then(
              resolve,
            );
          },
        };
      },
    } as unknown as SupabaseClient,
  };
}
test("farm busy filter includes both team roles and excludes offline completed work", async () => {
  const f = fixture();
  const busy = await farmBusyPets(f.db, "owner");
  assert.deepEqual([...busy.all].sort(), [
    "garden",
    "helper",
    "leader",
    "school",
  ]);
  assert.deepEqual(f.scopes, [
    ["farm_school_projects", "user_id", "owner"],
    ["farm_garden_projects", "user_id", "owner"],
    ["farm_projects", "user_id", "owner"],
    ["farm_project_assignments", "project_id", ["new"]],
  ]);
});
test("older schema still respects legacy jobs without querying nonexistent assignments", async () => {
  const f = fixture(true);
  const busy = await farmBusyPets(f.db, "owner");
  assert.deepEqual([...busy.all].sort(), ["garden", "school"]);
  assert.equal(f.scopes.length, 3);
});
