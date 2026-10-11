import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSchoolPets } from "./school-server";
import { schoolArt } from "./school-art";
import { PLACE_ART } from "./catalogue-gates";
import type { FarmPlace } from "./catalogue";
const missing = (error: { code?: string } | null) =>
  !!error && ["42P01", "PGRST205"].includes(error.code ?? "");
export type PlaceHistory = {
  id: string;
  kind: FarmPlace;
  level: number;
  image: string;
  completedAt: string | null;
  contributors: {
    name: string;
    role: string;
    joinedAt: string | null;
    leftAt: string | null;
  }[];
  legacyNote: boolean;
};
export async function loadPlaceHistory(
  id: string,
): Promise<PlaceHistory | null> {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (id !== "main-school" && !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createAdminClient();
  let kind: FarmPlace = "school",
    level = 1,
    completedAt: string | null = null,
    legacySource: "school" | "garden" | null = null,
    legacyKey = "",
    projectIds: string[] = [];
  if (id === "main-school") {
    const school = await db
      .from("farm_school_projects")
      .select("status,completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (school.error) throw Error("โหลดผลงานโรงเรียนไม่สำเร็จ");
    if (school.data?.status !== "placed") return null;
    completedAt = school.data.completed_at;
    legacySource = "school";
    legacyKey = user.id;
    const upgrades = await db
      .from("farm_projects")
      .select("id,rules_snapshot,completed_at")
      .eq("user_id", user.id)
      .eq("status", "placed")
      .eq("rules_snapshot->>place", "school");
    if (upgrades.error && !missing(upgrades.error))
      throw Error("โหลดประวัติอัปเกรดไม่สำเร็จ");
    for (const p of upgrades.data ?? []) {
      projectIds.push(p.id);
      const target = Number(p.rules_snapshot.targetLevel ?? 1);
      if (target > level) {
        level = target;
        completedAt = p.completed_at;
      }
    }
  } else {
    const project = await db
      .from("farm_projects")
      .select("id,rules_snapshot,completed_at")
      .eq("user_id", user.id)
      .eq("id", id)
      .eq("status", "placed")
      .maybeSingle();
    if (project.error && !missing(project.error))
      throw Error("โหลดผลงานไม่สำเร็จ");
    if (project.data) {
      kind = project.data.rules_snapshot.place as FarmPlace;
      if (kind === "school") return null;
      completedAt = project.data.completed_at;
      projectIds = [id];
    } else {
      const garden = await db
        .from("farm_garden_projects")
        .select("id,completed_at")
        .eq("user_id", user.id)
        .eq("id", id)
        .eq("status", "placed")
        .maybeSingle();
      if (garden.error) throw Error("โหลดผลงานสวนไม่สำเร็จ");
      if (!garden.data) return null;
      kind = "garden";
      completedAt = garden.data.completed_at;
      legacySource = "garden";
      legacyKey = id;
    }
  }
  const periods: {
    pet_id: string | null;
    role: string;
    joined_at: string | null;
    left_at: string | null;
  }[] = [];
  if (projectIds.length) {
    const rows = await db
      .from("farm_project_contributions")
      .select("pet_id,role,joined_at,left_at")
      .in("project_id", projectIds)
      .order("joined_at");
    if (rows.error) throw Error("โหลดผู้ร่วมงานไม่สำเร็จ");
    periods.push(...(rows.data ?? []));
  }
  if (legacySource) {
    const rows = await db
      .from("farm_legacy_contributions")
      .select("pet_id,recorded_at")
      .eq("user_id", user.id)
      .eq("source", legacySource)
      .eq("source_key", legacyKey);
    if (rows.error && !missing(rows.error))
      throw Error("โหลดประวัติงานเดิมไม่สำเร็จ");
    for (const p of rows.data ?? [])
      periods.push({
        pet_id: p.pet_id,
        role: "legacy",
        joined_at: null,
        left_at: null,
      });
  }
  const pets = await loadSchoolPets(),
    names = new Map(pets.map((p) => [p.id, p.name]));
  const seen = new Set<string>();
  const contributors = periods
    .filter((p) => {
      const key = [p.pet_id, p.role, p.joined_at, p.left_at].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({
      name: p.pet_id
        ? (names.get(p.pet_id) ?? "Qmon ที่เคยร่วมงาน")
        : "Qmon ที่เคยร่วมงาน",
      role: p.role,
      joinedAt: p.joined_at,
      leftAt: p.left_at,
    }));
  return {
    id,
    kind,
    level,
    completedAt,
    image:
      kind === "school"
        ? schoolArt(level)
        : kind === "garden"
          ? "/farm/qmon-garden-pavilion-v1.webp"
          : PLACE_ART[kind as keyof typeof PLACE_ART],
    contributors,
    legacyNote: legacySource !== null,
  };
}
