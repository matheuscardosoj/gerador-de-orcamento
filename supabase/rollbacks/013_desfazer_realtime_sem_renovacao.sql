-- Desfaz a migração 013: restaura sincronizacao.avisar_realtime() como estava em produção
-- antes dela (capturada com pg_get_functiondef no projeto gerador-orcamento em 2026-10-23).
-- Efeito: a renovação do prazo da sessão de edição volta a avisar todos os computadores.
CREATE OR REPLACE FUNCTION sincronizacao.avisar_realtime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE aviso jsonb:=jsonb_build_object('alterado',true);
BEGIN
 IF TG_TABLE_NAME='auditoria_colaboracao' THEN
  IF NEW.acao='numeracao' THEN aviso:=aviso||jsonb_build_object('entidade',NEW.entidade); END IF;
 END IF;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  PERFORM realtime.send(aviso,'alteracao','empresa:'||NEW.empresa_id::text,true);
 END IF;
 RETURN NEW;
END $function$;
NOTIFY pgrst,'reload schema';
