import Image from "next/image";

export default function Forest2048Entry() {
  return (
    <a href="/2048/" className="group relative isolate flex min-w-0 items-center gap-3 overflow-hidden rounded-3xl border border-cyan-200/30 bg-slate-950 p-4 text-white shadow-lg transition hover:border-cyan-200/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400" aria-label="เล่น 2048 ผู้พิทักษ์ผลึก · 3 ด่าน 30 ห้อง พร้อมจัดอันดับ">
      <Image src="/2048/assets/forest-ui.png" alt="" fill sizes="(max-width: 640px) 100vw, 576px" className="-z-20 object-cover opacity-35" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/20" />
      <div className="min-w-0 flex-1">
        <span className="inline-block rounded-full border border-cyan-200/30 bg-cyan-200/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100">เปิดให้ทดลอง · มีอันดับ</span>
        <h2 className="mt-2 text-xl font-extrabold">2048 <span className="text-sm text-cyan-100">ผู้พิทักษ์ผลึก</span></h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-200">รวมรูน พาคู่หูผ่าน 3 ด่าน · 30 ห้อง</p>
        <span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-200 px-3 py-2 text-sm font-bold text-slate-950">เลือกคู่หูแล้วเล่น <span aria-hidden>→</span></span>
      </div>
      <Image src="/2048/assets/acts-v1/sky-dragon-v1.webp" width={108} height={108} alt="" className="h-24 w-24 shrink-0 object-contain drop-shadow-lg sm:h-28 sm:w-28" />
    </a>
  );
}
