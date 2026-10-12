-- Execute uma vez no SQL Editor do projeto da empresa. Não requer Storage.
create sequence if not exists public.gdo_changes;
create table if not exists public.gdo_entities (
  usuario uuid not null references auth.users(id), entidade text not null,
  revisao bigint not null, payload jsonb not null,
  sequencia bigint not null default nextval('public.gdo_changes'),
  primary key(usuario,entidade)
);
create table if not exists public.gdo_operations (
  usuario uuid not null references auth.users(id), id uuid not null,
  entidade text not null, revisao bigint not null, primary key(usuario,id)
);
create table if not exists public.gdo_numbers (
  usuario uuid not null references auth.users(id), tipo text not null,
  numero integer not null check(numero between 1 and 999999), dispositivo uuid not null,
  documento text, primary key(usuario,tipo,numero)
);
create table if not exists public.gdo_devices (
  usuario uuid not null references auth.users(id), id uuid not null, nome text not null,
  primary key(usuario,id)
);
alter table public.gdo_entities enable row level security;
alter table public.gdo_operations enable row level security;
alter table public.gdo_numbers enable row level security;
alter table public.gdo_devices enable row level security;
drop policy if exists "Ler a propria base" on public.gdo_entities;
create policy "Ler a propria base" on public.gdo_entities for select to authenticated using(usuario=auth.uid());
drop policy if exists "Ler os proprios dispositivos" on public.gdo_devices;
create policy "Ler os proprios dispositivos" on public.gdo_devices for select to authenticated using(usuario=auth.uid());
revoke all on public.gdo_entities, public.gdo_operations, public.gdo_numbers, public.gdo_devices from anon, authenticated;
grant select on public.gdo_entities, public.gdo_devices to authenticated;

create or replace function public.gdo_apply(p_id uuid,p_entidade text,p_base bigint,p_payload jsonb,p_dispositivo uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); atual public.gdo_entities; r bigint; n integer; t text; doc text; dono uuid;
begin
  if u is null or p_dispositivo is null then raise exception 'Login e dispositivo necessarios'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select revisao into r from gdo_operations where usuario=u and id=p_id;
  if found then return jsonb_build_object('ok',true,'revisao',r); end if;
  select * into atual from gdo_entities where usuario=u and entidade=p_entidade;
  if coalesce(atual.revisao,0)<>p_base then return jsonb_build_object('ok',false,'remoto',to_jsonb(atual)); end if;
  t:=split_part(p_entidade,':',1); doc:=substr(p_entidade,length(t)+2);
  if t not in ('orcamento','relatorio','recibo','clientes','servicos','observacoes_padrao','pagamentos_padrao','configuracoes','imagens') then raise exception 'Entidade invalida'; end if;
  if t in ('orcamento','relatorio','recibo') then
    dono:=(atual.payload->>'responsavel')::uuid;
    if dono is not null and dono<>p_dispositivo then raise exception 'Documento pertence a outro computador'; end if;
    if (p_payload->>'responsavel')::uuid is distinct from p_dispositivo then raise exception 'Responsabilidade invalida'; end if;
    if not coalesce((p_payload->>'excluido')::boolean,false) then
      n:=(p_payload->'rows'->(case t when 'orcamento' then 'orcamentos' when 'relatorio' then 'relatorios' else 'recibos' end)->0->>'numero')::integer;
      if n>0 then
        update gdo_numbers set documento=doc where usuario=u and tipo=t and numero=n and dispositivo=p_dispositivo and (documento is null or documento=doc);
        if not found then raise exception 'Numero nao reservado por este computador'; end if;
      end if;
    end if;
  end if;
  r:=p_base+1;
  insert into gdo_entities values(u,p_entidade,r,p_payload,nextval('gdo_changes')) on conflict(usuario,entidade) do update set revisao=excluded.revisao,payload=excluded.payload,sequencia=excluded.sequencia;
  insert into gdo_operations values(u,p_id,p_entidade,r);
  return jsonb_build_object('ok',true,'revisao',r);
end $$;

create or replace function public.gdo_reserve(p_tipo text,p_dispositivo uuid,p_minimo integer default 0)
returns setof integer language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n integer; inicio integer;
begin
  if u is null or p_tipo not in ('orcamento','relatorio','recibo') then raise exception 'Reserva invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select greatest(coalesce(max(numero),0),p_minimo)+1 into inicio from gdo_numbers where usuario=u and tipo=p_tipo;
  if inicio+19>999999 then raise exception 'Limite de numeracao atingido'; end if;
  for n in inicio..inicio+19 loop
    insert into gdo_numbers values(u,p_tipo,n,p_dispositivo,null); return next n;
  end loop;
end $$;
-- Primeira publicação: incorpora números antigos antes de reservar novas faixas.
create or replace function public.gdo_bootstrap_numbers(p_dispositivo uuid,p_numeros jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); x jsonb;
begin
  if u is null then raise exception 'Login necessario'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if exists(select 1 from gdo_entities where usuario=u) then raise exception 'A nuvem ja possui dados; conecte baixando a base'; end if;
  for x in select * from jsonb_array_elements(p_numeros) loop
    insert into gdo_numbers values(u,x->>'tipo',(x->>'numero')::integer,p_dispositivo,null) on conflict do nothing;
  end loop;
end $$;
create or replace function public.gdo_device(p_dispositivo uuid,p_nome text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Login necessario'; end if;
  insert into gdo_devices values(auth.uid(),p_dispositivo,left(p_nome,100)) on conflict(usuario,id) do update set nome=excluded.nome;
end $$;
create or replace function public.gdo_transfer(p_entidade text,p_origem uuid,p_destino uuid,p_revisao bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); e gdo_entities; meta jsonb; t text;
begin
  if u is null or p_origem is null or p_destino is null then raise exception 'Login e dispositivos necessarios'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into e from gdo_entities where usuario=u and entidade=p_entidade;
  if not found or e.revisao is distinct from p_revisao or (e.payload->>'responsavel')::uuid is distinct from p_origem then raise exception 'Sincronize antes de transferir'; end if;
  if not exists(select 1 from gdo_devices where usuario=u and id=p_destino) then raise exception 'Computador de destino desconhecido'; end if;
  meta:=(e.payload->'rows'->'documento_meta'->0->>'dados')::jsonb;
  meta:=jsonb_set(meta,'{computadorResponsavel}',to_jsonb(p_destino::text));
  e.payload:=jsonb_set(e.payload,'{responsavel}',to_jsonb(p_destino::text));
  e.payload:=jsonb_set(e.payload,'{rows,documento_meta,0,dados}',to_jsonb(meta::text));
  t:=split_part(p_entidade,':',1);
  update gdo_numbers set dispositivo=p_destino where usuario=u and tipo=t and documento=substr(p_entidade,length(t)+2);
  update gdo_entities set payload=e.payload,revisao=revisao+1,sequencia=nextval('gdo_changes') where usuario=u and entidade=p_entidade;
end $$;
create or replace function public.gdo_usage() returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
begin if auth.uid() is null then raise exception 'Login necessario'; end if; return pg_database_size(current_database()); end $$;
revoke all on function public.gdo_apply(uuid,text,bigint,jsonb,uuid),public.gdo_reserve(text,uuid,integer),public.gdo_bootstrap_numbers(uuid,jsonb),public.gdo_device(uuid,text),public.gdo_transfer(text,uuid,uuid,bigint),public.gdo_usage() from public;
grant execute on function public.gdo_apply(uuid,text,bigint,jsonb,uuid),public.gdo_reserve(text,uuid,integer),public.gdo_bootstrap_numbers(uuid,jsonb),public.gdo_device(uuid,text),public.gdo_transfer(text,uuid,uuid,bigint),public.gdo_usage() to authenticated;
create or replace function public.gdo_batch(p_operacoes jsonb,p_dispositivo uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb; r jsonb; resultados jsonb:='[]'::jsonb;
begin
  begin
    for x in select * from jsonb_array_elements(p_operacoes) loop
      r:=gdo_apply((x->>'id')::uuid,x->>'entidade',(x->>'base')::bigint,x->'payload',p_dispositivo);
      if not (r->>'ok')::boolean then r:=r || jsonb_build_object('entidade',x->>'entidade'); raise no_data_found; end if;
      resultados:=resultados || jsonb_build_array(jsonb_build_object('entidade',x->>'entidade','revisao',r->'revisao'));
    end loop;
  exception when no_data_found then return r;
  end;
  return jsonb_build_object('ok',true,'resultados',resultados);
end $$;
revoke all on function public.gdo_batch(jsonb,uuid) from public;
grant execute on function public.gdo_batch(jsonb,uuid) to authenticated;
