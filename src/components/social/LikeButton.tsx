"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleLike } from "@/app/social/actions";

// reusable — เฟส 5 ใช้ใน S04 (public profile), เฟส 6 เอาไปใช้ใน S05 ได้เลยเพราะเอกสารไม่ได้ห้าม
// เพื่อนเห็นยอดถูกใจ (§7.3: "♡ ถูกใจ · 24" / "♥ ถูกใจแล้ว · 25")
export default function LikeButton({
  targetUserId,
  initialLiked,
  initialCount,
}: {
  targetUserId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick() {
    // optimistic ทันทีที่กด ไม่รอ response ก่อนเปลี่ยน UI (§7.3) — revert กลับถ้า RPC พัง
    const nextLiked = !liked;
    const prevLiked = liked;
    const prevCount = count;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await toggleLike(targetUserId);
        setLiked(res.liked);
        setCount(res.count);
      } catch (err) {
        setLiked(prevLiked);
        setCount(prevCount);
        setErrorMessage(err instanceof Error ? err.message : "ถูกใจไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition active:scale-95 ${
          liked ? "border-red bg-red/10 text-red" : "border-gold-dim text-text3"
        }`}
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-red" : ""}`} />
        {liked ? "ถูกใจแล้ว" : "ถูกใจ"} · {count}
      </button>
      {errorMessage && <p className="text-xs text-red">{errorMessage}</p>}
    </div>
  );
}
