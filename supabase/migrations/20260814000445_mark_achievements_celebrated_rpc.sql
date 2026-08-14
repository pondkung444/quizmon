create or replace function public.mark_achievements_celebrated(p_user_id uuid, p_achievement_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not authorized to mark achievements celebrated for another user';
  end if;

  update public.user_achievements
  set celebrated_at = now()
  where user_id = p_user_id
    and achievement_id = any(p_achievement_ids)
    and celebrated_at is null;
end;
$$;

grant execute on function public.mark_achievements_celebrated(uuid, text[]) to authenticated;
