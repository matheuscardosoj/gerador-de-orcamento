-- Reparação de projetos que executaram 004 após a migração para empresas.
-- Faça backup antes de executar. Idempotente; não modifica códigos existentes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gdo-codigos-cadastros-fk-v2', 0));

DO $reparar$
DECLARE
  referencia oid;
  orfaos bigint;
BEGIN
  IF to_regclass('public.codigos_cadastros') IS NULL OR to_regclass('public.empresas') IS NULL THEN
    RAISE EXCEPTION 'As tabelas codigos_cadastros e empresas devem existir antes desta migração';
  END IF;

  SELECT count(*) INTO orfaos
    FROM public.codigos_cadastros c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    WHERE e.id IS NULL;
  IF orfaos > 0 THEN
    RAISE EXCEPTION 'Há % códigos de empresas inexistentes; preserve e investigue os dados antes de migrar', orfaos;
  END IF;

  SELECT confrelid INTO referencia FROM pg_constraint
    WHERE conrelid = 'public.codigos_cadastros'::regclass
      AND conname = 'codigos_cadastros_empresa_id_fkey' AND contype = 'f';
  IF referencia IS NOT NULL AND referencia NOT IN ('auth.users'::regclass, 'public.empresas'::regclass) THEN
    RAISE EXCEPTION 'A chave de codigos_cadastros aponta para uma tabela inesperada';
  END IF;

  IF referencia IS DISTINCT FROM 'public.empresas'::regclass THEN
    IF referencia IS NOT NULL THEN
      ALTER TABLE public.codigos_cadastros DROP CONSTRAINT codigos_cadastros_empresa_id_fkey;
    END IF;
    ALTER TABLE public.codigos_cadastros
      ADD CONSTRAINT codigos_cadastros_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $reparar$;
COMMIT;
