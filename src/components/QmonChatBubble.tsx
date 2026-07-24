"use client";

import { useRef, useState } from "react";
import { MessageCircle, Heart, TrendingUp, Target } from "lucide-react";
import SpeechBubble from "@/components/SpeechBubble";
import { askQmonEncourage, askQmonPractice, askQmonProgress, askQmonChat } from "@/lib/qmon/askQmon";

// จุดเข้าเมนู AI ของ Qmon — เดิมลอง fixed-to-viewport มุมล่างขวาแล้วพบว่าหลุดออกจากตัวการ์ดไกล
// มากบนจอกว้าง (max-w-xl กึ่งกลางจอไม่ตรงกับความกว้างจริงของการ์ด) เปลี่ยนมาเป็น absolute badge
// ติดมุมล่างขวาของ "กรอบ avatar Qmon" แทน (ต้อง render ภายใน <div className="relative"> ที่
// PetCard.tsx ห่อไว้รอบปุ่ม avatar — ดูคอมเมนต์ตรงนั้น) รับประกันว่าลอยติดตัว Qmon เสมอไม่ว่า
// จอกว้างแค่ไหน แลกกับการไม่ปักหมุดค้างบนจอทั้งหน้าระหว่าง scroll เหมือนเวอร์ชัน fixed ก่อนหน้า
// เมนูมี 4 ตัวเลือกตาม spec — ครบทั้ง 4 (ควรฝึกอะไร/ดูพัฒนาการ/ขอแรงใจ/คุยเล่นสั้นๆ) มี backend
// จริงแล้วทั้งหมด ไม่มีปุ่มไหนเหลือ "เร็วๆ นี้" อีก
//
// sheet ไม่มี avatar ซ้ำในกล่องข้อความอีกแล้ว — ตัว Qmon จริงจากการ์ดหลัก (ที่ badge นี้ห้อยอยู่)
// โผล่พ้นขอบบนของ sheet ขึ้นมาอยู่แล้วเวลาเปิด ใช้ตัวนั้นเป็น "หน้าคนพูด" แทนได้เลย ไม่ต้องมี
// avatar เล็กซ้อนอีกตัวในกล่องข้อความ — เรียก SpeechBubble variant="stacked" แบบไม่ส่ง avatarPath
// เข้าไป (prop เป็น optional อยู่แล้ว) เหลือแค่กล่องข้อความมีหางชี้ขึ้นบน (ทิศทางเดิมของ stacked
// variant พอดี ไม่ต้องแก้ SpeechBubble.tsx เลยสักบรรทัด) ตีความเป็นหางชี้ไปทาง Qmon ตัวจริงด้านบน
//
// ทั้ง 3 state ที่เป็น "Qmon กำลังพูด" (menu greeting / loading / result) ห่อ SpeechBubble ด้วย
// ChatStage เดียวกันเสมอ — พื้นหลัง bg-track (เข้มกว่า bg-card ของตัว sheet เอง) ให้กรอบ+หางของ
// bubble (ซึ่งใช้ bg-card เหมือนกัน) ตัดกับพื้นหลังชัดเจน ไม่กลืนเป็นสีเดียวกับ sheet จนดูเหมือน
// ข้อความลอยเฉยๆ — ตั้งใจให้ทั้ง 3 state มองแล้วรู้สึกเป็น "กล่องเดียวกัน สลับแค่เนื้อหาข้างใน"
// (error ไม่ใช้ ChatStage เพราะเป็นข้อความแจ้งระบบ ไม่ใช่คำพูดของ Qmon)
//
// sheet สูงตาม content จริง (auto-height) เลยสูงพอจะบัง Qmon ทั้งตัวได้เวลาเปิด (ตัว avatar ไม่ได้
// ติดอยู่กับ viewport เหมือน sheet ตำแหน่งบนจอขึ้นกับ scroll ของหน้า /pet ทั้งหน้า) — แก้ด้วยการ
// scroll กรอบ avatar (parent ของ FAB นี้เอง) ให้ขึ้นไปชิดขอบบนจอก่อนเปิด sheet เสมอ กันเคส
// avatar อยู่กลาง/ล่างจอตอนกด แล้ว sheet ไปบังจนดูเหมือนลอยตัดขาดจาก Qmon เลย

type SheetView = "menu" | "loading" | "result" | "error";
type ActiveMenu = "encourage" | "practice" | "progress" | "chat";

// ข้อความทักทายสั้นๆ ตอนเปิดเมนู (ก่อนเลือกอะไร) — copy คงที่ ไม่เรียก askQmon.ts/Gemini
// (แต่ละเมนูค่อยเรียก AI จริงตอนกดเลือก) แค่ทำให้ flow อ่านง่ายขึ้น: เห็น Qmon -> เห็นมันพูด ->
// เลือกคุยต่อ แทนที่จะมีแต่หัวข้อ+เมนูเปล่าๆ
const MENU_GREETING = "อยากคุยเรื่องอะไรกันดี?";

export default function QmonChatBubble() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SheetView>("menu");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  // เมนูที่กำลังถาม (สำหรับปุ่ม "ลองอีกครั้ง" ตอน error — ต้องรู้ว่าจะเรียก action ตัวไหนซ้ำ)
  const [activeMenu, setActiveMenu] = useState<ActiveMenu | null>(null);
  // ตัว FAB เองเป็น sibling ของปุ่ม avatar อยู่ใน parent เดียวกัน (ดู PetCard.tsx) — ใช้ ref นี้
  // แค่หา parentElement ตอน scroll ไม่ต้องส่ง ref ข้ามคอมโพเนนต์
  const fabRef = useRef<HTMLButtonElement>(null);

  function openSheet() {
    fabRef.current?.parentElement?.scrollIntoView({ behavior: "smooth", block: "start" });
    setView("menu");
    setResultMessage(null);
    setActiveMenu(null);
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
  }

  async function handleAskMenu(menu: ActiveMenu) {
    setActiveMenu(menu);
    setView("loading");
    try {
      const result =
        menu === "encourage"
          ? await askQmonEncourage()
          : menu === "practice"
            ? await askQmonPractice()
            : menu === "progress"
              ? await askQmonProgress()
              : await askQmonChat();
      setResultMessage(result.message);
      setView("result");
    } catch {
      setView("error");
    }
  }

  return (
    <>
      {/* FAB — badge ติดมุมล่างขวาของกรอบ avatar (parent ต้องเป็น position: relative)
          ขนาดเล็กกว่าเดิม (48px) ให้ดูเป็น badge แนบตัว ไม่ใช่ FAB แยกลอยเดี่ยวๆ */}
      <button
        ref={fabRef}
        type="button"
        onClick={openSheet}
        aria-label="คุยกับ Qmon"
        className="absolute -bottom-1 -right-1 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-gold-dim bg-card text-gold-hi shadow-lg transition active:scale-95"
      >
        <MessageCircle size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={closeSheet}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-gold-dim bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

            {view === "menu" && (
              <>
                <ChatStage>
                  <SpeechBubble message={MENU_GREETING} variant="stacked" />
                </ChatStage>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MenuTile
                    icon={<Target size={22} />}
                    label="ควรฝึกอะไร"
                    onClick={() => handleAskMenu("practice")}
                    active
                  />
                  <MenuTile
                    icon={<TrendingUp size={22} />}
                    label="ดูพัฒนาการ"
                    onClick={() => handleAskMenu("progress")}
                    active
                  />
                  <MenuTile
                    icon={<Heart size={22} />}
                    label="ขอแรงใจ"
                    onClick={() => handleAskMenu("encourage")}
                    active
                  />
                  <MenuTile
                    icon={<MessageCircle size={22} />}
                    label="คุยเล่นสั้นๆ"
                    onClick={() => handleAskMenu("chat")}
                    active
                  />
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="mt-4 w-full rounded-2xl border border-gold-dim py-3 text-sm font-bold text-text2"
                >
                  ปิด
                </button>
              </>
            )}

            {view === "loading" && (
              <div className="flex flex-col items-center gap-3 text-center">
                <ChatStage>
                  <SpeechBubble message={null} variant="stacked" isTyping />
                </ChatStage>
                <p className="text-xs text-text3">อาจใช้เวลาถึง 2-3 วินาที</p>
              </div>
            )}

            {view === "result" && (
              <div className="flex flex-col items-center gap-3">
                <ChatStage>
                  <SpeechBubble message={resultMessage} variant="stacked" />
                </ChatStage>
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="w-full rounded-2xl border border-gold-dim py-3 text-sm font-bold text-text2"
                >
                  กลับไปเมนู
                </button>
                <button type="button" onClick={closeSheet} className="text-xs text-text3 underline underline-offset-2">
                  ปิด
                </button>
              </div>
            )}

            {view === "error" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-red">ไม่สำเร็จตอนนี้ ลองใหม่อีกครั้งนะ</p>
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => activeMenu && handleAskMenu(activeMenu)}
                    className="flex-1 rounded-2xl border border-gold bg-amber py-2.5 text-sm font-bold text-track"
                  >
                    ลองอีกครั้ง
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("menu")}
                    className="flex-1 rounded-2xl border border-gold-dim py-2.5 text-sm font-bold text-text2"
                  >
                    กลับไปเมนู
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// "เวที" ที่ SpeechBubble (variant="stacked") ยืนพูดอยู่ — bg-track เข้มกว่า bg-card ของ sheet/
// bubble เอง ให้กรอบ+หางของ bubble ตัดกับพื้นหลังชัดเจน ใช้ร่วมกันทั้ง 3 state (menu/loading/
// result) กันไม่ให้แต่ละ state ดูเป็นคนละรูปแบบ
function ChatStage({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full justify-center rounded-2xl bg-track px-4 py-5">{children}</div>;
}

function MenuTile({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col items-center gap-2 rounded-xl border p-4 transition active:scale-95 ${
        active
          ? "border-gold bg-amber/10 text-gold-hi"
          : "border-border bg-track text-text3 opacity-60"
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
