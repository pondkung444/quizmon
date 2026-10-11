"use client";
import { useState } from "react";
import Link from "next/link";
import type { loadProjectOverview } from "@/lib/farm/project-overview-server";
import type { SchoolPet } from "@/lib/farm/school";
import type { FarmProject } from "@/lib/farm/projects-server";
import { FARM_CATALOGUE, SCHOOL_CAPACITY } from "@/lib/farm/catalogue";
import {
  projectCommand,
  beginProjectPuzzle,
} from "@/app/collection/projects/actions";
import ProjectPuzzleClient from "./ProjectPuzzleClient";
import { projectTeamAvailability } from "@/lib/farm/project-overview";
type Overview = Awaited<ReturnType<typeof loadProjectOverview>>;
type Session = Awaited<ReturnType<typeof beginProjectPuzzle>>;
const labels = {
  school: "โรงเรียน",
  garden: "สวนพักผ่อน",
  pond: "บ่อน้ำ",
  flower: "แปลงดอกไม้",
  bridge: "สะพาน",
  observatory: "หอดูดาว",
};
export default function ProjectQueueClient({
  overview,
  pets,
  command = projectCommand,
}: {
  overview: Overview;
  pets: SchoolPet[];
  command?: typeof projectCommand;
}) {
  const [projects, setProjects] = useState(overview.projects),
    [assignments, setAssignments] = useState(overview.assignments),
    [session, setSession] = useState<Session | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [leader, setLeader] = useState<Record<string, string>>({}),
    [helpers, setHelpers] = useState<Record<string, string[]>>({}),
    [requests] = useState(() =>
      Object.fromEntries(
        FARM_CATALOGUE.map((c) => [c.id, crypto.randomUUID()]),
      ),
    );
  const capacity = SCHOOL_CAPACITY[overview.level as 0 | 1 | 2 | 3 | 4];
  const occupied =
    projects.filter((p) => p.status !== "placed").length +
    overview.gardens.filter((g) => g.status !== "placed").length;
  function change(p: FarmProject) {
    setProjects((rows) =>
      rows.some((row) => row.id === p.id)
        ? rows.map((row) => (row.id === p.id ? p : row))
        : [...rows, p],
    );
  }
  function ownTeam(id: string) {
    return assignments.filter((a) => a.project_id === id);
  }
  function available(pet: SchoolPet, id?: string) {
    const assigned = projectTeamAvailability(projects, assignments)[pet.id];
    return (
      !(pet.busyOther ?? (pet.busy && !pet.busyProjectId)) &&
      (!assigned || assigned === id)
    );
  }
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "บันทึกงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function team(p: FarmProject, operation: "team" | "resume") {
    const head =
      leader[p.id] ?? ownTeam(p.id).find((a) => a.role === "leader")?.pet_id;
    const support =
      helpers[p.id] ??
      ownTeam(p.id)
        .filter((a) => a.role === "helper")
        .map((a) => a.pet_id);
    const result = await command(operation, {
      projectId: p.id,
      leaderId: head,
      helperIds: support,
    });
    change(result);
    setAssignments((rows) => [
      ...rows.filter((a) => a.project_id !== p.id),
      ...(head
        ? [{ project_id: p.id, pet_id: head, role: "leader" as const }]
        : []),
      ...support.map((pet_id) => ({
        project_id: p.id,
        pet_id,
        role: "helper" as const,
      })),
    ]);
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        คิวงานฟาร์ม · โรงเรียนระดับ {overview.level}
      </h1>
      <p>
        งาน {occupied}/{capacity.jobs} ช่อง · ผู้ช่วยได้สูงสุด{" "}
        {capacity.helpers} ตัว · ผู้ช่วยลดเวลารอคนละ 10%
      </p>
      {message && <p role="alert">{message}</p>}
      {session && (
        <ProjectPuzzleClient
          key={session.sessionId}
          session={session}
          pet={
            pets.find(
              (p) =>
                p.id ===
                ownTeam(session.project.id).find((a) => a.role === "leader")
                  ?.pet_id,
            ) ?? pets[0]
          }
          onChanged={change}
          onClose={() => setSession(null)}
        />
      )}
      {projects
        .filter((p) => p.status !== "placed")
        .map((p) => {
          const head =
            leader[p.id] ??
            ownTeam(p.id).find((a) => a.role === "leader")?.pet_id ??
            "";
          const support =
            helpers[p.id] ??
            ownTeam(p.id)
              .filter((a) => a.role === "helper")
              .map((a) => a.pet_id);
          return (
            <section
              key={p.id}
              className="space-y-3 rounded-xl border border-white/20 p-4"
            >
              <h2 className="font-bold">
                {labels[p.rules_snapshot.place]}
                {p.rules_snapshot.targetLevel
                  ? " ระดับ " + p.rules_snapshot.targetLevel
                  : ""}
              </h2>
              <p>
                {p.status === "ready"
                  ? "พร้อมยืนยันงาน"
                  : p.status === "paused"
                    ? "งานพักอยู่"
                    : p.status === "puzzle"
                      ? "พร้อมให้ช่วย"
                      : "ทีมกำลังทำงาน"}{" "}
                · ผ่านจุดช่วย {p.checkpoint}/{p.rules_snapshot.waits.length - 1}
              </p>
              {p.ready_at && (
                <p>
                  {p.status === "finishing" ? "เก็บงานเสร็จ" : "จุดช่วยถัดไป"}{" "}
                  {new Date(p.ready_at).toLocaleString("th-TH")}
                </p>
              )}
              {["building", "puzzle", "finishing", "paused"].includes(
                p.status,
              ) && (
                <>
                  <label className="block">
                    หัวหน้าทีม
                    <select
                      aria-label="หัวหน้าทีม"
                      className="mt-1 min-h-11 w-full rounded bg-slate-800 p-2"
                      value={head}
                      onChange={(e) =>
                        setLeader((old) => ({ ...old, [p.id]: e.target.value }))
                      }
                    >
                      <option value="">เลือก Qmon</option>
                      {pets
                        .filter(
                          (pet) =>
                            pet.stage >= p.rules_snapshot.leaderStage &&
                            pet.stage <= 4,
                        )
                        .map((pet) => (
                          <option
                            disabled={!available(pet, p.id)}
                            key={pet.id}
                            value={pet.id}
                          >
                            {pet.name}
                            {available(pet, p.id) ? "" : " · มีงานอื่น"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend>
                      ผู้ช่วย ({support.length}/{capacity.helpers})
                    </legend>
                    {pets
                      .filter(
                        (pet) =>
                          pet.id !== head && pet.stage >= 2 && pet.stage <= 4,
                      )
                      .map((pet) => (
                        <label
                          className="flex min-h-11 items-center gap-2"
                          key={pet.id}
                        >
                          <input
                            type="checkbox"
                            checked={support.includes(pet.id)}
                            disabled={
                              !available(pet, p.id) ||
                              (!support.includes(pet.id) &&
                                support.length >= capacity.helpers)
                            }
                            onChange={(e) =>
                              setHelpers((old) => ({
                                ...old,
                                [p.id]: e.target.checked
                                  ? [...support, pet.id]
                                  : support.filter((id) => id !== pet.id),
                              }))
                            }
                          />
                          {pet.name}
                        </label>
                      ))}
                  </fieldset>
                  <button
                    className="min-h-11 rounded bg-white/10 px-3"
                    disabled={busy || !head}
                    onClick={() =>
                      act(() =>
                        team(p, p.status === "paused" ? "resume" : "team"),
                      )
                    }
                  >
                    {p.status === "paused" ? "เริ่มทำงานต่อ" : "บันทึกทีม"}
                  </button>
                  {p.status !== "paused" && (
                    <button
                      className="ml-2 min-h-11"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          change(await command("pause", { projectId: p.id }));
                          setAssignments((rows) =>
                            rows.filter((a) => a.project_id !== p.id),
                          );
                        })
                      }
                    >
                      ถอนทีม · พักงาน
                    </button>
                  )}
                </>
              )}
              {p.status === "puzzle" && (
                <button
                  className="min-h-11 rounded bg-amber-700 px-3"
                  disabled={busy}
                  onClick={() =>
                    act(async () => setSession(await beginProjectPuzzle(p.id)))
                  }
                >
                  เริ่มจุดช่วย
                </button>
              )}
              {(p.status === "building" || p.status === "finishing") && (
                <button
                  className="min-h-11"
                  disabled={busy}
                  onClick={() =>
                    act(async () =>
                      change(await command("refresh", { projectId: p.id })),
                    )
                  }
                >
                  ตรวจเวลางานล่าสุด
                </button>
              )}
              {p.status === "ready" &&
                (p.rules_snapshot.place === "school" ? (
                  <button
                    className="min-h-11 rounded bg-amber-700 px-3"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        change(await command("place", { projectId: p.id }));
                        window.location.reload();
                      })
                    }
                  >
                    ยืนยันอัปเกรดบนแปลงโรงเรียนเดิม
                  </button>
                ) : (
                  <Link
                    className="inline-flex min-h-11 items-center"
                    href="/collection/layout"
                  >
                    ไปเลือกพื้นที่ในฟาร์ม
                  </Link>
                ))}
            </section>
          );
        })}
      {overview.gardens
        .filter((g) => g.status !== "placed")
        .map((g) => (
          <Link
            className="block min-h-11 rounded border border-white/20 p-3"
            key={g.id}
            href={"/collection/garden?project=" + g.id}
          >
            งานสวนเดิม · เปิดผังและสถานะที่บันทึกไว้
          </Link>
        ))}
      <h2 className="font-bold">โครงการถัดไป</h2>
      {FARM_CATALOGUE.filter(
        (c) => c.place === "school" && c.targetLevel === overview.level + 1,
      ).map((c) => {
        const enabled = overview.catalogue.some(
          (row) => row.id === c.id && row.enabled,
        );
        return (
          <section
            className="space-y-2 rounded-xl border border-white/20 p-4"
            key={c.id}
          >
            <h3>
              โรงเรียนระดับ {c.targetLevel} · {c.price} เหรียญ
            </h3>
            <p>
              ใช้แปลงเดิม · รางวัลครั้งแรก {c.firstReward} เหรียญ · จุดช่วย{" "}
              {c.waits.length - 1} ครั้ง
            </p>
            <p>
              {enabled
                ? "เลือกหัวหน้าทีมเริ่มงาน"
                : "กำลังเตรียมเปิดโครงการตามแผน"}
            </p>
            {enabled && (
              <>
                <select
                  aria-label="หัวหน้าโครงการใหม่"
                  className="min-h-11 w-full rounded bg-slate-800 p-2"
                  value={leader[c.id] ?? ""}
                  onChange={(e) =>
                    setLeader((old) => ({ ...old, [c.id]: e.target.value }))
                  }
                >
                  <option value="">เลือก Qmon</option>
                  {pets
                    .filter((p) => p.stage >= c.leaderStage && p.stage <= 4)
                    .map((p) => (
                      <option disabled={!available(p)} value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  className="min-h-11 rounded bg-amber-700 px-3"
                  disabled={busy || !leader[c.id] || occupied >= capacity.jobs}
                  onClick={() =>
                    act(async () => {
                      const p = await command("buy", {
                        catalogueId: c.id,
                        requestId: requests[c.id],
                        leaderId: leader[c.id],
                      });
                      change(p);
                      setAssignments((rows) => [
                        ...rows,
                        {
                          project_id: p.id,
                          pet_id: leader[c.id],
                          role: "leader",
                        },
                      ]);
                    })
                  }
                >
                  เริ่มอัปเกรด {c.price} เหรียญ
                </button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
