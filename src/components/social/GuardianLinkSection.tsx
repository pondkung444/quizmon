"use client";

import { useState } from "react";
import { Shield, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/social/BottomSheet";

export type GuardianEntry = {
  linkId: string;
  guardianId: string;
  displayName: string | null;
};

export type GuardianLinkData = {
  pendingInviteCode: string | null;
  pendingExpiresAt: string | null;
  guardians: GuardianEntry[];
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

// หัวข้อ "ผู้พิทักษ์" ในแท็บสังคม (§7.1-7.2 ของเอกสารออกแบบ) — ขอบเขตรอบนี้ (entry flow เท่านั้น
// ตามที่เคาะใน Notion 2026-09-16): ปุ่มสร้าง/สร้างใหม่รหัสเชิญ 8 หลัก + เห็นสถานะผูกทันที + ปุ่มถอด
// การเชื่อม รองรับผู้พิทักษ์มากกว่า 1 คน (ตัดสินใจร่วมกับปอนด์ 2026-09-16) — เด็กกดสร้างรหัสใหม่ได้
// เสมอแม้มีผู้พิทักษ์ claimed อยู่แล้ว ส่วนเป้า/ภารกิจ/"สิ่งที่ผู้พิทักษ์เห็น" (อีก 3 ส่วนใน §7.2) อยู่
// นอกสโคปรอบนี้ — รอคิว UX/UI ตามลำดับที่ล็อกไว้ (entry flow → UX/UI → reward)
export default function GuardianLinkSection({
  initialData,
  onToast,
}: {
  initialData: GuardianLinkData;
  onToast: (message: string) => void;
}) {
  const [pendingCode, setPendingCode] = useState(initialData.pendingInviteCode);
  const [pendingExpiresAt, setPendingExpiresAt] = useState(initialData.pendingExpiresAt);
  const [guardians, setGuardians] = useState(initialData.guardians);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmingLinkId, setConfirmingLinkId] = useState<string | null>(null);
  const supabase = createClient();

  async function handleCreateCode() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("guardian_create_invite_code");
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = data?.[0];
    if (row) {
      setPendingCode(row.invite_code);
      setPendingExpiresAt(row.expires_at);
    }
  }

  async function handleCopyCode() {
    if (!pendingCode) return;
    try {
      await navigator.clipboard.writeText(pendingCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      onToast("คัดลอกไม่สำเร็จ ลองกดค้างแล้วคัดลอกเองนะ");
    }
  }

  async function handleUnlink(linkId: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("guardian_revoke_link", { p_link_id: linkId });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setGuardians((prev) => prev.filter((g) => g.linkId !== linkId));
    setConfirmingLinkId(null);
    onToast("ถอดการเชื่อมต่อแล้ว");
  }

  const confirmingGuardian = guardians.find((g) => g.linkId === confirmingLinkId) ?? null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-gold-hi" />
        <h2 className="text-sm font-bold text-gold-hi">ผู้พิทักษ์</h2>
      </div>

      {guardians.length === 0 && !pendingCode && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-6 text-center">
          <p className="text-sm text-text3">สร้างรหัสเชิญให้พ่อแม่ผู้ปกครองกรอกเพื่อเชื่อมบัญชี</p>
          <button
            type="button"
            onClick={handleCreateCode}
            disabled={loading}
            className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างรหัสเชิญ"}
          </button>
        </div>
      )}

      {pendingCode && pendingExpiresAt && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-gold-dim bg-card p-6 text-center">
          <p className="text-xs text-text3">ให้ผู้ปกครองกรอกรหัสนี้ที่หน้าเชื่อมบัญชี</p>
          <p className="text-2xl font-bold tracking-[0.3em] text-gold-hi">{pendingCode}</p>
          <p className="text-xs text-text3">หมดอายุ {formatExpiry(pendingExpiresAt)}</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-gold-dim px-4 text-sm font-bold text-text3 transition active:scale-95"
            >
              {codeCopied ? <Check className="h-4 w-4 text-amber" /> : <Copy className="h-4 w-4" />}
              {codeCopied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
            <button
              type="button"
              onClick={handleCreateCode}
              disabled={loading}
              className="flex min-h-11 items-center justify-center rounded-xl border border-gold-dim px-4 text-sm font-bold text-text3 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? "กำลังสร้าง..." : "สร้างรหัสใหม่"}
            </button>
          </div>
        </div>
      )}

      {guardians.map((g) => (
        <div
          key={g.linkId}
          className="flex items-center justify-between gap-3 rounded-2xl border border-gold-dim bg-card p-4"
        >
          <div className="min-w-0">
            <p className="text-xs text-text3">เชื่อมต่อกับ</p>
            <p className="truncate text-sm font-bold text-text">{g.displayName ?? "ผู้พิทักษ์ของคุณ"}</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmingLinkId(g.linkId)}
            className="flex-none rounded-full border border-red/40 px-3 py-2 text-xs font-bold text-red transition active:scale-95"
          >
            ถอดการเชื่อม
          </button>
        </div>
      ))}

      {guardians.length > 0 && !pendingCode && (
        <button
          type="button"
          onClick={handleCreateCode}
          disabled={loading}
          className="self-start text-xs text-text3 underline underline-offset-2 transition hover:text-gold-hi disabled:opacity-50"
        >
          {loading ? "กำลังสร้าง..." : "+ เชิญผู้พิทักษ์อีกคน"}
        </button>
      )}

      {error && <p className="text-sm text-red">{error}</p>}

      {confirmingGuardian && (
        <BottomSheet title="ถอดการเชื่อมกับผู้พิทักษ์" onClose={() => setConfirmingLinkId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-sm text-text2">
              <p>ถ้าถอด ผู้พิทักษ์จะไม่เห็นข้อมูลของหนูอีก</p>
              <p>เป้าและแผนที่มีอยู่จะหยุด แต่ของที่ได้มาแล้วยังอยู่ครบ</p>
              <p>ผูกใหม่ได้ทุกเมื่อ</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingLinkId(null)}
                className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-text2 transition active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleUnlink(confirmingGuardian.linkId)}
                disabled={loading}
                className="flex-1 rounded-full border border-red bg-red/10 py-2.5 text-sm font-bold text-red transition active:scale-95 disabled:opacity-50"
              >
                {loading ? "กำลังถอด..." : "ยืนยันถอดการเชื่อม"}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </section>
  );
}
