"use client";

import { toCentralView } from "@/lib/teamBattle/types";
import { useTeamBattleState } from "@/lib/teamBattle/useTeamBattleState";
import BattleCentral from "../BattleCentral";
import tv from "../battle-tv.module.css";

// จอ TV Team Battle (อ่านอย่างเดียว): โหลดสถานะ + realtime เท่านั้น — ไม่เรียก useTeamBattleTicker
// (ตัวเคาะหลักคือแท็บคุมเกม; ถ้าปิดแท็บนั้น มือถือนักเรียนยังเคาะสำรองให้)
export default function BattleTvClient({ battleId }: { battleId: string | null }) {
  if (!battleId) return <TvMessage text="ยังไม่มีเกม Team Battle" />;
  return <TvRoom battleId={battleId} />;
}

function TvRoom({ battleId }: { battleId: string }) {
  const { state, loading, error, clock } = useTeamBattleState(battleId, { mode: "host" });

  if (!state) return <TvMessage text={loading ? "กำลังโหลดเกม…" : (error?.message ?? "โหลดเกมไม่สำเร็จ")} />;
  // setup: ยังไม่เริ่ม — หน้ารอที่ไม่มีชื่อนักเรียน (รายชื่อ/การแบ่งทีมอยู่ที่หน้าคุมเกมเท่านั้น)
  if (state.battle.status === "setup") return <TvMessage text="กำลังเตรียมทีม…" />;

  return <BattleCentral view={toCentralView(state)} clock={clock} readOnly />;
}

function TvMessage({ text }: { text: string }) {
  return (
    <div className={tv.stage} data-testid="battle-tv-message">
      <div className={tv.box}>
        <div className={`${tv.inner} items-center justify-center`}>
          <p className={`${tv.tHuge} font-bold text-gold-hi`}>{text}</p>
        </div>
      </div>
    </div>
  );
}
