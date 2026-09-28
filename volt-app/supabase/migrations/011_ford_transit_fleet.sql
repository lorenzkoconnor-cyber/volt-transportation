-- Volt's fleet is Ford Transit Passenger Vans (not Mercedes Sprinters).
-- Update the column defaults and rename the placeholder vehicles from 003_seed_data.

alter table public.vehicles alter column make  set default 'Ford';
alter table public.vehicles alter column model set default 'Transit Passenger Van';

update public.vehicles
set make  = 'Ford',
    model = 'Transit Passenger Van',
    name  = replace(name, 'Sprinter', 'Transit')
where make = 'Mercedes' and model ilike 'Sprinter%';
