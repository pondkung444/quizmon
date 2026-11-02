-- dungeon_types
alter table public.dungeon_types add column zone_id uuid references public.zones(id);
update public.dungeon_types set zone_id = (select id from public.zones where slug = 'ice');
alter table public.dungeon_types alter column zone_id set not null;

-- raid_types
alter table public.raid_types add column zone_id uuid references public.zones(id);
update public.raid_types set zone_id = (select id from public.zones where slug = 'ice');
alter table public.raid_types alter column zone_id set not null;

-- raid_obstacles
alter table public.raid_obstacles add column zone_id uuid references public.zones(id);
update public.raid_obstacles set zone_id = (select id from public.zones where slug = 'ice');
alter table public.raid_obstacles alter column zone_id set not null;

-- raid_tickets
alter table public.raid_tickets add column zone_id uuid references public.zones(id);
update public.raid_tickets set zone_id = (select id from public.zones where slug = 'ice');
alter table public.raid_tickets alter column zone_id set not null;