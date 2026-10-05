
import 'server-only';
import {createClient,getUser} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {schoolDisplayState} from './school';
import type {GardenProject,FarmWallet} from './garden';
export async function loadGardenProjects():Promise<GardenProject[]>{
 const user=await getUser();if(!user)return [];
 const {data,error}=await (await createClient()).from('farm_garden_projects').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
 if(error)throw new Error('โหลดโครงการสวนไม่สำเร็จ ลองใหม่ได้');
 return (data??[]).map(p=>schoolDisplayState(p) as GardenProject);
}
export async function loadFarmWallet():Promise<FarmWallet>{
 const user=await getUser();if(!user)throw new Error('ต้องเข้าสู่ระบบก่อน');
 const {data,error}=await createAdminClient().rpc('farm_wallet_command',{p_user_id:user.id});
 if(error)throw new Error('โหลดเหรียญฟาร์มไม่สำเร็จ');return data as FarmWallet;
}
