"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, ArrowLeft, Map, Layers, BookOpen, Users } from "lucide-react";
import "./farm-ui.css";
const tabs = [{ href: "/collection", name: "ภาพรวม", Icon: Map }, { href: "/collection/projects", name: "งานก่อสร้าง", Icon: Layers }, { href: "/collection/school/learn", name: "แบบสร้าง", Icon: BookOpen }, { href: "/collection/encouragement", name: "เพื่อน", Icon: Users }];
export default function FarmShell({ children }: {
    children: React.ReactNode;
}) {
    const path = usePathname();
    const preview = path === "/collection/preview";
    const active = (href: string) => href === "/collection" ? path === href : href === "/collection/projects" ? (path?.startsWith('/collection/projects') || path === '/collection/school' || path?.startsWith('/collection/garden')) : path?.startsWith(href);
    return <div data-farm-shell data-farm-version="2" className="farm-shell"><header className="farm-topbar"><Link href="/collection" className="farm-brand"><span><Leaf size={22}/></span><b>Qmon <em>Farm</em></b></Link>{!preview && path !== "/collection" && <Link href="/collection" className="farm-back"><ArrowLeft size={17}/>กลับฟาร์ม</Link>}</header><nav className="farm-tabs" aria-label="เมนูภายในฟาร์ม">{tabs.map(({ href, name, Icon }) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}><Icon size={18}/>{name}</Link>)}</nav><div className="farm-content">{children}</div></div>;
}
