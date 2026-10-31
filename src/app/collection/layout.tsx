import AppThemeMarker from "@/components/AppThemeMarker";
import FarmShell from "@/components/farm/FarmShell";
export default function Layout({children}:{children:React.ReactNode}){return <><AppThemeMarker/><FarmShell>{children}</FarmShell></>}
