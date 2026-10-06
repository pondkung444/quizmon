-- questions_hide_answer_columns
-- ปิดช่องเฉลยรั่ว: authenticated อ่าน correct_index / explanation ตรงไม่ได้อีก
-- โค้ดที่อ่านเฉลยใช้ service_role หรือ SECURITY DEFINER (owner postgres) อยู่แล้ว

revoke select on public.questions from authenticated;

grant select (
  id, subject, category, difficulty, question_text, choices,
  created_at, status, grade_band, branch, grade_level, chapter,
  image_url, image_prompt, image_filename, image_type
) on public.questions to authenticated;
-- ไม่ GRANT: correct_index, explanation
-- RLS policy "authenticated users read active questions" คงเดิม
