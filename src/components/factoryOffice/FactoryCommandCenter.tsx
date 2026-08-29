"use client";

import { useActionState } from "react";
import { createFactoryCommandAction,type FactoryCommandState } from "@/app/admin/factory-office-preview/actions";
import type { FactoryCommandCenterSnapshot } from "@/lib/questionFactory/commandCenterServer";

const initialState:FactoryCommandState={ok:false,message:""};

export default function FactoryCommandCenter({snapshot,commandKey}:{snapshot:FactoryCommandCenterSnapshot;commandKey:string}){
  const [state,action,pending]=useActionState(createFactoryCommandAction,initialState);
  const blocked=Boolean(snapshot.blockedBy);
  return <section className="rounded-3xl border border-gold-dim bg-card p-5" aria-labelledby="command-title">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Phase 7 · Command Center</p>
    <h2 id="command-title" className="mt-1 text-lg font-bold text-text">สั่งผลิตข้อสอบ</h2>
    {snapshot.blockedBy&&<div className="mt-4 rounded-2xl border border-amber-700/60 bg-amber-950/25 p-4 text-sm text-amber-200">
      สร้างงานใหม่ไม่ได้: Run {snapshot.blockedBy.runId} ยังอยู่ที่ {snapshot.blockedBy.status} — ต้องปิด ยกเลิก หรือทำให้เสร็จก่อน
    </div>}
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="commandKey" value={commandKey}/>
      <label className="text-sm text-text2 md:col-span-2">หลักสูตรและหมวดผลิตภัณฑ์
        <select name="mappingId" required disabled={blocked||pending} className="mt-1 w-full rounded-xl border border-border bg-track p-3 text-text">
          {snapshot.options.map(o=><option key={o.mappingId} value={o.mappingId}>{o.gradeLevel} · {o.subjectLabel} · {o.chapter} · {o.category}</option>)}
        </select>
      </label>
      <label className="text-sm text-text2 md:col-span-2">เป้าหมายการเรียนรู้
        <input name="learningObjective" required disabled={blocked||pending} placeholder="ระบุสิ่งที่ผู้เรียนต้องทำได้" className="mt-1 w-full rounded-xl border border-border bg-track p-3 text-text"/>
      </label>
      <NumberField name="count" label="จำนวนข้อ" value={10} disabled={blocked||pending}/>
      <NumberField name="costLimitMicrounits" label="Cost budget (µunit)" value={1000000} disabled={blocked||pending}/>
      <NumberField name="easy" label="ง่าย" value={3} disabled={blocked||pending}/>
      <NumberField name="medium" label="ปานกลาง" value={4} disabled={blocked||pending}/>
      <NumberField name="hard" label="ยาก" value={3} disabled={blocked||pending}/>
      <div className="flex items-end"><button disabled={blocked||pending||snapshot.options.length===0} className="w-full rounded-full border border-gold bg-amber px-5 py-3 font-bold text-track disabled:opacity-40">
        {pending?"กำลังตรวจและสร้าง…":"ยืนยันและเริ่ม Run"}
      </button></div>
      {state.message&&<p className={`md:col-span-2 text-sm ${state.ok?"text-emerald-300":"text-red-300"}`}>{state.message}{state.runId?` · Run ${state.runId}`:""}</p>}
    </form>
    <p className="mt-3 text-xs text-text3">ระบบสร้างได้ครั้งละหนึ่ง Run และหยุดที่ Human Review เสมอ ไม่มี auto-publish หรือ auto-activate</p>
  </section>;
}

function NumberField({name,label,value,disabled}:{name:string;label:string;value:number;disabled:boolean}){
  return <label className="text-sm text-text2">{label}<input type="number" name={name} min={0} max={name==="count"?20:undefined}
    required defaultValue={value} disabled={disabled} className="mt-1 w-full rounded-xl border border-border bg-track p-3 text-text"/></label>;
}
