import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogueGate,
  type CatalogueContext,
} from "../../src/lib/farm/catalogue-gates.ts";
import { FARM_CATALOGUE } from "../../src/lib/farm/catalogue.ts";
const context: CatalogueContext = {
  level: 2,
  blueprints: ["pond-cycle-v1", "flower-photosynthesis-v1"],
  placed: { garden: 1 },
  reserved: {},
  activeJobs: 0,
  jobLimit: 2,
  coins: 100,
  leaderStages: [2, 3],
};
const def = (id: string) => FARM_CATALOGUE.find((c) => c.id === id)!;
test("pond and flower require discovery, capacity, coins and suitable free leader", () => {
  for (const id of ["pond", "flower"]) {
    assert.equal(catalogueGate(def(id), context).ready, true);
    for (const change of [
      { blueprints: [] },
      { level: 1 },
      { activeJobs: 2 },
      { coins: 49 },
      { leaderStages: [] },
      { reserved: { [id]: 3 } },
    ])
      assert.equal(
        catalogueGate(def(id), { ...context, ...change }).ready,
        false,
      );
  }
  assert.equal(
    catalogueGate(def("flower"), { ...context, leaderStages: [2] }).ready,
    false,
  );
});
test("school upgrade requires a placed pond, not a reserved pond", () => {
  assert.equal(
    catalogueGate(def("school-3"), { ...context, reserved: { pond: 1 } }).ready,
    false,
  );
  assert.equal(
    catalogueGate(def("school-3"), { ...context, placed: { pond: 1 } }).ready,
    true,
  );
});
test("completed places still count towards the repeat cap", () => {
  assert.equal(
    catalogueGate(def("pond"), {
      ...context,
      placed: { pond: 3 },
      reserved: { pond: 3 },
    }).ready,
    false,
  );
  assert.equal(
    catalogueGate(def("pond"), {
      ...context,
      placed: { pond: 2 },
      reserved: { pond: 2 },
    }).ready,
    true,
  );
});

test("endgame gates require placed flower and bridge plus grown existing Qmon", () => {
  const ready = {
    ...context,
    level: 3,
    leaderStages: [4],
    coins: 500,
    placed: { flower: 1, bridge: 1 },
  };
  assert.equal(catalogueGate(def("school-4"), ready).ready, true);
  assert.equal(
    catalogueGate(def("school-4"), { ...ready, placed: { flower: 1 } }).ready,
    false,
  );
  assert.equal(
    catalogueGate(def("school-4"), { ...ready, leaderStages: [3] }).ready,
    false,
  );
  const observer = {
    ...ready,
    level: 4,
    blueprints: ["observatory-orbits-v1"],
  };
  assert.equal(catalogueGate(def("observatory"), observer).ready, true);
  assert.equal(
    catalogueGate(def("observatory"), {
      ...observer,
      reserved: { observatory: 1 },
    }).ready,
    false,
  );
  assert.equal(
    catalogueGate(def("bridge"), {
      ...ready,
      blueprints: ["bridge-balance-v1"],
      reserved: { bridge: 2 },
    }).ready,
    false,
  );
});
