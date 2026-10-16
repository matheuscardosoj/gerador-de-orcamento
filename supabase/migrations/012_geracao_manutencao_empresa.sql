-- Protege a reorganização administrativa contra lotes de cópias anteriores.
BEGIN;
CREATE TABLE IF NOT EXISTS central.manutencao_empresas (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  geracao bigint NOT NULL DEFAULT 0 CHECK (geracao>=0),
  em_manutencao boolean NOT NULL DEFAULT false
);
REVOKE ALL ON central.manutencao_empresas FROM PUBLIC,anon,authenticated;
ALTER TABLE central.manutencao_empresas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
 IF to_regprocedure('public.gdo_batch_v3_base(jsonb,uuid)') IS NULL THEN
  ALTER FUNCTION public.gdo_batch_v3(jsonb,uuid) RENAME TO gdo_batch_v3_base;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.gdo_batch_v3_base(jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.gdo_batch_v3(p_operacoes jsonb,p_dispositivo uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); m central.manutencao_empresas%rowtype; enviada text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
 SELECT * INTO m FROM central.manutencao_empresas WHERE empresa_id=e;
 enviada:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-gdo-geracao';
 IF coalesce(m.em_manutencao,false) THEN
   RAISE EXCEPTION USING ERRCODE='GDM01', MESSAGE='A empresa está em manutenção. Aguarde a conclusão antes de sincronizar.';
 END IF;
 IF coalesce(m.geracao,0)>0 AND enviada IS DISTINCT FROM m.geracao::text THEN
   RAISE EXCEPTION USING ERRCODE='GDM02', MESSAGE='A base desta empresa foi reorganizada. Preserve uma cópia local e restaure os dados pela nuvem.';
 END IF;
 RETURN gdo_batch_v3_base(p_operacoes,p_dispositivo);
END $$;
REVOKE ALL ON FUNCTION public.gdo_batch_v3(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_batch_v3(jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gdo_estado_base() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
 SELECT jsonb_build_object('geracao',coalesce(m.geracao,0),'emManutencao',coalesce(m.em_manutencao,false))
 FROM (SELECT gdo_empresa() e) a LEFT JOIN central.manutencao_empresas m ON m.empresa_id=a.e;
$$;
REVOKE ALL ON FUNCTION public.gdo_estado_base() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_estado_base() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
