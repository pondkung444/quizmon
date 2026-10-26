import AppThemeMarker from "@/components/AppThemeMarker";
import FarmShell from "@/components/farm/FarmShell";
import {Anuphan} from "next/font/google";
const farmFont=Anuphan({subsets:["thai","latin"],weight:["400","500","600","700"],display:"swap",variable:"--font-farm"});
export default function Layout({children}:{children:React.ReactNode}){return <><AppThemeMarker/><div className={farmFont.variable}><FarmShell>{children}</FarmShell></div></>}
