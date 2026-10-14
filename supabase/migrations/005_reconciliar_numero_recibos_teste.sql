-- Reconcile only the deleted test receipt explicitly identified in the release test.
-- Run once in the Supabase SQL Editor after reviewing the returned audit row.
-- The transaction aborts if a real, issued, paid, reserved, or ambiguous number blocks reuse.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gdo-reconcile-test-receipt-20261014', 0));

DO $reconciliar$
DECLARE
  empresa record;
  r record;
  ids_teste text[];
  liberados jsonb;
  proximo integer;
  encontrou boolean := false;
BEGIN
  FOR empresa IN
    SELECT DISTINCT d.empresa_id
    FROM public.documentos d
    JOIN public.versoes_documentos v
      ON v.empresa_id=d.empresa_id AND v.tipo='recibo' AND v.documento_id=d.documento_id
    WHERE d.tipo='recibo' AND d.excluido
      AND (v.documento->'clienteSnapshot'->>'nome'='TESTE-RELEASE-20261014'
        OR v.documento->>'descricao' ILIKE '%TESTE-RELEASE-20261014%')
  LOOP
    encontrou := true;
    PERFORM pg_advisory_xact_lock(hashtextextended(empresa.empresa_id::text||':recibo', 0));
    ids_teste := ARRAY[]::text[];
    liberados := '[]'::jsonb;

    FOR r IN
      SELECT n.numero, n.documento_id
      FROM public.numeros_documentos n
      JOIN public.documentos d
        ON d.empresa_id=n.empresa_id AND d.tipo='recibo'
        AND d.documento_id=n.documento_id AND d.excluido
      WHERE n.empresa_id=empresa.empresa_id AND n.tipo='recibo'
        AND EXISTS (
          SELECT 1 FROM public.versoes_documentos v
          WHERE v.empresa_id=n.empresa_id AND v.tipo='recibo'
            AND v.documento_id=n.documento_id
            AND (v.documento->'clienteSnapshot'->>'nome'='TESTE-RELEASE-20261014'
              OR v.documento->>'descricao' ILIKE '%TESTE-RELEASE-20261014%')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.recebimentos p
          WHERE p.empresa_id=n.empresa_id AND p.recibo_id=n.documento_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.numeros_emitidos m
          WHERE m.empresa_id=n.empresa_id AND m.tipo='recibo'
            AND m.documento_id=n.documento_id
        )
      ORDER BY n.numero
    LOOP
      ids_teste := array_append(ids_teste, r.documento_id);
      liberados := liberados || jsonb_build_array(
        jsonb_build_object('numero',r.numero,'documentoId',r.documento_id)
      );
    END LOOP;

    IF cardinality(ids_teste)=0 THEN
      RAISE EXCEPTION 'O recibo de teste excluído não está mapeado como não pago. Nenhuma numeração foi alterada.';
    END IF;

    SELECT coalesce(max(numero),0)+1 INTO proximo
    FROM public.recibos WHERE empresa_id=empresa.empresa_id;

    IF EXISTS (
      SELECT 1 FROM public.numeros_documentos n
      WHERE n.empresa_id=empresa.empresa_id AND n.tipo='recibo'
        AND n.numero>=proximo AND NOT (n.documento_id=ANY(ids_teste))
    ) THEN
      RAISE EXCEPTION 'Há número atribuído a outro recibo após o último ativo. A sequência foi preservada sem alterações.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reservas_numeros
      WHERE empresa_id=empresa.empresa_id AND tipo='recibo' AND numero>=proximo
    ) THEN
      RAISE EXCEPTION 'Há números de recibo reservados. A sequência foi preservada sem alterações.';
    END IF;

    DELETE FROM public.numeros_documentos
    WHERE empresa_id=empresa.empresa_id AND tipo='recibo'
      AND documento_id=ANY(ids_teste);
    INSERT INTO sincronizacao.sequencias_documentos(empresa_id,tipo,proximo)
      VALUES(empresa.empresa_id,'recibo',proximo)
      ON CONFLICT(empresa_id,tipo)
      DO UPDATE SET proximo=excluded.proximo;
    INSERT INTO public.auditoria_colaboracao(empresa_id,acao,entidade,dados)
      VALUES(empresa.empresa_id,'reconciliar_numero_teste','numeracao:recibo',
        jsonb_build_object('recibosTesteLiberados',liberados,
          'proximoNumero',proximo,'identificacao','TESTE-RELEASE-20261014'));
  END LOOP;

  IF NOT encontrou THEN
    RAISE EXCEPTION 'Não foi localizado um recibo excluído com o identificador exato de teste. Nenhuma numeração foi alterada.';
  END IF;
END $reconciliar$;

COMMIT;

SELECT criado_em, acao, entidade, dados
FROM public.auditoria_colaboracao
WHERE acao='reconciliar_numero_teste'
  AND dados->>'identificacao'='TESTE-RELEASE-20261014'
ORDER BY criado_em DESC
LIMIT 5;
