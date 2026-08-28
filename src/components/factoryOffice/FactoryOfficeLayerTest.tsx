"use client";

import Image from "next/image";
import { useState } from "react";
import {
  factoryOfficeSpritePath,
  projectFactoryOffice,
  type FactoryOfficeInput,
  type FactoryOfficeRole,
} from "@/lib/questionFactory/officeProjection";
import type { FactoryOfficeServerSnapshot } from "@/lib/questionFactory/officeServer";

const BASELINE_PERCENT = (944 / 1024) * 100;

const STATIONS: Record<FactoryOfficeRole, { x: number; y: number; width: number; z: number; label: string }> = {
  "factory-manager": { x: 50, y: 39, width: 20, z: 10, label: "Factory Manager" },
  "question-author": { x: 12, y: 69, width: 21, z: 20, label: "Question Author" },
  "question-qc": { x: 29, y: 62, width: 21, z: 22, label: "Question QC" },
  "image-builder": { x: 56, y: 64, width: 21, z: 24, label: "Image Builder" },
  "image-qc": { x: 71, y: 63, width: 21, z: 26, label: "Image QC" },
  publisher: { x: 90, y: 70, width: 22, z: 40, label: "Publisher" },
};

const SCENARIOS: Array<{ label: string; input: FactoryOfficeInput }> = [
  { label: "กำลังเขียนข้อสอบ", input: { runStatus: "running", slotState: "authoring", latestEventType: "AUTHOR_STARTED" } },
  { label: "ส่งเข้า Question QC", input: { runStatus: "running", slotState: "question_qc", latestEventType: "AUTHOR_COMPLETE" } },
  { label: "กำลังสร้างภาพ", input: { runStatus: "running", slotState: "asset_build", latestEventType: "ASSET_BUILD_STARTED" } },
  { label: "ตรวจภาพ", input: { runStatus: "running", slotState: "asset_qc", latestEventType: null } },
  { label: "รอคนอนุมัติ", input: { runStatus: "waiting_human_review", slotState: "pending_human_review", latestEventType: "ITEM_READY_FOR_REVIEW" } },
  { label: "เผยแพร่สำเร็จ", input: { runStatus: "completed", slotState: "active", latestEventType: "RUN_COMPLETED" } },
  { label: "ทดสอบทุก layer", input: { runStatus: "running", slotState: "asset_qc", latestEventType: "ASSET_CREATED" } },
];

export default function FactoryOfficeLayerTest({ snapshot }: { snapshot: FactoryOfficeServerSnapshot }) {
  const [scenarioIndex, setScenarioIndex] = useState<number | null>(snapshot.source === "live" ? null : 6);
  const scenario = scenarioIndex === null ? null : SCENARIOS[scenarioIndex];
  const projection = scenario ? projectFactoryOffice(scenario.input) : snapshot.source === "live" ? snapshot.projection : projectFactoryOffice(SCENARIOS[6].input);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="เลือกสถานการณ์ทดสอบ">
        {snapshot.source === "live" && (
          <button
            type="button"
            onClick={() => setScenarioIndex(null)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${scenarioIndex === null ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-border bg-card text-text2 hover:border-gold-dim"}`}
          >
            ข้อมูล Factory จริง
          </button>
        )}
        {SCENARIOS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setScenarioIndex(index)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${index === scenarioIndex ? "border-gold bg-gold/15 text-gold-hi" : "border-border bg-card text-text2 hover:border-gold-dim"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {snapshot.source === "live" && scenarioIndex === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Run" value={`#${snapshot.run.id} · ${snapshot.run.status}`} />
          <Info label="Scope" value={snapshot.run.scopeKey} />
          <Info label="Focused slot" value={snapshot.focusSlot ? `#${snapshot.focusSlot.ordinal} · ${snapshot.focusSlot.state}` : "ยังไม่มี slot"} />
          <Info label="Progress" value={`${snapshot.run.activeCount}/${snapshot.run.targetActive} active · ${snapshot.totalSlots} slots`} />
        </div>
      ) : snapshot.source === "unavailable" ? (
        <div className="rounded-xl border border-amber-dim bg-amber/10 px-4 py-3 text-sm text-gold-hi">
          ยังไม่มีข้อมูล Factory จริงสำหรับแสดงผล ({snapshot.reason}) — กำลังแสดง calibration scenario
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-gold-dim bg-[#101b2c] p-2 shadow-2xl">
        <div className="relative mx-auto aspect-[1628/966] min-w-[760px] max-w-[1280px] overflow-hidden rounded-xl bg-[#eeb16c]">
          <Image
            src="/factory-office/v1/environment/office-background-v1.webp"
            alt="ฉากสำนักงาน Question Factory ที่ไม่มีตัวละคร"
            fill
            sizes="(max-width: 760px) 760px, 100vw"
            className="object-cover"
            priority
          />

          {projection.map(({ role, action, isActive }) => {
            const station = STATIONS[role];
            return (
              <div key={role}>
                <div
                  className="absolute h-px bg-cyan-300/50"
                  style={{ left: `${station.x - 5}%`, top: `${station.y}%`, width: "10%", zIndex: station.z - 1 }}
                />
                <div
                  className={`absolute aspect-square transition-opacity duration-200 ${isActive ? "opacity-100" : "opacity-65"}`}
                  style={{
                    left: `${station.x}%`,
                    top: `${station.y}%`,
                    width: `${station.width}%`,
                    zIndex: station.z,
                    transform: `translate(-50%, -${BASELINE_PERCENT}%)`,
                  }}
                >
                  <Image
                    src={factoryOfficeSpritePath(role, action)}
                    alt={`${station.label}: ${action}`}
                    fill
                    sizes="(max-width: 760px) 182px, 25vw"
                    className="object-contain"
                    priority
                  />
                </div>
                <div
                  className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-[#08111d]/80 px-2 py-0.5 text-[9px] text-cyan-100/80"
                  style={{ left: `${station.x}%`, top: `${Math.min(station.y + 1.5, 96)}%`, zIndex: 60 }}
                >
                  {station.label} · {action}
                </div>
              </div>
            );
          })}

          {/* Repaint the manager desk above the manager sprite. This uses the exact same
              background pixels, so the worker reads as standing behind the desk without
              introducing a second generated asset or a responsive alignment seam. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ clipPath: "polygon(33.5% 26%, 54% 26%, 54% 40.5%, 33.5% 40.5%)", zIndex: 15 }}
            aria-hidden="true"
          >
            <Image
              src="/factory-office/v1/environment/office-background-v1.webp"
              alt=""
              fill
              sizes="(max-width: 760px) 760px, 100vw"
              className="object-cover"
            />
          </div>

          <div className="absolute left-3 top-3 rounded-lg border border-cyan-200/20 bg-[#08111d]/75 px-3 py-2 text-[10px] text-cyan-50/80">
            <div className="font-semibold text-cyan-100">Production layer calibration · 1628:966</div>
            <div>anchor: bottom-center · baseline: 944/1024</div>
          </div>
        </div>
      </div>

      <p className="text-xs text-text3">
        เส้นสีฟ้าคือ baseline จริงของแต่ละสถานี ภาพทุก action ใช้ canvas และ anchor เดียวกัน จึงเปลี่ยนท่าได้โดยเท้าไม่เลื่อนตำแหน่ง
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text3">{label}</div>
      <div className="mt-1 truncate text-sm text-text" title={value}>{value}</div>
    </div>
  );
}
