"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import FeedbackModal from "@/components/FeedbackModal";

export default function FeedbackRow({ petId }: { petId: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between py-3 text-left text-sm text-text active:opacity-70"
      >
        ส่งความคิดเห็น
        <ChevronRight className="h-4 w-4 text-text3" />
      </button>
      {open && <FeedbackModal petId={petId} onClose={() => setOpen(false)} />}
    </>
  );
}
