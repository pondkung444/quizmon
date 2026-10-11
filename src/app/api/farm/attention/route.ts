import { NextResponse } from "next/server";
import { loadFarmAttention } from "@/lib/farm/attention-server";
export async function GET() {
  try {
    const value = await loadFarmAttention();
    return NextResponse.json(value, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(null, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
