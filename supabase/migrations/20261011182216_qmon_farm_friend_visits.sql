-- Additive farm social data. Default consent is friends-only, per the approved specification.
create table public.farm_social_settings(user_id uuid primary key references auth.users(id) on delete cascade,visit_enabled boolean not null default true);
create table public.farm_stickers(
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references auth.users(id) on delete cascade,recipient_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,day date not null default (now() at time zone 'Asia/Bangkok')::date,
 sticker text not null check(sticker in ('star','heart','clap','flower','water','moon')),sent_at timestamptz not null default now(),read_at timestamptz,
 check(sender_id<>recipient_id),unique(sender_id,recipient_id,day),unique(sender_id,request_id)
);
create index farm_stickers_recipient_day on public.farm_stickers(recipient_id,day desc);
alter table public.farm_social_settings enable row level security;
alter table public.farm_stickers enable row level security;
revoke all on public.farm_social_settings,public.farm_stickers from public,anon,authenticated;
grant select on public.farm_social_settings,public.farm_stickers to authenticated;
grant all on public.farm_social_settings,public.farm_stickers to service_role;
create policy farm_social_owner_read on public.farm_social_settings for select to authenticated using(user_id=(select auth.uid()));
create policy farm_stickers_participant_read on public.farm_stickers for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));

create function public.farm_visit_allowed(p_viewer uuid,p_owner uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_viewer is not null and p_owner is not null and (p_viewer=p_owner or (
 exists(select 1 from public.friendships where user_id_low=least(p_viewer,p_owner) and user_id_high=greatest(p_viewer,p_owner))
 and not exists(select 1 from public.blocks where (blocker_id=p_viewer and blocked_id=p_owner) or (blocker_id=p_owner and blocked_id=p_viewer))
 and coalesce((select visit_enabled from public.farm_social_settings where user_id=p_owner),true)
 ))
$$;
create function public.farm_visit_preference(p_user uuid,p_enabled boolean default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 if p_enabled is not null then insert into public.farm_social_settings values(p_user,p_enabled) on conflict(user_id) do update set visit_enabled=excluded.visit_enabled;end if;
 return coalesce((select visit_enabled from public.farm_social_settings where user_id=p_user),true);
end $$;

-- Only a whitelisted projection crosses the friend boundary: no coins, unfinished jobs,
-- assignments, checkpoint JSON, answers, drafts or account/profile contact details.
create function public.farm_visit_snapshot(p_viewer uuid,p_owner uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tiles jsonb;places jsonb;catalogue jsonb;sent boolean;remaining integer;
begin
 if p_viewer is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,729));
 if p_viewer<>p_owner then perform 1 from public.friendships where user_id_low=least(p_viewer,p_owner) and user_id_high=greatest(p_viewer,p_owner) for share;if not found then raise exception 'ไม่สามารถเยี่ยมฟาร์มนี้ได้';end if;end if;
 if not public.farm_visit_allowed(p_viewer,p_owner) then raise exception 'ไม่สามารถเยี่ยมฟาร์มนี้ได้';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into tiles from public.farm_layout_tiles(p_owner) t;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'level',t.level,'completedAt',
 case when t.id='main-school' then coalesce((select max(p.completed_at) from public.farm_projects p where p.user_id=p_owner and p.status='placed' and p.rules_snapshot->>'place'='school'),(select s.completed_at from public.farm_school_projects s where s.user_id=p_owner))
 else coalesce((select p.completed_at from public.farm_projects p where p.user_id=p_owner and p.id::text=t.id and p.status='placed'),(select g.completed_at from public.farm_garden_projects g where g.user_id=p_owner and g.id::text=t.id and g.status='placed'))end,
 'contributors',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(pet.nickname,'Qmon ที่ร่วมสร้าง'),'role',c.role,'joinedAt',c.joined_at,'leftAt',c.left_at) order by c.joined_at)
 from public.farm_project_contributions c join public.farm_projects p on p.id=c.project_id left join public.pets pet on pet.id=c.pet_id and pet.user_id=p_owner
 where p.user_id=p_owner and p.status='placed' and (p.id::text=t.id or (t.id='main-school' and p.rules_snapshot->>'place'='school'))),'[]'::jsonb)
 ||coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(pet.nickname,'Qmon ที่ร่วมสร้าง'),'role','legacy','joinedAt',null,'leftAt',null))
 from public.farm_legacy_contributions c left join public.pets pet on pet.id=c.pet_id and pet.user_id=p_owner where c.user_id=p_owner and ((t.id='main-school' and c.source='school' and c.source_key=p_owner::text) or (t.kind='garden' and c.source='garden' and c.source_key=t.id))),'[]'::jsonb))),'[]'::jsonb)
 into places from public.farm_layout_tiles(p_owner) t where t.kind not in ('meadow','residence','eggs');
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'enabled',enabled,'definition',definition) order by id),'[]'::jsonb) into catalogue from public.farm_catalogue;
 select exists(select 1 from public.farm_stickers where sender_id=p_viewer and recipient_id=p_owner and day=(now() at time zone 'Asia/Bangkok')::date) into sent;
 select greatest(0,10-count(*))::int into remaining from public.farm_stickers where sender_id=p_viewer and day=(now() at time zone 'Asia/Bangkok')::date;
 return jsonb_build_object('username',coalesce((select username from public.profiles where id=p_owner),'เพื่อน'),'tiles',tiles,'places',places,'catalogue',catalogue,'sentToday',sent,'remainingToday',remaining);
end $$;

create function public.farm_sticker_send(p_sender uuid,p_recipient uuid,p_sticker text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_stickers;today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 if p_sender is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 if p_recipient is null or p_sender=p_recipient or p_request is null or p_sticker is null or p_sticker not in ('star','heart','clap','flower','water','moon') then raise exception 'เลือกสติกเกอร์สำเร็จรูปให้ถูกต้อง';end if;
 -- Lock both owners in a stable order. Serializes consent changes and the sender's
 -- daily total across different recipients without cross-send deadlocks.
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender,p_recipient)::text,729));
 perform pg_advisory_xact_lock(hashtextextended(greatest(p_sender,p_recipient)::text,729));
 perform 1 from public.friendships where user_id_low=least(p_sender,p_recipient) and user_id_high=greatest(p_sender,p_recipient) for share;
 if not found or not public.farm_visit_allowed(p_sender,p_recipient) then raise exception 'ไม่สามารถส่งกำลังใจให้ฟาร์มนี้ได้';end if;
 select * into s from public.farm_stickers where sender_id=p_sender and request_id=p_request;
 if found then if s.recipient_id<>p_recipient or s.sticker<>p_sticker then raise exception 'คำขอส่งสติกเกอร์ไม่ตรง';end if;return jsonb_build_object('created',false,'id',s.id,'day',s.day);end if;
 select * into s from public.farm_stickers where sender_id=p_sender and recipient_id=p_recipient and day=today;
 if found then return jsonb_build_object('created',false,'id',s.id,'day',s.day);end if;
 if (select count(*) from public.farm_stickers where sender_id=p_sender and day=today)>=10 then raise exception 'ส่งกำลังใจครบ 10 ครั้งวันนี้แล้ว';end if;
 insert into public.farm_stickers(sender_id,recipient_id,request_id,sticker,day) values(p_sender,p_recipient,p_request,p_sticker,today) returning * into s;
 return jsonb_build_object('created',true,'id',s.id,'day',s.day);
end $$;

create function public.farm_sticker_inbox(p_user uuid,p_mark_read boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 if p_mark_read then update public.farm_stickers s set read_at=now() where s.recipient_id=p_user and s.read_at is null and s.day>=(now() at time zone 'Asia/Bangkok')::date-30
 and exists(select 1 from public.friendships f where f.user_id_low=least(s.sender_id,p_user) and f.user_id_high=greatest(s.sender_id,p_user))
 and not exists(select 1 from public.blocks b where (b.blocker_id=s.sender_id and b.blocked_id=p_user) or (b.blocker_id=p_user and b.blocked_id=s.sender_id));end if;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc),'[]'::jsonb) into result from(
 select s.day,sum(s.quantity)::int as total,sum(s.unread_count)::int as unread,jsonb_object_agg(s.sticker,s.quantity) as stickers from (
 select day,sticker,count(*)::int as quantity,count(*) filter(where read_at is null)::int as unread_count,min(read_at) as read_at
 from public.farm_stickers s where recipient_id=p_user and day>=(now() at time zone 'Asia/Bangkok')::date-30
 and exists(select 1 from public.friendships f where f.user_id_low=least(s.sender_id,p_user) and f.user_id_high=greatest(s.sender_id,p_user))
 and not exists(select 1 from public.blocks b where (b.blocker_id=s.sender_id and b.blocked_id=p_user) or (b.blocker_id=p_user and b.blocked_id=s.sender_id)) group by day,sticker
 )s group by s.day
 )d;
 return result;
end $$;
revoke all on function public.farm_visit_allowed(uuid,uuid),public.farm_visit_preference(uuid,boolean),public.farm_visit_snapshot(uuid,uuid),public.farm_sticker_send(uuid,uuid,text,uuid),public.farm_sticker_inbox(uuid,boolean) from public,anon,authenticated;
grant execute on function public.farm_visit_allowed(uuid,uuid),public.farm_visit_preference(uuid,boolean),public.farm_visit_snapshot(uuid,uuid),public.farm_sticker_send(uuid,uuid,text,uuid),public.farm_sticker_inbox(uuid,boolean) to service_role;
