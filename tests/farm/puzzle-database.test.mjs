import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
let db;
let pool;
if (process.env.FARM_TEST_DATABASE_URL) {
  const url = new URL(process.env.FARM_TEST_DATABASE_URL);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/qmon_farm_test"
  )
    throw new Error("Refusing a non-local or non-test database");
  const { Client, Pool, types } = await import("pg");
  types.setTypeParser(20, (value) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error("Unsafe integer");
    return n;
  });
  const client = new Client({ connectionString: url.href });
  await client.connect();
  pool = new Pool({ connectionString: url.href, max: 2 });
  db = {
    query: (...args) => client.query(...args),
    exec: (sql) => client.query(sql),
    close: async () => {
      await client.end();
      await pool.end();
    },
  };
} else db = new PGlite();
let checks = 0;
const u = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  pet = "00000000-0000-4000-8000-000000000003";
const scalar = async (sql, args = []) =>
  Object.values(
    (
      await db.query(
        sql,
        args.map((value) =>
          Array.isArray(value) ? JSON.stringify(value) : value,
        ),
      )
    ).rows[0],
  )[0];
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const reject = async (sql, args, pattern) => {
  await assert.rejects(
    db.query(
      sql,
      args.map((value) =>
        Array.isArray(value) ? JSON.stringify(value) : value,
      ),
    ),
    pattern,
  );
  checks++;
};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table pets(id uuid primary key,user_id uuid,stage int,is_active boolean,exp int default 0);
 create table daily_missions(id uuid primary key,user_id uuid,target_count int,bonus_exp smallint,bonus_awarded_at timestamptz);
 create table quiz_attempts(id serial primary key,user_id uuid,mission_id uuid);
 create table dungeon_runs(id serial primary key,pet_id uuid,user_id uuid,status text);
 insert into auth.users values('${u}'),('${other}');insert into pets values('${pet}','${u}',4,true,0);`);
  for (const name of [
    "20261004143439_farm_school_tutorial.sql",
    "20261005023219_farm_blueprint_discovery.sql",
    "20261005052159_farm_garden_construction.sql",
    "20261011144152_qmon_farm_project_foundation.sql",
    "20261011152519_qmon_farm_puzzle_sessions.sql",
    "20261011162721_qmon_farm_school_teams.sql",
    "20261011170920_qmon_farm_layout_connectors.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + name, "utf8"));
  await db.exec(`insert into farm_school_projects(user_id,status,tile_x,tile_y) values('${u}','placed',1,1);
 insert into farm_wallets values('${u}',500);
 insert into farm_garden_projects(user_id,request_id,builder_id,status,remaining_seconds,price,finish_seconds,round_seconds,penalty_seconds,tile_x,tile_y) values('${u}',gen_random_uuid(),'${pet}','placed',0,40,300,180,60,2,1);
 update farm_catalogue set enabled=true where id='school-2';`);
  const p = await scalar(
    "select farm_project_buy($1,'school-2',gen_random_uuid(),$2)",
    [u, pet],
  );
  const id = p.id;
  await db.query("update farm_projects set ready_at='2000-01-01' where id=$1", [
    id,
  ]);
  let state = await scalar("select farm_project_command($1,$2,'begin')", [
    u,
    id,
  ]);
  const board = { kind: "pond", version: 1, secret: "answer", seed: 987 };
  let opened = await scalar("select farm_puzzle_open($1,$2,0,$3)", [
    u,
    id,
    board,
  ]);
  const session = opened.session.session_id;
  eq(opened.session.puzzle, board);
  eq(
    (
      await scalar("select farm_puzzle_open($1,$2,0,$3)", [
        u,
        id,
        { ...board, seed: 111 },
      ])
    ).session.puzzle,
    board,
  );
  await reject(
    "select farm_puzzle_open($1,$2,0,$3)",
    [other, id, board],
    /ไม่พบ/,
  );
  await reject(
    "select farm_puzzle_open($1,$2,1,$3)",
    [u, id, board],
    /จุดช่วย/,
  );
  let draft = await scalar("select farm_puzzle_draft($1,$2,$3,0,$4)", [
    u,
    id,
    session,
    { tiles: [] },
  ]);
  eq(draft.saved, true);
  eq(draft.revision, 1);
  draft = await scalar("select farm_puzzle_draft($1,$2,$3,0,$4)", [
    u,
    id,
    session,
    { tiles: [{ r: 1 }] },
  ]);
  eq(draft.saved, false);
  eq(draft.draft, { tiles: [] });
  const deadline = state.round_deadline,
    nonce = "00000000-0000-4000-8000-000000000007";
  let r = await scalar("select farm_puzzle_submit($1,$2,$3,$4,$5,$6,false)", [
    u,
    id,
    session,
    deadline,
    nonce,
    { tiles: [{ r: 1, c: 1, rot: 0, kind: "I" }] },
  ]);
  eq(r.passed, false);
  eq(r.project.failures, 1);
  eq(r.revision, 2);
  const continuedDraft = await scalar(
    "select farm_puzzle_draft($1,$2,$3,$4,$5)",
    [
      u,
      id,
      session,
      r.revision,
      { tiles: [{ r: 1, c: 1, rot: 1, kind: "I" }] },
    ],
  );
  eq(continuedDraft.saved, true);
  eq(continuedDraft.revision, 3);
  eq(r.project.round_deadline, deadline);
  eq(
    await scalar("select farm_puzzle_submit($1,$2,$3,$4,$5,$6,true)", [
      u,
      id,
      session,
      deadline,
      nonce,
      { tiles: [] },
    ]),
    r,
  );
  opened = await scalar("select farm_puzzle_open($1,$2,0,$3)", [u, id, board]);
  eq(opened.session.draft.tiles.length, 1);
  eq(opened.session.session_id, session);
  await db.query(
    "update farm_projects set round_deadline='2000-01-01' where id=$1",
    [id],
  );
  await reject(
    "select farm_puzzle_submit($1,$2,$3,$4,gen_random_uuid(),$5,true)",
    [u, id, session, deadline, { tiles: [] }],
    /รอบเล่น/,
  );
  r = await scalar(
    "select farm_puzzle_submit($1,$2,$3,'2000-01-01',gen_random_uuid(),$4,true)",
    [u, id, session, { tiles: [] }],
  );
  eq(r.passed, false);
  eq(r.project.failures, 2);
  eq(r.project.round_deadline, null);
  await reject(
    "select farm_puzzle_submit($1,$2,$3,'2000-01-01',gen_random_uuid(),$4,true)",
    [u, id, session, { tiles: [] }],
    /รอบเล่น/,
  );
  state = await scalar("select farm_project_command($1,$2,'begin')", [u, id]);
  eq(
    (
      await scalar("select farm_puzzle_open($1,$2,0,$3)", [
        u,
        id,
        { ...board, seed: 123 },
      ])
    ).session.puzzle,
    board,
  );
  r = await scalar(
    "select farm_puzzle_submit($1,$2,$3,$4,gen_random_uuid(),$5,true)",
    [u, id, session, state.round_deadline, { tiles: [] }],
  );
  eq(r.passed, true);
  eq(r.project.checkpoint, 1);
  await reject(
    "select farm_puzzle_draft($1,$2,$3,3,$4)",
    [u, id, session, { tiles: [] }],
    /ไม่พบ/,
  );
  eq(
    await scalar(
      "select completed_at is not null from farm_project_checkpoints where project_id=$1",
      [id],
    ),
    true,
  );
  await db.exec("set role authenticated");
  await reject(
    "select * from farm_project_checkpoints",
    [],
    /permission denied/,
  );
  await reject(
    "select * from farm_puzzle_submissions",
    [],
    /permission denied/,
  );
  await reject(
    "select farm_puzzle_open($1,$2,0,$3)",
    [u, id, board],
    /permission denied/,
  );
  await db.exec("reset role");
  // Untimed guided discovery: one unlock, replay keeps rewards unchanged.
  await db.exec("update farm_catalogue set enabled=true where id='pond';");
  await reject(
    "select farm_lesson_open($1,$2,$3,$4)",
    [u, "pond-cycle-v1", pet, board],
    /พัฒนาโรงเรียน/,
  );
  await db.query("update farm_projects set status='placed' where id=$1", [id]);
  await scalar("select farm_project_release($1)", [id]);
  await reject(
    "select farm_lesson_open($1,$2,$3,$4)",
    [other, "pond-cycle-v1", pet, board],
    /พัฒนาโรงเรียน|เลือก/,
  );
  let lesson = await scalar("select farm_lesson_open($1,$2,$3,$4)", [
    u,
    "pond-cycle-v1",
    pet,
    board,
  ]);
  const lessonId = lesson.session_id;
  eq(
    (
      await scalar("select farm_lesson_open($1,$2,$3,$4)", [
        u,
        "pond-cycle-v1",
        pet,
        { ...board, seed: 12 },
      ])
    ).puzzle,
    board,
  );
  let answer = await scalar(
    "select farm_lesson_answer($1,$2,0,$3,true,false)",
    [u, lessonId, { tiles: [] }],
  );
  eq(answer.passed, false);
  eq(answer.revision, 1);
  eq(
    (
      await scalar("select farm_lesson_answer($1,$2,0,$3,true,false)", [
        u,
        lessonId,
        { tiles: [] },
      ])
    ).saved,
    false,
  );
  eq(
    await scalar(
      "select failures from farm_lesson_sessions where session_id=$1",
      [lessonId],
    ),
    1,
  );
  answer = await scalar("select farm_lesson_answer($1,$2,1,$3,true,true)", [
    u,
    lessonId,
    { tiles: [] },
  ]);
  eq(answer.passed, true);
  eq(answer.created, true);
  eq(
    (
      await scalar("select farm_lesson_answer($1,$2,1,$3,true,true)", [
        u,
        lessonId,
        { tiles: [] },
      ])
    ).created,
    false,
  );
  lesson = await scalar("select farm_lesson_open($1,$2,$3,$4,true)", [
    u,
    "pond-cycle-v1",
    pet,
    { ...board, seed: 22 },
  ]);
  assert.notEqual(lesson.session_id, lessonId);
  checks++;
  eq(lesson.draft, null);
  answer = await scalar("select farm_lesson_answer($1,$2,0,$3,true,true)", [
    u,
    lesson.session_id,
    { tiles: [] },
  ]);
  eq(answer.passed, true);
  eq(answer.created, false);
  eq(
    await scalar(
      "select count(*) from farm_blueprint_discoveries where blueprint_id=$1",
      ["pond-cycle-v1"],
    ),
    1,
  );
  eq(
    await scalar("select balance from farm_wallets where user_id=$1", [u]),
    460,
  );
  await db.exec("set role authenticated");
  await reject("select * from farm_lesson_sessions", [], /permission denied/);
  await db.exec("reset role");
  // Legacy school round preserves draft and the original 90-second clock.
  await db.query("delete from farm_projects where id=$1", [id]);
  await db.exec(
    `update farm_school_projects set status='puzzle',leader_id='${pet}',round_deadline=now()+interval '90 seconds',tile_x=null,tile_y=null where user_id='${u}';`,
  );
  const floor = [{ id: "sun", x: 0, y: 0, rotation: 0 }];
  state = await scalar("select farm_school_command($1,'draft',null,$2)", [
    u,
    floor,
  ]);
  eq(state.project.draft_layout, floor);
  const schoolDeadline = state.project.round_deadline;
  r = await scalar("select farm_school_command($1,'submit',null,$2)", [
    u,
    floor,
  ]);
  eq(r.passed, false);
  eq(r.project.round_deadline, schoolDeadline);
  eq(r.project.draft_layout, floor);
  await reject(
    "select farm_school_command($1,'draft',null,$2)",
    [u, [null]],
    /ผังร่าง/,
  );
  await reject(
    "select farm_school_command($1,'draft',null,$2)",
    [u, [{ id: "sun", x: 0, y: 0 }]],
    /ผังร่าง/,
  );
  eq(
    await scalar("select balance from farm_wallets where user_id=$1", [u]),
    460,
  );
  // Existing gardens retain prices, deadlines, leadership changes and layouts.
  await scalar("select farm_school_command($1,'pause')", [u]);
  await db.exec(
    `update farm_school_projects set status='placed',tile_x=1,tile_y=1 where user_id='${u}';insert into farm_blueprint_discoveries(user_id,blueprint_id,pet_id) values('${u}','garden-rest-v1','${pet}');`,
  );
  let garden = await scalar(
    "select farm_garden_command($1,'buy',null,$2,gen_random_uuid())",
    [u, pet],
  );
  const gardenId = garden.project.id;
  eq(garden.project.price, 40);
  eq(garden.project.remaining_seconds, 300);
  await db.query(
    "update farm_garden_projects set ready_at='2000-01-01' where id=$1",
    [gardenId],
  );
  garden = await scalar("select farm_garden_command($1,'begin',$2)", [
    u,
    gardenId,
  ]);
  const gardenDeadline = garden.project.round_deadline;
  const pathLayout = [{ id: "bend-a", x: 1, y: 3, rotation: 3 }];
  garden = await scalar(
    "select farm_garden_command($1,'draft',$2,null,null,$3)",
    [u, gardenId, pathLayout],
  );
  eq(garden.project.draft_layout, pathLayout);
  garden = await scalar(
    "select farm_garden_command($1,'submit',$2,null,null,$3)",
    [u, gardenId, pathLayout],
  );
  eq(garden.passed, false);
  eq(garden.project.round_deadline, gardenDeadline);
  await scalar("select farm_garden_command($1,'pause',$2)", [u, gardenId]);
  garden = await scalar("select farm_garden_command($1,'resume',$2,$3)", [
    u,
    gardenId,
    pet,
  ]);
  eq(garden.project.draft_layout, pathLayout);
  const solved = [
    { id: "bend-a", x: 1, y: 3, rotation: 3 },
    { id: "straight-a", x: 1, y: 2, rotation: 0 },
    { id: "bend-b", x: 1, y: 1, rotation: 1 },
    { id: "straight-b", x: 2, y: 1, rotation: 1 },
    { id: "bend-c", x: 3, y: 1, rotation: 3 },
  ];
  await scalar("select farm_garden_command($1,'begin',$2)", [u, gardenId]);
  garden = await scalar(
    "select farm_garden_command($1,'submit',$2,null,null,$3)",
    [u, gardenId, solved],
  );
  eq(garden.passed, true);
  eq(garden.project.layout, solved);
  eq(garden.project.remaining_seconds, 300);
  eq(
    await scalar("select balance from farm_wallets where user_id=$1", [u]),
    440,
  ); // Legacy school milestone is credited once by the original wallet command.

  // Entirely synthetic advanced-school fixtures; never run against a real account.
  const advanced = "00000000-0000-4000-8000-000000009000",
    head = "00000000-0000-4000-8000-000000009001",
    assist = "00000000-0000-4000-8000-000000009002";
  await db.exec(`insert into auth.users values('${advanced}');insert into pets(id,user_id,stage,is_active) values('${head}','${advanced}',4,false),('${assist}','${advanced}',2,false);
   insert into farm_school_projects(user_id,status,tile_x,tile_y) values('${advanced}','placed',1,1);
   insert into farm_wallets values('${advanced}',1000);update farm_catalogue set enabled=true;`);
  await reject(
    "select farm_lesson_open($1,$2,$3,$4,false)",
    [advanced, "bridge-balance-v1", head, { version: 1 }],
    /โรงเรียน/,
  );
  await reject(
    "select farm_lesson_open($1,$2,$3,$4,false)",
    [advanced, "observatory-orbits-v1", head, { version: 1 }],
    /โรงเรียน/,
  );
  let expectedBalance = 1000;
  const buildPlace = async (kind, blueprint, price, reward, x, y) => {
    await reject(
      "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
      [advanced, kind, head],
      /ค้นพบ/,
    );
    if (kind === "garden")
      await scalar("select farm_discover_blueprint($1,$2,$3)", [
        advanced,
        head,
        blueprint,
      ]);
    else {
      const lesson = await scalar(
        "select farm_lesson_open($1,$2,$3,$4,false)",
        [advanced, blueprint, head, { version: 1, kind, seed: 125 }],
      );
      await scalar("select farm_lesson_answer($1,$2,0,$3,true,true)", [
        advanced,
        lesson.session_id,
        { tiles: [] },
      ]);
    }
    let place = await scalar(
      "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
      [advanced, kind, head],
    );
    expectedBalance -= price;
    for (
      let point = 0;
      point < place.rules_snapshot.waits.length - 1;
      point++
    ) {
      await db.query(
        "update farm_projects set ready_at='2000-01-01' where id=$1",
        [place.id],
      );
      await scalar("select farm_project_command($1,$2,'begin')", [
        advanced,
        place.id,
      ]);
      place = await scalar(
        "select farm_project_checkpoint_result($1,$2,true)",
        [advanced, place.id],
      );
      eq(place.checkpoint, point + 1);
    }
    eq(place.status, "finishing");
    await db.query(
      "update farm_projects set ready_at='2000-01-01' where id=$1",
      [place.id],
    );
    place = await scalar("select farm_layout_place($1,$2,$3,$4,0)", [
      advanced,
      place.id,
      x,
      y,
    ]);
    expectedBalance += reward;
    eq(place.status, "placed");
    await scalar("select farm_layout_place($1,$2,$3,$4,0)", [
      advanced,
      place.id,
      x,
      y,
    ]);
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [
        advanced,
      ]),
      expectedBalance,
    );
    return place;
  };

  for (const [kind, , price, reward, target] of [
    ["school-2", ["garden"], 40, 30, 2],
    ["school-3", ["pond"], 100, 40, 3],
    ["school-4", ["flower", "bridge"], 160, 60, 4],
  ]) {
    if (target === 2)
      await reject(
        "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
        [advanced, kind, head],
        /ก่อน/,
      );
    if (target === 2)
      await buildPlace("garden", "garden-rest-v1", 40, 20, 2, 0);
    let upgrade = await scalar(
      "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
      [advanced, kind, head],
    );
    expectedBalance -= price;
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [
        advanced,
      ]),
      expectedBalance,
    );
    if (target > 2) {
      upgrade = await scalar(
        "select farm_project_command($1,$2,'team',$3,array[$4]::uuid[])",
        [advanced, upgrade.id, head, assist],
      );
      eq(upgrade.helper_count, 1);
      await reject(
        "insert into dungeon_runs(user_id,pet_id,status) values($1,$2,'in_progress')",
        [advanced, assist],
        /ติดงาน/,
      );
      await reject(
        "select farm_project_command($1,$2,'team',$3)",
        [advanced, upgrade.id, assist],
        /ระยะถึง/,
      );
    }
    for (
      let index = 0;
      index < upgrade.rules_snapshot.waits.length - 1;
      index++
    ) {
      await db.query(
        "update farm_projects set ready_at='2000-01-01' where id=$1",
        [upgrade.id],
      );
      upgrade = await scalar("select farm_project_command($1,$2,'begin')", [
        advanced,
        upgrade.id,
      ]);
      upgrade = await scalar(
        "select farm_project_checkpoint_result($1,$2,true)",
        [advanced, upgrade.id],
      );
    }
    eq(upgrade.status, "finishing");
    await db.query(
      "update farm_projects set ready_at='2000-01-01' where id=$1",
      [upgrade.id],
    );
    // Due finishing does not block an adventure even before the explicit refresh.
    const run = await scalar(
      "insert into dungeon_runs(user_id,pet_id,status) values($1,$2,'in_progress') returning id",
      [advanced, head],
    );
    upgrade = await scalar("select farm_project_place($1,$2,99,99)", [
      advanced,
      upgrade.id,
    ]);
    eq([upgrade.tile_x, upgrade.tile_y], [1, 1]);
    eq(await scalar("select farm_school_level($1)", [advanced]), target);
    expectedBalance += reward;
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [
        advanced,
      ]),
      expectedBalance,
    );
    await scalar("select farm_project_place($1,$2)", [advanced, upgrade.id]);
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [
        advanced,
      ]),
      expectedBalance,
    );
    await db.query("update dungeon_runs set status='completed' where id=$1", [
      run,
    ]);
    if (target === 2) {
      for (const [kind, blueprint, x] of [
        ["pond", "pond-cycle-v1", 3],
        ["flower", "flower-photosynthesis-v1", 4],
      ]) {
        await reject(
          "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
          [advanced, kind, head],
          /ค้นพบ/,
        );
        const beforeLesson = await scalar(
          "select balance from farm_wallets where user_id=$1",
          [advanced],
        );
        const lesson = await scalar(
          "select farm_lesson_open($1,$2,$3,$4,false)",
          [advanced, blueprint, head, { version: 1, kind, seed: 123 }],
        );
        await scalar("select farm_lesson_answer($1,$2,0,$3,true,true)", [
          advanced,
          lesson.session_id,
          { tiles: [] },
        ]);
        eq(
          await scalar("select balance from farm_wallets where user_id=$1", [
            advanced,
          ]),
          beforeLesson,
        );
        const nonce = await scalar("select gen_random_uuid()");
        let place = await scalar("select farm_project_buy($1,$2,$3,$4)", [
          advanced,
          kind,
          nonce,
          head,
        ]);
        expectedBalance -= 50;
        eq(
          (
            await scalar("select farm_project_buy($1,$2,$3,$4)", [
              advanced,
              kind,
              nonce,
              head,
            ])
          ).id,
          place.id,
        );
        eq(
          await scalar("select balance from farm_wallets where user_id=$1", [
            advanced,
          ]),
          expectedBalance,
        );
        eq(place.rules_snapshot.waits, [28800, 28800, 28800]);
        eq(place.rules_snapshot.puzzleSeconds, kind === "pond" ? 180 : 240);
        for (
          let point = 0;
          point < place.rules_snapshot.waits.length - 1;
          point++
        ) {
          await db.query(
            "update farm_projects set ready_at='2000-01-01' where id=$1",
            [place.id],
          );
          place = await scalar("select farm_project_command($1,$2,'begin')", [
            advanced,
            place.id,
          ]);
          place = await scalar(
            "select farm_project_checkpoint_result($1,$2,true)",
            [advanced, place.id],
          );
          eq(place.checkpoint, point + 1);
        }
        eq(place.status, "finishing");
        await reject(
          "select farm_project_place($1,$2,$3,0)",
          [advanced, place.id, x],
          /เสร็จ|พร้อม/,
        );
        await db.query(
          "update farm_projects set ready_at='2000-01-01' where id=$1",
          [place.id],
        );
        place = await scalar("select farm_project_place($1,$2,$3,0)", [
          advanced,
          place.id,
          x,
        ]);
        eq(place.status, "placed");
        expectedBalance += 20;
        await scalar("select farm_project_place($1,$2,$3,0)", [
          advanced,
          place.id,
          x,
        ]);
        eq(
          await scalar("select balance from farm_wallets where user_id=$1", [
            advanced,
          ]),
          expectedBalance,
        );
        const replay = await scalar(
          "select farm_lesson_open($1,$2,$3,$4,true)",
          [advanced, blueprint, head, { version: 1, kind, seed: 124 }],
        );
        await scalar("select farm_lesson_answer($1,$2,0,$3,true,true)", [
          advanced,
          replay.session_id,
          { tiles: [] },
        ]);
        eq(
          await scalar("select balance from farm_wallets where user_id=$1", [
            advanced,
          ]),
          expectedBalance,
        );
      }
    }
    if (target === 3) {
      await reject(
        "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
        [advanced, "school-4", head],
        /ก่อน/,
      );
      const bridge = await buildPlace(
        "bridge",
        "bridge-balance-v1",
        90,
        30,
        5,
        0,
      );
      eq(bridge.rules_snapshot.waits, [43200, 43200, 43200, 43200]);
      eq(bridge.rules_snapshot.puzzleSeconds, 240);
    }
    if (target === 4) {
      const observatory = await buildPlace(
        "observatory",
        "observatory-orbits-v1",
        150,
        40,
        6,
        0,
      );
      eq(observatory.rules_snapshot.waits, [64800, 64800, 64800, 64800, 64800]);
      eq(observatory.rules_snapshot.puzzleSeconds, 300);
      await reject(
        "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
        [advanced, "observatory", head],
        /เพดาน/,
      );
    }
  }

  const ledgerBeforeMove = await scalar(
    "select count(*) from farm_coin_ledger where user_id=$1",
    [advanced],
  );
  const beforeLayout = await scalar(
    "select jsonb_agg(to_jsonb(t)) from farm_layout_tiles($1) t",
    [advanced],
  );
  await reject(
    "select farm_layout_move($1,'main-school',1,0)",
    [advanced],
    /เชื่อมกัน/,
  );
  eq(
    await scalar("select jsonb_agg(to_jsonb(t)) from farm_layout_tiles($1) t", [
      advanced,
    ]),
    beforeLayout,
  );
  await scalar("select farm_layout_move($1,'egg-storage',0,-1)", [advanced]);
  await scalar("select farm_layout_move($1,'main-school',0,1)", [advanced]);
  eq(
    await scalar(
      "select count(*) from farm_projects where user_id=$1 and status='placed' and rules_snapshot->>'place'='school' and tile_x=0 and tile_y=1",
      [advanced],
    ),
    3,
  );
  eq(
    await scalar("select balance from farm_wallets where user_id=$1", [
      advanced,
    ]),
    expectedBalance,
  );
  eq(
    await scalar("select count(*) from farm_coin_ledger where user_id=$1", [
      advanced,
    ]),
    ledgerBeforeMove,
  );
  const bridgeId = await scalar(
    "select id from farm_projects where user_id=$1 and catalogue_id='bridge'",
    [advanced],
  );
  await reject(
    "select farm_layout_move($1,$2,5,0,1)",
    [advanced, bridgeId],
    /เชื่อมกัน/,
  );
  eq(
    await scalar("select orientation from farm_projects where id=$1", [
      bridgeId,
    ]),
    0,
  );
  await reject(
    "select farm_layout_move($1,$2,5,0,0)",
    [other, bridgeId],
    /ของเรา/,
  );
  await db.exec("set role authenticated");
  await reject(
    "select farm_layout_move($1,'home-meadow',0,0)",
    [advanced],
    /permission/,
  );
  await reject("select * from farm_layout_tiles($1)", [advanced], /permission/);
  await db.exec("reset role");

  if (pool) {
    const collision = await Promise.allSettled(
      ["home-meadow", "egg-storage"].map((id) =>
        pool.query("select farm_layout_move($1,$2,1,2,0)", [u, id]),
      ),
    );
    eq(collision.filter((r) => r.status === "fulfilled").length, 1);
    eq(collision.filter((r) => r.status === "rejected").length, 1);
    eq(
      await scalar(
        "select count(*) from farm_base_positions where user_id=$1",
        [u],
      ),
      1,
    );
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [u]),
      440,
    );
  }
  // Repeat builds and caps use only the isolated synthetic owner above.
  for (const [kind, maxRepeat, price] of [
    ["pond", 2, 50],
    ["flower", 2, 50],
    ["bridge", 1, 90],
  ]) {
    for (let repeat = 1; repeat <= maxRepeat; repeat++) {
      let place = await scalar(
        "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
        [advanced, kind, head],
      );
      expectedBalance -= price;
      eq(place.reward_eligible, false);
      for (
        let point = 0;
        point < place.rules_snapshot.waits.length - 1;
        point++
      ) {
        await db.query(
          "update farm_projects set ready_at='2000-01-01' where id=$1",
          [place.id],
        );
        await scalar("select farm_project_command($1,$2,'begin')", [
          advanced,
          place.id,
        ]);
        place = await scalar(
          "select farm_project_checkpoint_result($1,$2,true)",
          [advanced, place.id],
        );
      }
      await db.query(
        "update farm_projects set ready_at='2000-01-01' where id=$1",
        [place.id],
      );
      await scalar("select farm_project_place($1,$2,$3,$4)", [
        advanced,
        place.id,
        kind === "bridge" ? -3 : -repeat,
        kind === "flower" ? 1 : 0,
      ]);
      eq(
        await scalar("select balance from farm_wallets where user_id=$1", [
          advanced,
        ]),
        expectedBalance,
      );
    }
    await reject(
      "select farm_project_buy($1,$2,gen_random_uuid(),$3)",
      [advanced, kind, head],
      /เพดาน/,
    );
    eq(
      await scalar("select balance from farm_wallets where user_id=$1", [
        advanced,
      ]),
      expectedBalance,
    );
  }
  console.log(
    `Puzzle sessions: ${checks} checks passed (isolated synthetic database; no real account writes)`,
  );
} catch (error) {
  console.error(
    error.message,
    error.code,
    error.position,
    error.internalPosition,
    error.internalQuery,
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
