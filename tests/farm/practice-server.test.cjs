/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server component and closure authorization checks. */
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
let user = { id: "owner" },
  reads = 0;
const file = path.resolve("src/app/collection/practice/[kind]/page.tsx"),
  loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded.require = (name) =>
  name === "next/link"
    ? () => null
    : name === "next/navigation"
      ? {
          redirect() {
            throw Error("redirect");
          },
          notFound() {
            throw Error("notFound");
          },
        }
      : name === "@/lib/supabase/server"
        ? { getUser: async () => user }
        : name === "@/lib/farm/school-server"
          ? {
              loadSchoolProject: async () => {
                reads++;
                return { status: "placed" };
              },
              loadSchoolPets: async () => {
                reads++;
                return [{ id: "pet", name: "คู่หู" }];
              },
            }
          : name === "@/lib/farm/construction-puzzles"
            ? {
                generateConstruction: (kind) => ({
                  kind,
                  seed: 765,
                  answer: "private",
                }),
                publicConstruction: (b) => ({ kind: b.kind }),
                validateConstruction: (b, d) => ({
                  ok: d.solution === b.answer,
                  message: "แก้ผังเดิมต่อ",
                }),
                hintConstruction: () => "คำใบ้",
              }
            : name === "@/components/farm/ConstructionPreview"
              ? function Puzzle() {}
              : require(name);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  file,
);
const page = loaded.exports.default;
test("practice rejects unauthenticated users before any project reads", async () => {
  user = null;
  reads = 0;
  await assert.rejects(
    page({ params: Promise.resolve({ kind: "construction-floor" }) }),
    /redirect/,
  );
  assert.equal(reads, 0);
  user = { id: "owner" };
});
test("practice closures authorize their owner and keep private answer out of props", async () => {
  const rendered = await page({
    params: Promise.resolve({ kind: "construction-floor" }),
  });
  const puzzle = rendered.props.children.find((c) => c?.props?.submit),
    { submit, hint } = puzzle.props;
  assert.equal(JSON.stringify(puzzle.props.puzzle).includes("private"), false);
  assert.equal(JSON.stringify(puzzle.props.puzzle).includes("seed"), false);
  assert.equal((await submit({ passed: true })).passed, false);
  assert.equal((await submit({ solution: "private" })).passed, true);
  assert.match(
    (await submit({ solution: "private" })).message,
    /ไม่มีเหรียญ EXP/,
  );
  await assert.rejects(hint({}, 4), /คำใบ้/);
  user = { id: "another" };
  await assert.rejects(submit({ solution: "private" }), /เจ้าของ/);
  await assert.rejects(hint({}, 1), /เจ้าของ/);
  user = { id: "owner" };
});
