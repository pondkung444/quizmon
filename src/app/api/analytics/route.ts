import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Route handler ธรรมดา ไม่ใช่ server action — ตั้งใจ (ดูเหตุผลใน src/lib/analytics.ts +
// supabase/migrations/014_analytics_events.sql): sendBeacon เรียก server action ไม่ได้ และ
// server action ถูก Next.js dispatch เรียงคิวเดียวกับ submitAnswer ฝั่ง client
//
// fire-and-forget เสมอ: ไม่ว่าจะพังจุดไหนก็ตอบ 200 กลับไปเงียบๆ ห้าม throw ให้ client เห็น error
// (analytics ต้องไม่มีทางทำให้ประสบการณ์เล่นจริงสะดุด)

type IncomingEvent = {
  event_name: string;
  screen: string | null;
  pet_id: string | null;
  props: Record<string, unknown>;
  client_ts: string;
  session_id: string;
};

function isValidEvent(e: unknown): e is IncomingEvent {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return typeof r.event_name === "string" && typeof r.session_id === "string" && typeof r.client_ts === "string";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const rawEvents = Array.isArray(body)
      ? body
      : Array.isArray((body as { events?: unknown })?.events)
        ? (body as { events: unknown[] }).events
        : [];

    const events = rawEvents.filter(isValidEvent);
    if (events.length === 0) return NextResponse.json({ ok: true });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true });

    // user_id มาจาก session เสมอ ไม่รับจาก client (เข้ากับ RLS "insert own": auth.uid() = user_id)
    const rows = events.map((e) => ({
      user_id: user.id,
      session_id: e.session_id,
      event_name: e.event_name,
      screen: e.screen ?? null,
      pet_id: e.pet_id ?? null,
      props: e.props ?? {},
      client_ts: e.client_ts,
    }));

    await supabase.from("analytics_events").insert(rows);
  } catch {
    // fire-and-forget: กลืน error ทุกชนิด (JSON พัง, DB ล่ม, ฯลฯ) ไม่ throw ต่อ
  }

  return NextResponse.json({ ok: true });
}
