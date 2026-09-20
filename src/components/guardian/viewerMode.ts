// "guardian" = ผู้ปกครองดูของลูก (/guardian/[studentId]/*) — ค่า default เสมอ ผลลัพธ์ต้องเหมือนเดิมทุกไบต์
// "self"     = นักเรียน self-serve ดูแผนของตัวเอง (/my-plan/*) — เปลี่ยนได้เฉพาะ copy บุรุษที่ 3 -> 1 และ base path
export type ViewerMode = "guardian" | "self";

export function guardianBasePath(viewerMode: ViewerMode, studentId: string): string {
  return viewerMode === "self" ? "/my-plan" : `/guardian/${studentId}`;
}
