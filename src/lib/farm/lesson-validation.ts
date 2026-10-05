import {GARDEN_LESSON} from "./blueprints.ts";
const solutions=["connected","shade","near-water"] as const;
export function checkGardenAnswer(step:unknown,answer:unknown):{correct:boolean;hint:string}{
 if(!Number.isInteger(step)||typeof step!=="number"||step<0||step>=GARDEN_LESSON.length||typeof answer!=="string"||!GARDEN_LESSON[step].options.some(o=>o.id===answer))return {correct:false,hint:"เลือกคำตอบของบทเรียนนี้ก่อน"};
 const hints=["ลองไล่ทางจากทางเข้าทีละช่องจนถึงศาลา ช่องน้ำหรือช่องที่ขาดทำให้ไปต่อไม่ได้","มุมพักควรมีร่มเงา และเหลือทางเดินให้คู่หูตัวอื่นผ่านได้","แปลงดอกไม้ควรดูแลได้สะดวก และไม่แทนที่ทางเดินหรือที่นั่งพัก"];
 return {correct:answer===solutions[step],hint:answer===solutions[step]?"ใช่เลย! เก็บหลักนี้ไว้ในแบบสวนของเรา":hints[step]};
}
export function validateGardenAnswers(answers:unknown):{valid:boolean;wrongStep:number;hint:string}{
 if(!Array.isArray(answers)||answers.length!==GARDEN_LESSON.length)return {valid:false,wrongStep:0,hint:"เรียนให้ครบทั้ง 3 ช่วงก่อนค้นพบแบบ"};
 for(let i=0;i<answers.length;i++){const result=checkGardenAnswer(i,answers[i]);if(!result.correct)return {valid:false,wrongStep:i,hint:result.hint};}
 return {valid:true,wrongStep:-1,hint:"เรียนครบแล้ว"};
}
