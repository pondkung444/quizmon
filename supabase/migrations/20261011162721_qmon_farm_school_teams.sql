-- Return the persisted draft revision after a timed submission, so the next edit
-- in the same board can be saved without an artificial revision conflict.
create or replace function public.farm_puzzle_submit(p_user uuid,p_id uuid,p_session uuid,p_deadline timestamptz,p_request uuid,p_draft jsonb,p_passed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;c public.farm_project_checkpoints;result jsonb;passed boolean;
begin
 if p_user is null or p_request is null or p_passed is null then raise exception 'ข้อมูลคำตอบไม่ถูกต้อง';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into s from public.farm_projects where id=p_id and user_id=p_user for update;
 if not found then raise exception 'ไม่พบโครงการของเรา';end if;
 select response into result from public.farm_puzzle_submissions where project_id=p_id and request_id=p_request;
 if found then return result;end if;
 select * into c from public.farm_project_checkpoints where project_id=p_id and checkpoint=s.checkpoint for update;
 if s.status<>'puzzle' or c.session_id is distinct from p_session or c.completed_at is not null or
    s.round_deadline is null or s.round_deadline is distinct from p_deadline then raise exception 'รอบเล่นเปลี่ยนแล้ว';end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>8192 then raise exception 'คำตอบไม่ถูกต้อง';end if;
 update public.farm_project_checkpoints set draft=p_draft,draft_revision=draft_revision+1 where project_id=p_id and checkpoint=s.checkpoint;
 passed:=p_passed and s.round_deadline>now();
 result:=jsonb_build_object('passed',passed,'revision',c.draft_revision+1,'project',public.farm_project_checkpoint_result(p_user,p_id,passed));
 insert into public.farm_puzzle_submissions values(p_id,p_request,p_session,result);
 return result;
end $$;
