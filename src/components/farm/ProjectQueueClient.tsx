"use client";
import { schoolArt } from "@/lib/farm/school-art";
import Image from "next/image";
import { catalogueGate, PLACE_ART } from "@/lib/farm/catalogue-gates";
import type { FarmPlace } from "@/lib/farm/catalogue";
import { useState } from "react";
import FarmPurchaseReview from "./FarmPurchaseReview";
import type {ProjectDefinition} from "@/lib/farm/catalogue";
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
    [busy, setBusy] = useState(false),
    [balance, setBalance] = useState(overview.balance);
  const [leader, setLeader] = useState<Record<string, string>>({}),
    [helpers, setHelpers] = useState<Record<string, string[]>>({}),
    [requests, setRequests] = useState(() =>
      Object.fromEntries(
        FARM_CATALOGUE.map((c) => [c.id, crypto.randomUUID()]),
      ),
    );
  const [purchase,setPurchase] = useState<{definition:ProjectDefinition;leaderId:string;requestId:string}|null>(null);
  const capacity = SCHOOL_CAPACITY[overview.level as 0 | 1 | 2 | 3 | 4];
  const occupied =
    projects.filter((p) => p.status !== "placed").length +
    overview.gardens.filter((g) => g.status !== "placed").length;
  const placed: Partial<Record<FarmPlace, number>> = {
    garden: overview.gardens.filter((g) => g.status === "placed").length,
  };
  const reserved: Partial<Record<FarmPlace, number>> = {
    garden: overview.gardens.length,
  };
  for (const p of projects) {
    const kind = p.rules_snapshot.place;
    reserved[kind] = (reserved[kind] ?? 0) + 1;
    if (p.status === "placed") placed[kind] = (placed[kind] ?? 0) + 1;
  }
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
    <div className="farm-queue space-y-4">
      {purchase && <FarmPurchaseReview title={labels[purchase.definition.place]+(purchase.definition.targetLevel ? " ระดับ "+purchase.definition.targetLevel : "")} price={purchase.definition.price} balance={balance} leader={pets.find(p=>p.id===purchase.leaderId)?.name??"คู่หู"} busy={busy} error={message} onCancel={()=>{setPurchase(null);setMessage("");}} onConfirm={()=>act(async()=>{
        const p=await command("buy",{catalogueId:purchase.definition.id,requestId:purchase.requestId,leaderId:purchase.leaderId});
        change(p);if(p.walletBalance!==undefined)setBalance(p.walletBalance);
        setRequests(old=>({...old,[purchase.definition.id]:crypto.randomUUID()}));
        setAssignments(rows=>[...rows,{project_id:p.id,pet_id:purchase.leaderId,role:"leader"}]);setPurchase(null);
      })}/> }
      <h1 className="text-xl font-bold">
        งานก่อสร้าง · โรงเรียนระดับ {overview.level}
      </h1>
      <p>
        งาน {occupied}/{capacity.jobs} ช่อง · ผู้ช่วยได้สูงสุด{" "}
        {capacity.helpers} ตัว · ผู้ช่วยลดเวลารอคนละ 10%
      </p>
      <p>เหรียญฟาร์ม {balance.toLocaleString("th-TH")} เหรียญ</p>
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
              data-farm-panel className="space-y-3"
            >
              <h2 className="font-bold">
                {labels[p.rules_snapshot.place]}
                {p.rules_snapshot.targetLevel
                  ? " ระดับ " + p.rules_snapshot.targetLevel
                  : ""}
              </h2>
              {(p.rules_snapshot.place in PLACE_ART ||
                p.rules_snapshot.place === "school") && (
                <div className="relative w-40">
                  <Image
                    className={
                      p.status === "ready" ? "" : "opacity-50 saturate-50"
                    }
                    src={
                      p.rules_snapshot.place === "school"
                        ? schoolArt(p.rules_snapshot.targetLevel ?? 1)
                        : PLACE_ART[
                            p.rules_snapshot.place as keyof typeof PLACE_ART
                          ]
                    }
                    alt={
                      p.status === "ready"
                        ? "สถานที่สร้างเสร็จ"
                        : "ภาพสถานที่ระหว่างก่อสร้าง"
                    }
                    width={160}
                    height={160}
                  />
                  {p.status !== "ready" && (
                    <span className="absolute bottom-0 rounded bg-slate-950/90 px-2 py-1 text-sm">
                      กำลังก่อสร้าง · {p.checkpoint}/
                      {p.rules_snapshot.waits.length - 1}
                    </span>
                  )}
                </div>
              )}
              <p className="farm-job-status">
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
                  <time dateTime={p.ready_at}>{new Date(p.ready_at).toLocaleString("th-TH")}</time>
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
                  className="farm-primary"
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
      {overview.level===0 && <div data-farm-panel><h3>เริ่มจากโรงเรียนหลังแรก</h3><p>วางโรงเรียนเพื่อเปิดงานก่อสร้างและสมุดแบบสร้าง</p><Link className="farm-primary" href="/collection/school">ไปสร้างโรงเรียน →</Link></div>}
      {FARM_CATALOGUE.filter(
        (c) =>
          (overview.level > 0 && c.place === "school" && c.targetLevel === overview.level + 1) ||
          (c.place !== "school" && c.place !== "garden" && c.schoolLevel <= overview.level),
      ).map((c) => {
        const enabled = overview.catalogue.some(
          (row) => row.id === c.id && row.enabled,
        );
        const gate = catalogueGate(c, {
          level: overview.level,
          blueprints: overview.blueprints,
          placed,
          reserved,
          activeJobs: occupied,
          jobLimit: capacity.jobs,
          coins: balance,
          leaderStages: pets.filter((p) => available(p)).map((p) => p.stage),
        });
        if (
          projects.some(
            (p) => p.catalogue_id === c.id && p.status !== "placed",
          ) &&
          c.place === "school"
        ) {
          gate.ready = false;
          gate.reasons.push("มีโครงการอัปเกรดนี้อยู่ในคิวแล้ว");
        }
        return (
          <section
            data-farm-panel className="space-y-2"
            key={c.id}
          >
            <h3>
              {labels[c.place]}
              {c.targetLevel ? " ระดับ " + c.targetLevel : ""} · {c.price}{" "}
              เหรียญ
            </h3>
            <p>
              {c.place === "school"
                ? "ใช้แปลงเดิม"
                : "เลือกแปลงเมื่อสร้างเสร็จ"}{" "}
              · รางวัลครั้งแรก {c.firstReward} เหรียญ (รับได้ครั้งเดียว) ·
              จุดช่วย {c.waits.length - 1} ครั้ง
            </p>
            <p>
              {enabled
                ? "เลือกหัวหน้าทีมเริ่มงาน"
                : "กำลังเตรียมเปิดโครงการตามแผน"}
            </p>
            {c.place in PLACE_ART && (
              <>
                <Image
                  src={PLACE_ART[c.place as keyof typeof PLACE_ART]}
                  alt={labels[c.place]}
                  width={160}
                  height={160}
                />
                <Link
                  className="inline-flex min-h-11 items-center"
                  href={"/collection/school/learn/subject/" + c.place}
                >
                  {overview.blueprints.includes(c.blueprint ?? "")
                    ? "ทบทวนบทเรียน"
                    : "เรียนเพื่อค้นพบแบบสร้าง"}
                </Link>
              </>
            )}
            {enabled && gate.reasons.length > 0 && (
              <ul className="list-disc pl-5">
                {gate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {gate.reasons.some((r) => r.startsWith("มี Qmon")) && (
                  <li>
                    <Link
                      className="inline-flex min-h-11 items-center underline"
                      href="/collection"
                    >
                      กลับไปเลี้ยง Qmon ตัวเดิม →
                    </Link>
                  </li>
                )}
              </ul>
            )}
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
                  disabled={busy || !leader[c.id] || !gate.ready}
                  onClick={() => {setMessage("");setPurchase({definition:c,leaderId:leader[c.id],requestId:requests[c.id]});}}
                >
                  {c.place === "school" ? "เริ่มอัปเกรด" : "เริ่มสร้าง"}{" "}
                  {c.price} เหรียญ
                </button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
