export type Blueprint = {id:string;name:string;description:string;image:string;schoolLevel:number;minStage:number};
export const GARDEN_BLUEPRINT:Blueprint={id:"garden-rest-v1",name:"สวนพักผ่อน Qmon",description:"สวนเล็กที่มีทางเดิน ศาลาร่มรื่น และแปลงดอกไม้ ให้คู่หูมีมุมพักในฟาร์ม",image:"/farm/qmon-rest-garden-v1.webp",schoolLevel:1,minStage:2};
export type BlueprintDiscovery={blueprint_id:string;pet_id:string|null;completed_at:string};
export function blueprintGate(schoolStatus:string|null,stage:number|null){
 return {school:schoolStatus==="placed",pet:stage!==null&&Number.isInteger(stage)&&stage>=2&&stage<=4};
}
