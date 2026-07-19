const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// PostgREST (db-max-rows, default 1000) ตัดผลลัพธ์ query ที่เกิน 1000 แถวแบบเงียบถ้าไม่ใส่
// .range() กำกับ — ใช้ helper นี้แทน await query ตรงๆ ทุกจุดที่ผลลัพธ์อาจเกิน 1000 แถว
// รับ factory ที่คืน query ใหม่ทุกครั้ง (ใส่ .range(from, to) เอง) เพราะ query builder ของ
// supabase-js ตั้งใจให้ยิงครั้งเดียวต่ออินสแตนซ์ ดึงทีละหน้าจนกว่าจะได้แถวน้อยกว่า page size
// แล้ว concat ผลลัพธ์ทั้งหมด — throw ทันทีถ้าหน้าไหนพัง
export async function fetchAllRows<T>(
  buildPageQuery: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildPageQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}
