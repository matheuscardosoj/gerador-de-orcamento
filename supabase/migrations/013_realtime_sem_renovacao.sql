-- Renovar o prazo da sessão de edição (a cada 30 s por documento) não deve acordar todos os
-- computadores da empresa: cada aviso em tempo real dispara uma sincronização completa
-- (~6 requisições) em cada cliente, inclusive no que renovou. Os demais avisos continuam
-- iguais; a expiração é conferida pela leitura periódica de edicoes_documento.
-- Execute inteiro no SQL Editor. Pode ser repetido sem efeitos colaterais.
CREATE OR REPLACE FUNCTION sincronizacao.avisar_realtime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aviso jsonb:=jsonb_build_object('alterado',true);
BEGIN
 IF TG_TABLE_NAME='edicoes_documento' AND TG_OP='UPDATE'
    AND to_jsonb(NEW)-'expira_em' = to_jsonb(OLD)-'expira_em' THEN
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='auditoria_colaboracao' THEN
  IF NEW.acao='numeracao' THEN aviso:=aviso||jsonb_build_object('entidade',NEW.entidade); END IF;
 END IF;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  PERFORM realtime.send(aviso,'alteracao','empresa:'||NEW.empresa_id::text,true);
 END IF;
 RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
