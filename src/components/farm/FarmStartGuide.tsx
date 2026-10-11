import Link from "next/link";
export default function FarmStartGuide({ ready }: { ready: boolean }) {
  return (
    <aside className="m-3 rounded-xl border border-gold-dim bg-card p-4">
      <h2 className="font-bold">เริ่มฟาร์มด้วยโรงเรียน</h2>
      <p className="my-2 text-sm">
        {ready
          ? "มี Qmon ระยะ 2 ขึ้นไปแล้ว เลือกหัวหน้าและเริ่มบทสอนสร้างโรงเรียนได้"
          : "ฟักไข่ แล้วเลี้ยง Qmon ด้วยอาหารและ EXP จนถึงระยะ 2 ก่อนเลือกหัวหน้าสร้างโรงเรียน"}
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-gold-hi"
        href={ready ? "/collection/school" : "/eggs"}
      >
        {ready ? "ไปบทสอนโรงเรียน →" : "ไปฟักไข่ →"}
      </Link>
      {!ready && (
        <Link
          className="ml-4 inline-flex min-h-11 items-center text-gold-hi"
          href="/pet"
        >
          ไปเลี้ยง Qmon →
        </Link>
      )}
    </aside>
  );
}
