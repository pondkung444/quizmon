alter table public.raid_gear_items
  add constraint raid_gear_slot_unique unique (equipped_pet_id, slot);
alter table public.raid_gear_items
  add constraint raid_gear_main_stat_unique unique (equipped_pet_id, main_stat);