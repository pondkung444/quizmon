export type FloorPlacement = { id: string; x: number; y: number; rotation: number };
export const FLOOR_SIZE = 4;
export const FLOOR_PIECES = [
  { id: "sun", name: "แผ่นสีทอง", color: "#efba53", cells: [[0,0],[1,0],[0,1],[1,1]] },
  { id: "leaf", name: "แผ่นสีเขียว", color: "#78b990", cells: [[0,0],[1,0],[0,1],[1,1]] },
  { id: "water", name: "แผ่นสีฟ้า", color: "#69aecb", cells: [[0,0],[1,0],[2,0],[3,0]] },
  { id: "stone", name: "แผ่นสีม่วง", color: "#b998d3", cells: [[0,0],[1,0],[2,0],[3,0]] },
] as const;

export function floorCells(id: string, rotation: number): number[][] {
  let cells: number[][] = FLOOR_PIECES.find(piece => piece.id === id)?.cells.map(cell => [...cell]) ?? [];
  for (let i = 0; i < rotation; i++) cells = cells.map(([x,y]) => [-y,x]);
  const minX = Math.min(...cells.map(cell => cell[0]));
  const minY = Math.min(...cells.map(cell => cell[1]));
  return cells.map(([x,y]) => [x-minX,y-minY]);
}

export function validateFloor(placements: unknown): { valid: boolean; message: string } {
  if (!Array.isArray(placements) || placements.length !== FLOOR_PIECES.length) return { valid:false, message:"ยังมีแผ่นพื้นเหลืออยู่ ลองวางให้ครบทั้ง 4 ชิ้น" };
  const ids = new Set<string>(), occupied = new Set<string>();
  for (const p of placements) {
    if (!p || typeof p.id !== "string" || !FLOOR_PIECES.some(piece => piece.id === p.id) || ids.has(p.id) ||
      !Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation > 3) return { valid:false, message:"เลือกแผ่นพื้นแต่ละชิ้นให้ครบ และวางใหม่อีกครั้ง" };
    ids.add(p.id);
    for (const [dx,dy] of floorCells(p.id,p.rotation)) {
      const x = p.x+dx, y = p.y+dy, key = `${x},${y}`;
      if (x<0 || y<0 || x>=FLOOR_SIZE || y>=FLOOR_SIZE) return {valid:false,message:"มีแผ่นพื้นเลยขอบห้อง ลองหมุนหรือย้ายเข้ามา"};
      if (occupied.has(key)) return {valid:false,message:"มีแผ่นพื้นซ้อนกัน ลองย้ายให้แต่ละช่องมีแผ่นเดียว"};
      occupied.add(key);
    }
  }
  return {valid:occupied.size===16,message:occupied.size===16?"ปูพื้นครบแล้ว!":"ยังมีช่องว่าง ลองขยับแผ่นพื้นให้เต็มห้อง"};
}
