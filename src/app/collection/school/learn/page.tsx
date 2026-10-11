import Link from "next/link";
import Image from "next/image";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadSchoolProject, loadSchoolPets } from "@/lib/farm/school-server";
import { loadBlueprintDiscoveries } from "@/lib/farm/blueprints-server";
import { GARDEN_BLUEPRINT } from "@/lib/farm/blueprints";
import {
  loadConfirmedSchoolLevel,
  farmProjectSchemaAvailable,
} from "@/lib/farm/school-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLACE_ART } from "@/lib/farm/catalogue-gates";
import styles from "@/components/farm/learning.module.css";
export default async function BlueprintLibraryPage() {
  if (!(await getUser())) redirect("/login");
  const [school, pets, discoveries] = await Promise.all([
    loadSchoolProject(),
    loadSchoolPets(),
    loadBlueprintDiscoveries(),
  ]);
  const level = await loadConfirmedSchoolLevel();
  const schema = await farmProjectSchemaAvailable();
  const catalogue = schema
    ? await createAdminClient().from("farm_catalogue").select("id,enabled")
    : null;
  if (catalogue?.error) throw new Error("โหลดรายการแบบสร้างไม่สำเร็จ");
  const enabled = new Set(
    (catalogue?.data ?? []).filter((c) => c.enabled).map((c) => c.id),
  );
  const placed = school?.status === "placed",
    found = discoveries.find((d) => d.blueprint_id === GARDEN_BLUEPRINT.id);
  return (
    <main data-app-wide className={styles.library}>
      <Link href="/collection/school" className={styles.back}>
        ← กลับโรงเรียน
      </Link>
      <header className={styles.libraryHeader}>
        <span>📖 สมุดแบบสร้าง</span>
        <h1>เรียนวันนี้ ฟาร์มโตวันหน้า</h1>
        <p>เรียนกับคู่หูเพื่อค้นพบแบบสถานที่ใหม่ เก็บไว้ในสมุดของเรา</p>
      </header>
      <div className={styles.bookCount}>
        ค้นพบแล้ว{" "}
        {
          discoveries.filter(
            (d) =>
              d.blueprint_id === GARDEN_BLUEPRINT.id ||
              enabled.has(d.blueprint_id.split("-")[0]),
          ).length
        }{" "}
        /{" "}
        {1 +
          enabled.size -
          (enabled.has("garden") ? 1 : 0) -
          ["school-2", "school-3", "school-4"].filter((id) => enabled.has(id))
            .length}{" "}
        แบบที่เปิดให้เรียน
      </div>
      {!placed && (
        <aside className={styles.notice}>
          <strong>วางโรงเรียนก่อน แล้วเริ่มเรียนได้เลย</strong>
          <p>ดูแบบและเงื่อนไขล่วงหน้าได้ตอนนี้</p>
          <Link
            href={
              school?.status === "ready"
                ? "/collection?place=school"
                : "/collection/school"
            }
          >
            ไปทำโรงเรียนให้พร้อม →
          </Link>
        </aside>
      )}
      <article className={styles.blueprintCard}>
        <div className={styles.art}>
          <Image
            src={GARDEN_BLUEPRINT.image}
            width={480}
            height={440}
            alt="แบบสวนพักผ่อน มีศาลาหลังคาเขียว ร่มไม้ ทางหิน และแปลงดอกไม้"
            priority
          />
          <span>{found ? "✓ ค้นพบแล้ว" : "แบบแรกของเรา"}</span>
        </div>
        <div className={styles.cardContent}>
          <h2>{GARDEN_BLUEPRINT.name}</h2>
          <p>{GARDEN_BLUEPRINT.description}</p>
          <ul className={styles.requirements}>
            <li>{placed ? "✓" : "○"} วางโรงเรียนระดับ 1 ในฟาร์ม</li>
            <li>{pets.length ? "✓" : "○"} มี Qmon ที่ฟักเป็นตัว ระยะ 2–4</li>
            <li>{found ? "✓" : "○"} ต่อทางเดินให้ Qmon เดินไปนั่งม้านั่งได้</li>
          </ul>
          {found && (
            <p className={styles.saved}>บันทึกในสมุดแล้ว · เรียนทบทวนได้เสมอ</p>
          )}
          <Link
            className={styles.primary}
            href="/collection/school/learn/garden"
          >
            {found
              ? "ดูแบบและเรียนทบทวน →"
              : placed && pets.length
                ? "เลือก Qmon มาเรียน →"
                : "ดูบทเรียนและสิ่งที่ต้องทำก่อน →"}
          </Link>
          <Link
            className={styles.back}
            href="/collection/school/learn/garden/practice"
          >
            ลองต่อทาง · รอบฝึก ไม่รับแบบ →
          </Link>
          <Link className={styles.primary} href="/collection/garden">
            ซื้อโครงการและดูงานสร้างสวน →
          </Link>
          <Link className={styles.back} href="/collection/garden-plan">
            ดูตัวอย่างการวางสวน →
          </Link>
        </div>
      </article>
      <h2 className={styles.upcomingTitle}>สถานที่และบทเรียนค้นพบ</h2>
      {(
        [
          { kind: "pond", name: "บ่อน้ำ · วัฏจักรน้ำ", level: 2 },
          { kind: "flower", name: "สวนดอกไม้ · พืชสร้างอาหาร", level: 2 },
          { kind: "bridge", name: "สะพาน · สมดุล", level: 3 },
          { kind: "observatory", name: "หอดูดาว · วงโคจร", level: 4 },
        ] as const
      ).map((lesson) => (
        <div key={lesson.kind} className={styles.upcoming}>
          {(lesson.kind === "pond" || lesson.kind === "flower") && (
            <Image
              src={PLACE_ART[lesson.kind]}
              alt={lesson.name}
              width={200}
              height={200}
            />
          )}
          <strong>{lesson.name}</strong>
          <p>
            {level >= lesson.level ? "✓" : "○"} โรงเรียนปัจจุบันระดับ {level} ·{" "}
            {enabled.has(lesson.kind)
              ? "เปิดให้ค้นพบ"
              : "กำลังเตรียมเปิดตามแผน"}
          </p>
          <p>
            โรงเรียนระดับ {lesson.level} · Qmon ระยะ 2–4 · เรียนแบบมีคำแนะนำ
            ไม่จับเวลา
          </p>
          <Link href={`/collection/school/learn/subject/${lesson.kind}`}>
            ดูบทเรียนและเงื่อนไข →
          </Link>
        </div>
      ))}
      <Link className={styles.primary} href="/collection/projects">
        ดูแบบสร้าง เงื่อนไข และคิวโครงการ →
      </Link>
    </main>
  );
}
