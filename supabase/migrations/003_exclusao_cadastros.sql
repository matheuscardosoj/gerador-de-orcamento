-- Compatibilidade das exclusões de cadastros: row:null e row ausente.
-- Substitui somente a normalização do contrato; não altera dados ou permissões.
BEGIN;
CREATE OR REPLACE FUNCTION sincronizacao.semantico(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE resultado jsonb:=p; tabela text; dados jsonb; linha jsonb; novo jsonb; k text; serializados text[]; arr jsonb;
BEGIN
  IF p->>'tabela'='servicos' AND jsonb_typeof(p->'row')='object' THEN
    resultado:=jsonb_set(resultado,'{row}',(p->'row')-'codigo');
  ELSIF p->>'tabela'='clientes' AND jsonb_typeof(p->'row')='object'
      AND jsonb_typeof(p->'row'->'dados_json')='string' THEN
    resultado:=jsonb_set(resultado,'{row,dados_json}',to_jsonb(((p->'row'->>'dados_json')::jsonb)-'codigo'));
  END IF;
  -- Os clientes antigos representam exclusão com row:null; a resposta canônica
  -- omite row. Somente essa chave é normalizada, sem ocultar campos desconhecidos.
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
COMMIT;
