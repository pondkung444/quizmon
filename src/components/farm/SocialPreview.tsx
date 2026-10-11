"use client";
import { useRef, useState } from "react";
import VisitFarmClient from "./VisitFarmClient";
import { previewTiles } from "./LayoutPreview";
import { FARM_CATALOGUE } from "@/lib/farm/catalogue";
import type { FriendFarm } from "@/lib/farm/social-server";
import type { sendSticker } from "@/app/collection/encouragement/actions";
export default function SocialPreview() {
  const [events, setEvents] = useState<string[]>([]),
    [farm] = useState<FriendFarm>(() => {
      const tiles = previewTiles(17);
      return {
        username: "เพื่อนจำลอง",
        tiles,
        places: tiles
          .filter((t) => !["meadow", "residence", "eggs"].includes(t.kind))
          .map((t) => ({
            id: t.id,
            kind: t.kind as FriendFarm["places"][number]["kind"],
            level: t.level,
            completedAt: "2026-10-12T12:00:00Z",
            contributors: [
              {
                name: "คู่หูผู้สร้าง",
                role: "leader",
                joinedAt: null,
                leftAt: null,
              },
            ],
          })),
        catalogue: FARM_CATALOGUE.map((c) => ({
          id: c.id,
          enabled: true,
          definition: c,
        })),
        sentToday: false,
        remainingToday: 10,
      };
    });
  const delivered = useRef<string | null>(null);
  const send: typeof sendSticker = async (owner, sticker, nonce) => {
    setEvents((rows) => [...rows, nonce]);
    if (!delivered.current) {
      delivered.current = nonce;
      throw Error(
        "จำลองรับสติกเกอร์แล้วแต่การตอบกลับขาด ลองสติกเกอร์เดิมอีกครั้ง",
      );
    }
    if (nonce !== delivered.current)
      throw Error("คำขอจำลองเปลี่ยน ไม่ควรส่งซ้ำ");
    return {
      created: false,
      id: nonce,
      day: "2026-10-12",
      sentToday: true,
      remainingToday: 9,
    };
  };
  return (
    <>
      <VisitFarmClient
        owner="00000000-0000-4000-8000-000000000111"
        farm={farm}
        send={send}
      />
      <p data-sticker-nonces>{events.join(" | ")}</p>
    </>
  );
}
