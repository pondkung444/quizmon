export type Blueprint = {id:string;name:string;description:string;image:string;schoolLevel:number;minStage:number};
export const GARDEN_BLUEPRINT:Blueprint={id:"garden-rest-v1",name:"สวนพักผ่อน Qmon",description:"สวนเล็กที่มีทางเดิน ศาลาร่มรื่น และแปลงดอกไม้ ให้คู่หูมีมุมพักในฟาร์ม",image:"/farm/qmon-rest-garden-v1.webp",schoolLevel:1,minStage:2};
export type BlueprintDiscovery={blueprint_id:string;pet_id:string|null;completed_at:string};
export type LessonOption={id:string;label:string;detail:string;plan?:string[]};
export type LessonQuestion={id:string;title:string;intro:string;options:LessonOption[]};
export const GARDEN_LESSON:LessonQuestion[]=[
 {id:"path",title:"ให้ Qmon เดินถึงศาลา",intro:"ทางเดินต้องต่อกันจากทางเข้าสวนไปถึงศาลา และไม่เดินผ่านน้ำ ลองเลือกผังที่เดินถึงได้",options:[
  {id:"connected",label:"ทางเดินต่อถึงศาลา",detail:"ตามทางหินจากทางเข้าไปถึงศาลา",plan:["..H","..p","Spp"]},
  {id:"gap",label:"เว้นช่องก่อนถึงศาลา",detail:"ทางเดินจบก่อนถึงศาลาหนึ่งช่อง",plan:["..H","...","Spp"]},
  {id:"water",label:"ผ่านบ่อน้ำก่อนถึงศาลา",detail:"มีน้ำคั่นอยู่กลางทาง",plan:["..H","..w","Spp"]}]},
 {id:"rest",title:"เลือกมุมพักให้คู่หู",intro:"สวนนี้อยากให้ Qmon พักใต้ร่มไม้ และให้ทางเดินหลักโล่งอยู่ เราควรวางม้านั่งตรงไหน?",options:[
  {id:"shade",label:"ใต้ร่มไม้ข้างทาง",detail:"มีร่มเงา และไม่กีดขวางทางเดิน"},
  {id:"entrance",label:"ขวางทางเข้าสวน",detail:"คู่หูตัวอื่นต้องเดินอ้อมม้านั่ง"},
  {id:"pond",label:"กลางบ่อน้ำ",detail:"ไม่มีพื้นที่แห้งให้เดินไปนั่ง"}]},
 {id:"plants",title:"จัดแปลงดอกไม้ให้ดูแลง่าย",intro:"เราจะรดน้ำดอกไม้จากแหล่งน้ำเล็ก ๆ ในสวน เลือกจุดที่ดูแลง่ายและไม่ขวางทางเข้าศาลา",options:[
  {id:"block",label:"ปิดทางเข้าศาลา",detail:"ดอกไม้สวย แต่เดินเข้าศาลาไม่ได้"},
  {id:"bench",label:"บนที่นั่งพัก",detail:"ดอกไม้แทนที่มุมพักของ Qmon"},
  {id:"near-water",label:"ข้างแหล่งน้ำ นอกทางเดิน",detail:"รดน้ำสะดวก และทางเดินยังโล่ง"}]}
];
export function blueprintGate(schoolStatus:string|null,stage:number|null){
 return {school:schoolStatus==="placed",pet:stage!==null&&Number.isInteger(stage)&&stage>=2&&stage<=4};
}
