import Image from "next/image";
import Link from "next/link";
import type { PlaceHistory } from "@/lib/farm/history-server";
const labels = {
  school: "โรงเรียน",
  garden: "สวนพักผ่อน",
  pond: "บ่อน้ำ",
  flower: "แปลงดอกไม้",
  bridge: "สะพาน",
  observatory: "หอดูดาว",
};
export default function PlaceHistoryView({ place }: { place: PlaceHistory }) {
  const replay =
    place.kind === "school"
      ? "/collection/practice/construction-floor"
      : place.kind === "garden"
        ? "/collection/school/learn/garden/practice"
        : `/collection/school/learn/subject/${place.kind}?replay=1`;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-24">
      <Link className="inline-flex min-h-11 items-center" href="/collection">
        ← ฟาร์มของเรา
      </Link>
      <h1 className="text-xl font-bold">
        {labels[place.kind]}
        {place.kind === "school" ? ` ระดับ ${place.level}` : ""}
      </h1>
      <Image
        src={place.image}
        width={280}
        height={280}
        alt={labels[place.kind]}
        priority
      />
      <p>
        วันที่บันทึกว่าเก็บงานเสร็จ{" "}
        {place.completedAt
          ? new Date(place.completedAt).toLocaleString("th-TH", {
              timeZone: "Asia/Bangkok",
            })
          : "ยังไม่มีวันที่บันทึกจากงานเดิม"}
      </p>
      <h2 className="font-bold">ผู้ร่วมสร้าง</h2>
      {place.contributors.length ? (
        <ul className="space-y-3">
          {place.contributors.map((p, i) => (
            <li key={i}>
              {p.name} ·{" "}
              {p.role === "leader"
                ? "หัวหน้าทีม"
                : p.role === "helper"
                  ? "ผู้ช่วย"
                  : "ร่วมสร้าง"}
              {p.joinedAt && (
                <span className="block text-sm">
                  ร่วมงาน{" "}
                  {new Date(p.joinedAt).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                  {p.leftAt
                    ? " ถึง " +
                      new Date(p.leftAt).toLocaleString("th-TH", {
                        timeZone: "Asia/Bangkok",
                      })
                    : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>ยังไม่มีรายชื่อที่บันทึกไว้</p>
      )}
      {place.legacyNote && (
        <p className="text-sm">
          งานเดิมแสดงเฉพาะผู้ร่วมงานที่มีข้อมูล
          ไม่เติมรายชื่อหรือวันที่ย้อนหลังที่ไม่ทราบ
        </p>
      )}
      <Link
        className="inline-flex min-h-11 items-center rounded bg-amber-700 px-3"
        href={replay}
      >
        เล่นทบทวน · ไม่จับเวลา ไม่รับเหรียญหรือ EXP
      </Link>
      {place.kind === "school" && (
        <Link
          className="block min-h-11"
          href="/collection/practice/construction-path"
        >
          ทบทวนต่อทางเดิน →
        </Link>
      )}
      <Link
        className="block min-h-11"
        href={
          place.kind === "school"
            ? "/collection/school"
            : place.kind === "garden"
              ? "/collection/garden?project=" + place.id
              : "/collection/projects"
        }
      >
        ดูโครงการและสร้างต่อ →
      </Link>
      <Link className="block min-h-11" href="/collection/layout">
        ย้ายพื้นที่ฟรี →
      </Link>
    </main>
  );
}
