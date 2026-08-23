"use client";

import { useState, useTransition } from "react";
import Toggle from "@/components/Toggle";
import { updatePushPreferences } from "@/app/settings/actions";

type Preferences = {
  push_enabled: boolean;
  daily_quest_enabled: boolean;
  daily_exp_enabled: boolean;
};

export default function NotificationSettings({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function update(patch: Partial<Preferences>) {
    const prev = prefs;
    setPrefs((p) => ({ ...p, ...patch })); // optimistic update ก่อน
    setError(false);
    startTransition(async () => {
      try {
        await updatePushPreferences(patch);
      } catch {
        setPrefs(prev); // rollback ถ้าบันทึกไม่สำเร็จ
        setError(true);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-3 text-sm font-bold text-gold-hi">การแจ้งเตือน</h2>

      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-text">เปิดรับการแจ้งเตือน</span>
        <Toggle
          checked={prefs.push_enabled}
          onChange={(next) => update({ push_enabled: next })}
          label="เปิดรับการแจ้งเตือน"
        />
      </div>

      <div className="my-2 border-t border-border" />

      <div className="flex items-center justify-between py-2">
        <span className={`text-sm ${prefs.push_enabled ? "text-text2" : "text-text3"}`}>ภารกิจประจำวัน</span>
        <Toggle
          checked={prefs.daily_quest_enabled}
          onChange={(next) => update({ daily_quest_enabled: next })}
          disabled={!prefs.push_enabled}
          label="ภารกิจประจำวัน"
        />
      </div>

      <div className="flex items-center justify-between py-2">
        <span className={`text-sm ${prefs.push_enabled ? "text-text2" : "text-text3"}`}>EXP ประจำวัน</span>
        <Toggle
          checked={prefs.daily_exp_enabled}
          onChange={(next) => update({ daily_exp_enabled: next })}
          disabled={!prefs.push_enabled}
          label="EXP ประจำวัน"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red">บันทึกไม่สำเร็จ ลองอีกครั้งนะ</p>}
    </section>
  );
}
