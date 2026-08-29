import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";
import { processFactoryWorkSlice } from "@/lib/questionFactory/factoryWorkerServer";

export const maxDuration=60;

export async function POST(request:Request){
  const authError=verifyCronRequest(request,"ADVENTURE_CRON_SECRET");
  if(authError) return authError;
  try{return NextResponse.json({ok:true,result:await processFactoryWorkSlice()});}
  catch(error){console.error("[cron/question-factory] failed",error);return NextResponse.json({ok:false,error:error instanceof Error?error.message:"unknown error"},{status:500});}
}
