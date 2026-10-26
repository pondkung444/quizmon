"use client";
import { useEffect, useRef } from "react";
import { Coins, ShieldCheck, X } from "lucide-react";
export default function FarmPurchaseReview({ title, price, balance, leader, busy, error, onConfirm, onCancel }: {
    title: string;
    price: number;
    balance: number;
    leader: string;
    busy: boolean;
    error?: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
    useEffect(() => { const d = dialog.current; d?.showModal(); cancel.current?.focus(); return () => { d?.close(); }; }, []);
    return <dialog ref={dialog} className="farm-purchase" aria-labelledby="farm-purchase-title" onCancel={e => { e.preventDefault(); if (!busy)
        onCancel(); }}><header><span className="farm-dialog-icon"><ShieldCheck size={24}/></span><button ref={cancel} type="button" disabled={busy} onClick={onCancel} aria-label="กลับไปเลือกทีม"><X size={21}/></button></header><h2 id="farm-purchase-title">ยืนยันเริ่มงาน</h2><p>{title}</p><dl><div><dt>หัวหน้าทีม</dt><dd>{leader}</dd></div><div><dt>ใช้เหรียญ</dt><dd><Coins size={17}/>{price} เหรียญ</dd></div><div><dt>เหลือหลังเริ่มงาน</dt><dd>{balance - price} เหรียญ</dd></div></dl><p className="farm-muted">เริ่มแล้วทีมจะติดงานก่อสร้าง พักงานเพื่อถอนทีมได้โดยเก็บความคืบหน้าไว้</p><div className="farm-purchase-actions">{error && <p role="alert" className="farm-alert">{error}</p>}<button className="farm-primary" type="button" disabled={busy} onClick={() => void onConfirm()}>{busy ? "กำลังบันทึก…" : 'ยืนยันเริ่มงาน · ' + price + ' เหรียญ'}</button><button className="farm-secondary" type="button" disabled={busy} onClick={onCancel}>กลับไปดูรายละเอียด</button></div></dialog>;
}
