-- Códigos permanentes de clientes e serviços. Execute uma vez no SQL Editor
-- do projeto já configurado; não altera documentos nem pagamentos.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gdo-codigos-cadastros-v1',0));
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo bigint;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS codigo bigint;
CREATE TABLE IF NOT EXISTS public.codigos_cadastros (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  tipo text NOT NULL CHECK(tipo IN ('cliente','servico')),
  codigo bigint NOT NULL CHECK(codigo > 0),
  cadastro_id text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(empresa_id,tipo,codigo)
);
DO $codigos_iniciais$
BEGIN
  WITH numerados AS (
    SELECT empresa_id,id,row_number() OVER(PARTITION BY empresa_id ORDER BY criado_em,nome COLLATE "C",id) AS codigo
    FROM public.clientes WHERE codigo IS NULL
  ) UPDATE public.clientes c SET codigo=n.codigo FROM numerados n WHERE c.empresa_id=n.empresa_id AND c.id=n.id;
  INSERT INTO public.codigos_cadastros(empresa_id,tipo,codigo,cadastro_id)
    SELECT empresa_id,'cliente',codigo,id FROM public.clientes WHERE codigo IS NOT NULL
    ON CONFLICT(empresa_id,tipo,codigo) DO NOTHING;
  WITH numerados AS (
    SELECT empresa_id,id,row_number() OVER(PARTITION BY empresa_id ORDER BY ordem NULLS LAST,nome COLLATE "C",id) AS codigo
    FROM public.servicos WHERE codigo IS NULL
  ) UPDATE public.servicos s SET codigo=n.codigo FROM numerados n WHERE s.empresa_id=n.empresa_id AND s.id=n.id;
  INSERT INTO public.codigos_cadastros(empresa_id,tipo,codigo,cadastro_id)
    SELECT empresa_id,'servico',codigo,id FROM public.servicos WHERE codigo IS NOT NULL
    ON CONFLICT(empresa_id,tipo,codigo) DO NOTHING;
END $codigos_iniciais$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo ON public.clientes(empresa_id,codigo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_codigo ON public.servicos(empresa_id,codigo);
CREATE OR REPLACE FUNCTION public.gdo_codigo_cadastro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE atual bigint; proximo bigint; tipo_codigo text;
BEGIN
  tipo_codigo:=CASE WHEN TG_TABLE_NAME='clientes' THEN 'cliente' ELSE 'servico' END;
  EXECUTE format('SELECT codigo FROM public.%I WHERE empresa_id=$1 AND id=$2',TG_TABLE_NAME)
    INTO atual USING NEW.empresa_id,NEW.id;
  IF atual IS NOT NULL THEN NEW.codigo:=atual; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.empresa_id::text||':'||tipo_codigo,0));
  SELECT coalesce(max(codigo),0)+1 INTO proximo FROM public.codigos_cadastros
    WHERE empresa_id=NEW.empresa_id AND tipo=tipo_codigo;
  NEW.codigo:=proximo;
  INSERT INTO public.codigos_cadastros(empresa_id,tipo,codigo,cadastro_id)
    VALUES(NEW.empresa_id,tipo_codigo,proximo,NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gdo_codigo_cadastro ON public.clientes;
CREATE TRIGGER gdo_codigo_cadastro BEFORE INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.gdo_codigo_cadastro();
DROP TRIGGER IF EXISTS gdo_codigo_cadastro ON public.servicos;
CREATE TRIGGER gdo_codigo_cadastro BEFORE INSERT ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.gdo_codigo_cadastro();
CREATE OR REPLACE FUNCTION sincronizacao.semantico(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE resultado jsonb:=p; tabela text; dados jsonb; linha jsonb; novo jsonb; k text; serializados text[]; arr jsonb;
BEGIN
  IF p->>'tabela'='servicos' AND jsonb_typeof(p->'row')='object' THEN
    resultado:=jsonb_set(resultado,'{row}',(p->'row')-'codigo');
  ELSIF p->>'tabela'='clientes' AND jsonb_typeof(p->'row')='object'
      AND jsonb_typeof(p->'row'->'dados_json')='string' THEN
    resultado:=jsonb_set(resultado,'{row,dados_json}',to_jsonb(((p->'row'->>'dados_json')::jsonb)-'codigo'));
  END IF;
  IF p->>'tabela' IN ('clientes','servicos','observacoes_padrao','pagamentos_padrao','configuracoes','imagens')
     AND NOT(p ? 'rows') AND p ? 'row' AND p->'row'='null'::jsonb THEN
    resultado:=resultado-'row';
  END IF;
  IF p ? 'rows' THEN
    FOR tabela,dados IN SELECT key,value FROM jsonb_each(p->'rows') LOOP
      arr:='[]'::jsonb;
      FOR linha IN SELECT * FROM jsonb_array_elements(dados) LOOP
        novo:=linha;
        serializados:=CASE tabela WHEN 'versoes' THEN ARRAY['documento'] WHEN 'documento_meta' THEN ARRAY['dados'] WHEN 'recibos' THEN ARRAY['dados'] WHEN 'itens_servico' THEN ARRAY['calculo_json'] WHEN 'relatorio_itens_servico' THEN ARRAY['calculo_json'] ELSE ARRAY[]::text[] END;
        FOREACH k IN ARRAY serializados LOOP IF jsonb_typeof(novo->k)='string' THEN novo:=jsonb_set(novo,ARRAY[k],(novo->>k)::jsonb); END IF; END LOOP;
        arr:=arr||jsonb_build_array(novo);
      END LOOP;
      SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) INTO arr FROM jsonb_array_elements(arr) x;
      resultado:=jsonb_set(resultado,ARRAY['rows',tabela],arr);
    END LOOP;
  ELSIF resultado ? 'row' THEN
    k:=CASE resultado->>'tabela' WHEN 'clientes' THEN 'dados_json' WHEN 'configuracoes' THEN 'valor' ELSE NULL END;
    IF k IS NOT NULL AND jsonb_typeof(resultado->'row'->k)='string' THEN resultado:=jsonb_set(resultado,ARRAY['row',k],(resultado->'row'->>k)::jsonb); END IF;
  END IF;
  RETURN resultado;
END $$;
ALTER TABLE public.codigos_cadastros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.codigos_cadastros FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.gdo_codigo_cadastro() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
