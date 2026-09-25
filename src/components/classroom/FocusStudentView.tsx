"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { RosterPet } from "@/lib/classroom/roster";
import { formatElapsed } from "@/lib/classroom/useFocusSession";
import { FOCUS_BLOCK_MS, FOCUS_GRACE_MS, FOCUS_SETTLE_MS } from "@/lib/classroom/focusRules";
import { FOCUS_DAILY_EXP_CAP, FOCUS_EXP_PER_BLOCK } from "@/lib/exp";
import {
  useFocusTracker,
  type FocusRunningState,
  type WakeLockStatus,
} from "@/lib/classroom/useFocusTracker";

// หน้าจอนักเรียนระหว่างคาบตั้งใจ — "จอล็อกจำลอง" (เอกสารออกแบบ ข้อ 16)
// พื้นดำสนิททั้งจอ (จอ OLED ประหยัดแบตจริง) Wake Lock กันจอดับอยู่เบื้องหลัง
// แตะจอ = หลุด 1 ครั้ง (มี grace) จึงไม่มีปุ่มอะไรให้กดเลยระหว่างคาบ

// ขยับตำแหน่งเนื้อหาเล็กน้อยทุกนาที กันจอ OLED จำภาพ (burn-in) ระหว่างคาบยาว
const DRIFT = [
  [0, 0],
  [10, -14],
  [-12, 8],
  [8, 16],
  [-8, -10],
] as const;

export default function FocusStudentView({
  focusSessionId,
  joined,
  pet,
}: {
  focusSessionId: string;
  /** มีแถวผู้เข้าร่วมแล้ว (late-joiner ต้อง join ก่อนจึงเริ่มส่งสัญญาณได้) */
  joined: boolean;
  pet: RosterPet | null;
}) {
  const t = useFocusTracker(joined ? focusSessionId : null);
  const [drift, setDrift] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDrift((d) => (d + 1) % DRIFT.length), 60_000);
    return () => clearInterval(id);
  }, []);

  const s = t.server;
  const serverNow = t.now + t.offsetMs;
  const [dx, dy] = DRIFT[drift];

  let body: React.ReactNode;
  if (!s) {
    body = <p className="text-sm text-white/40">กำลังเข้าคาบตั้งใจ…</p>;
  } else if (s.state === "focusing" && s.block_started_at) {
    const blockMs = Math.min(FOCUS_BLOCK_MS, Math.max(0, serverNow - Date.parse(s.block_started_at)));
    body = (
      <>
        <BlockRing progress={blockMs / FOCUS_BLOCK_MS}>
          <PetSprite pet={pet} className="animate-pet-bob opacity-40" />
        </BlockRing>
        <p className="mt-6 font-mono text-2xl text-gold-hi/50">{formatElapsed(Math.floor(blockMs / 1000))}</p>
        <p className="mt-1 text-xs text-white/30">
          รอบละ 10 นาที = {FOCUS_EXP_PER_BLOCK} EXP · ครบแล้ว {s.completed_blocks} รอบ
        </p>
        <ExpLine state={s} />
        <p className="mt-6 text-xs text-white/25">
          {s.grace_used ? "รอบนี้ใช้โอกาสแตะจอไปแล้ว — ห้ามแตะอีกนะ" : "วางไว้เฉยๆ ไม่ต้องแตะจอ"}
        </p>
      </>
    );
  } else if (s.state === "warning" && s.warning_started_at) {
    const left = Math.max(0, Date.parse(s.warning_started_at) + FOCUS_GRACE_MS - serverNow);
    body = (
      <>
        <PetSprite pet={pet} className="opacity-90" />
        <p className="mt-6 text-lg font-bold text-amber">วางมือถือกลับที่เดิม</p>
        <p className="mt-2 font-mono text-6xl font-bold text-amber">{Math.ceil(left / 1000)}</p>
        <p className="mt-3 max-w-xs text-sm text-white/70">
          หยุดแตะจอภายในเวลานี้ รอบ 10 นาทีนี้จะนับต่อ — ถ้าไม่ทัน รอบนี้จะเริ่มนับใหม่
        </p>
        <p className="mt-4 text-xs text-white/40">ใช้โอกาสนี้ได้ 1 ครั้งต่อรอบ</p>
      </>
    );
  } else {
    // away — ยังไม่เริ่ม หรือเพิ่งรีเซ็ต: รอวางนิ่งแล้ว tracker จะส่ง resume เอง
    const first = s.completed_blocks === 0 && s.focused_seconds === 0 && s.warned_count === 0;
    const settleLeft = Math.max(0, FOCUS_SETTLE_MS - (t.now - t.lastTouchAt));
    body = (
      <>
        <PetSprite pet={pet} className="opacity-80" />
        <p className="mt-6 text-lg font-bold text-gold-hi">
          {first ? "วางมือถือราบ หน้าจอขึ้น" : "รอบนี้เริ่มนับใหม่"}
        </p>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          {first
            ? "แล้วตั้งใจทำงานของตัวเอง ระบบจะเริ่มนับเมื่อวางนิ่ง"
            : "ไม่เป็นไร วางมือถือราบอีกครั้ง แล้วตั้งใจต่อ"}
        </p>
        <p className="mt-6 font-mono text-3xl text-white/70">
          {settleLeft > 0 ? `เริ่มใน ${Math.ceil(settleLeft / 1000)}` : "กำลังเริ่ม…"}
        </p>
        {s.completed_blocks > 0 && (
          <p className="mt-4 text-xs text-white/40">คาบนี้ตั้งใจครบแล้ว {s.completed_blocks} รอบ</p>
        )}
        <ExpLine state={s} />
      </>
    );
  }

  return (
    <main
      className="fixed inset-0 z-[60] flex touch-none select-none flex-col items-center justify-center bg-black px-6 text-center"
      onContextMenu={(e) => e.preventDefault()}
    >
      <WakeLockNotice status={t.wakeLock} />
      <div
        className="flex flex-col items-center transition-transform duration-[3000ms]"
        style={{ transform: `translate(${dx}px, ${dy}px)` }}
      >
        {body}
      </div>
      {s && !t.online && (
        <p className="absolute bottom-6 text-xs text-warn/80">การเชื่อมต่อหลุด — กำลังลองใหม่…</p>
      )}
    </main>
  );
}

// EXP ที่จะได้เมื่อคาบจบ — ชนเพดานวันนี้แล้วบอกตรงๆ (ยังตั้งใจต่อได้ นับเป็นเวลา)
function ExpLine({ state }: { state: FocusRunningState }) {
  if (state.exp_cap_left <= 0) {
    return (
      <p className="mt-2 text-xs text-white/30">
        วันนี้ได้ EXP จากคาบตั้งใจครบ {FOCUS_DAILY_EXP_CAP} แล้ว — ยังนับเวลาตั้งใจให้อยู่
      </p>
    );
  }
  if (state.exp_pending <= 0) return null;
  return <p className="mt-2 text-sm font-bold text-gold-hi/60">จบคาบได้ +{state.exp_pending} EXP</p>;
}

function PetSprite({ pet, className }: { pet: RosterPet | null; className?: string }) {
  if (!pet) return <div className={`text-6xl ${className ?? ""}`}>📖</div>;
  return (
    <div className={`relative h-32 w-32 ${className ?? ""}`}>
      <Image src={pet.imagePath} alt={pet.nickname ?? pet.speciesName} fill sizes="128px" className="object-contain" />
    </div>
  );
}

function BlockRing({ progress, children }: { progress: number; children: React.ReactNode }) {
  const r = 88;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex h-48 w-48 items-center justify-center">
      <svg viewBox="0 0 192 192" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="96" cy="96" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
        <circle
          cx="96"
          cy="96"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="text-gold/50 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {children}
    </div>
  );
}

function WakeLockNotice({ status }: { status: WakeLockStatus }) {
  if (status !== "unsupported" && status !== "denied") return null;
  return (
    <div className="absolute inset-x-4 top-4 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-left text-xs text-amber/90">
      เครื่องนี้สั่งให้จอเปิดค้างไม่ได้ — ตั้งค่าล็อกจออัตโนมัติเป็น &quot;ไม่ต้อง&quot; ชั่วคราว
      ไม่งั้นพอจอดับเองจะนับว่าหลุด
    </div>
  );
}
