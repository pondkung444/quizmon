"use client";

import { useActionState } from "react";
import { controlFactoryRunAction,type FactoryCommandState } from "@/app/admin/factory-office-preview/actions";

export default function FactoryRunControls({run}:{run:{runKey:string;status:string;stateVersion:number}}){
  const [state,action,pending]=useActionState(controlFactoryRunAction,{ok:false,message:""} satisfies FactoryCommandState);
  if(!["created","running","paused","waiting_human_review"].includes(run.status)) return null;
  return <section className="rounded-3xl border border-border bg-card p-5">
    <h2 className="text-lg font-bold text-text">ควบคุม Run</h2>
    <form action={action} onSubmit={(event)=>{
      const value=(event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
        ?((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value:"";
      if(value==="cancel"&&!window.confirm("ยืนยันยกเลิก Run และยกเลิก Slot ที่ยังไม่จบทั้งหมด?")) event.preventDefault();
    }} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="runKey" value={run.runKey}/><input type="hidden" name="stateVersion" value={run.stateVersion}/>
      {run.status!=="paused"&&<button name="controlAction" value="pause" disabled={pending} className="rounded-full border border-amber-600 px-4 py-2 text-sm text-amber-200">Pause</button>}
      {run.status==="paused"&&<button name="controlAction" value="resume" disabled={pending} className="rounded-full border border-emerald-700 px-4 py-2 text-sm text-emerald-200">Resume</button>}
      <button name="controlAction" value="cancel" disabled={pending} className="rounded-full border border-red/60 px-4 py-2 text-sm text-red-200">Cancel Run</button>
    </form>
    {state.message&&<p className={`mt-2 text-sm ${state.ok?"text-emerald-300":"text-red-300"}`}>{state.message}</p>}
  </section>;
}
