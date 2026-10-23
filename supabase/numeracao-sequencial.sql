-- Protocolo 3. Executar dentro da transação do esquema completo.
CREATE TABLE IF NOT EXISTS public.autoria_documentos (
 empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,documento_id text NOT NULL,
 usuario_criador uuid,alterado_por uuid,PRIMARY KEY(empresa_id,tipo,documento_id)
);
INSERT INTO autoria_documentos SELECT empresa_id,tipo,documento_id,usuario_criador,alterado_por
 FROM identificadores_documento ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.numeros_documentos (
 empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,numero integer NOT NULL CHECK(numero BETWEEN 1 AND 999999),
 documento_id text NOT NULL,PRIMARY KEY(empresa_id,tipo,numero),UNIQUE(empresa_id,tipo,documento_id)
);
CREATE TABLE IF NOT EXISTS public.migracoes_numeracao (
 empresa_id uuid PRIMARY KEY REFERENCES empresas(id),concluida_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mapa_numeracao (
 empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,documento_id text NOT NULL,
 anterior bigint NOT NULL,novo integer NOT NULL,PRIMARY KEY(empresa_id,tipo,documento_id)
);

-- Somente pacotes ainda sem número definitivo têm seus snapshots provisórios
-- normalizados. Versões já publicadas com número positivo nunca são reescritas.
CREATE OR REPLACE FUNCTION sincronizacao.numero_payload(p jsonb,n bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE t text:=p->>'tipo'; principal text; v jsonb; arr jsonb:='[]'; d jsonb;
BEGIN
 principal:=CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END;
 p:=jsonb_set(p,ARRAY['rows',principal,'0','numero'],to_jsonb(n));
 IF t='recibo' THEN
  d:=(p->'rows'->principal->0->>'dados')::jsonb;
  p:=jsonb_set(p,ARRAY['rows',principal,'0','dados'],to_jsonb(jsonb_set(d,'{numero}',to_jsonb(n))::text));
 END IF;
 FOR v IN SELECT * FROM jsonb_array_elements(coalesce(p->'rows'->'versoes','[]')) LOOP
  d:=(v->>'documento')::jsonb;
  IF (d->>'numero')::bigint<=0 THEN v:=jsonb_set(v,'{documento}',to_jsonb(jsonb_set(d,'{numero}',to_jsonb(n))::text)); END IF;
  arr:=arr||jsonb_build_array(v);
 END LOOP;
 RETURN jsonb_set(p,'{rows,versoes}',arr);
END $$;

-- Organização inicial, uma única vez por empresa. A ordem é determinística.
DO $organizar$
DECLARE e record; mapa record; t text; d jsonb; v record; snap jsonb; numero_versao bigint; nova_versao text; meta jsonb;
BEGIN
 FOR e IN SELECT id FROM empresas WHERE NOT EXISTS(SELECT 1 FROM migracoes_numeracao WHERE empresa_id=empresas.id) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(e.id::text,0));
  INSERT INTO mapa_numeracao
   SELECT e.id,tipo,id,numero,row_number() OVER(PARTITION BY tipo ORDER BY data,criado,numero,id)::integer FROM (
    SELECT 'orcamento'::text tipo,id,numero,data,criado_em criado FROM orcamentos WHERE empresa_id=e.id
    UNION ALL SELECT 'relatorio',id,numero,data,criado_em FROM relatorios WHERE empresa_id=e.id
    UNION ALL SELECT 'recibo',id,numero,data::date,criado_em FROM recibos WHERE empresa_id=e.id
   ) docs;
  -- Deslocamento temporário evita colisões durante trocas de números.
  UPDATE orcamentos SET numero=-1000000000000000-numero WHERE empresa_id=e.id;
  UPDATE relatorios SET numero=-1000000000000000-numero WHERE empresa_id=e.id;
  UPDATE recibos SET numero=-1000000000000000-numero WHERE empresa_id=e.id;
  UPDATE orcamentos o SET numero=m.novo FROM mapa_numeracao m WHERE m.empresa_id=e.id AND m.tipo='orcamento' AND o.empresa_id=m.empresa_id AND o.id=m.documento_id;
  UPDATE relatorios o SET numero=m.novo FROM mapa_numeracao m WHERE m.empresa_id=e.id AND m.tipo='relatorio' AND o.empresa_id=m.empresa_id AND o.id=m.documento_id;
  UPDATE recibos o SET numero=m.novo FROM mapa_numeracao m WHERE m.empresa_id=e.id AND m.tipo='recibo' AND o.empresa_id=m.empresa_id AND o.id=m.documento_id;
  UPDATE relatorios r SET origem_orcamento_numero=m.novo FROM mapa_numeracao m WHERE m.empresa_id=e.id AND m.tipo='orcamento' AND r.empresa_id=m.empresa_id AND r.origem_orcamento_id=m.documento_id;
  -- Atualiza somente o sufixo automático com origem comprovada pela chave.
  UPDATE recibos r SET descricao=replace(r.descricao,
   'conforme '||CASE m.tipo WHEN 'orcamento' THEN 'proposta' ELSE 'relatório' END||' Nº '||lpad(m.anterior::text,6,'0')||'.',
   'conforme '||CASE m.tipo WHEN 'orcamento' THEN 'proposta' ELSE 'relatório' END||' Nº '||lpad(m.novo::text,6,'0')||'.')
   FROM mapa_numeracao m WHERE r.empresa_id=e.id AND m.empresa_id=e.id AND r.origem_tipo=m.tipo AND r.origem_id=m.documento_id;
  DELETE FROM numeros_documentos WHERE empresa_id=e.id;
  INSERT INTO numeros_documentos SELECT empresa_id,tipo,novo,documento_id FROM mapa_numeracao WHERE empresa_id=e.id;
  UPDATE numeros_emitidos n SET numero=m.novo FROM mapa_numeracao m WHERE n.empresa_id=m.empresa_id AND n.tipo=m.tipo AND n.documento_id=m.documento_id AND m.empresa_id=e.id;
  FOREACH t IN ARRAY ARRAY['orcamento','relatorio','recibo'] LOOP
   INSERT INTO sincronizacao.sequencias_documentos VALUES(e.id,t,(SELECT coalesce(max(novo),0)+1 FROM mapa_numeracao WHERE empresa_id=e.id AND tipo=t))
    ON CONFLICT(empresa_id,tipo) DO UPDATE SET proximo=excluded.proximo;
  END LOOP;
  FOR mapa IN SELECT * FROM mapa_numeracao WHERE empresa_id=e.id LOOP
   SELECT * INTO v FROM versoes_documentos WHERE empresa_id=e.id AND tipo=mapa.tipo AND documento_id=mapa.documento_id ORDER BY numero DESC LIMIT 1;
   IF v.id IS NOT NULL THEN
    snap:=jsonb_set(v.documento,'{numero}',to_jsonb(mapa.novo))-'idInterno';
    IF mapa.tipo='recibo' THEN
     SELECT descricao INTO t FROM recibos WHERE empresa_id=e.id AND id=mapa.documento_id;
     snap:=jsonb_set(snap,'{descricao}',to_jsonb(t));
    END IF;
    IF mapa.tipo='relatorio' AND snap->'origemOrcamento'->>'id' IS NOT NULL THEN
     SELECT novo INTO numero_versao FROM mapa_numeracao WHERE empresa_id=e.id AND tipo='orcamento' AND documento_id=snap->'origemOrcamento'->>'id';
     IF numero_versao IS NOT NULL THEN snap:=jsonb_set(snap,'{origemOrcamento,numero}',to_jsonb(numero_versao)); END IF;
    END IF;
    numero_versao:=v.numero+1; nova_versao:=md5(e.id::text||mapa.tipo||mapa.documento_id||':numeracao-v3');
    snap:=jsonb_set(snap,'{versao}',to_jsonb(numero_versao));
    PERFORM sincronizacao.escrever_linha(e.id,'versoes',jsonb_build_object('id',nova_versao,'tipo',mapa.tipo,'documento_id',mapa.documento_id,'numero',numero_versao,'anterior_id',v.id,'criado_em',now()::text,'computador','Migração de numeração','descricao','Organização da numeração: '||mapa.anterior||' → '||mapa.novo,'documento',snap::text));
    UPDATE documentos SET dados=jsonb_set(dados-'idInterno','{versao}',to_jsonb(numero_versao)) WHERE empresa_id=e.id AND tipo=mapa.tipo AND documento_id=mapa.documento_id;
   END IF;
   UPDATE sincronizacao.entidades SET revisao=revisao+1,sequencia=nextval('gdo_changes') WHERE empresa_id=e.id AND entidade=mapa.tipo||':'||mapa.documento_id;
   INSERT INTO auditoria_colaboracao(empresa_id,acao,entidade,dados) VALUES(e.id,'renumerar',mapa.tipo||':'||mapa.documento_id,jsonb_build_object('anterior',mapa.anterior,'novo',mapa.novo));
  END LOOP;
  INSERT INTO auditoria_colaboracao(empresa_id,acao,dados) SELECT e.id,'invalidar_reservas_v2',jsonb_build_object('reservas',coalesce(jsonb_agg(to_jsonb(r)),'[]')) FROM reservas_numeros r WHERE empresa_id=e.id;
  DELETE FROM reservas_numeros WHERE empresa_id=e.id;
  INSERT INTO migracoes_numeracao(empresa_id) VALUES(e.id);
 END LOOP;
END $organizar$;

-- Substituições geradas a partir do validador de posse e financeiro já testado.
__VALIDADOR_V3__
__APPLY_V3__

CREATE OR REPLACE FUNCTION public.gdo_batch_v3(p_operacoes jsonb,p_dispositivo uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); x jsonb; ops jsonb:='[]'; t text; id_doc text; n integer; atual bigint; r jsonb; principal text;
BEGIN
 PERFORM sincronizacao.exigir_dispositivo(e,p_dispositivo);
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
 -- O subbloco reverte contadores e registros se a revisão de qualquer operação divergir.
 BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(p_operacoes) LOOP
   t:=split_part(x->>'entidade',':',1); id_doc:=substr(x->>'entidade',length(t)+2);
   IF t IN ('orcamento','relatorio','recibo') AND NOT coalesce((x->'payload'->>'excluido')::boolean,false) THEN
    SELECT numero INTO n FROM numeros_documentos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc;
    IF NOT FOUND THEN
     INSERT INTO sincronizacao.sequencias_documentos VALUES(e,t,1) ON CONFLICT DO NOTHING;
     UPDATE sincronizacao.sequencias_documentos SET proximo=proximo+1 WHERE empresa_id=e AND tipo=t RETURNING proximo-1 INTO n;
     IF n>999999 THEN RAISE EXCEPTION 'Limite de numeração atingido'; END IF;
     INSERT INTO numeros_documentos VALUES(e,t,n,id_doc);
    END IF;
    principal:=CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END;
    atual:=(x->'payload'->'rows'->principal->0->>'numero')::bigint;
    IF EXISTS(SELECT 1 FROM documentos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc) AND atual>0 AND atual<>n THEN
     IF EXISTS(SELECT 1 FROM numeros_emitidos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc) THEN RAISE EXCEPTION 'Número emitido protegido'; END IF;
     IF atual<(SELECT proximo FROM sincronizacao.sequencias_documentos WHERE empresa_id=e AND tipo=t) OR atual>999999 THEN RAISE EXCEPTION 'Número utilizado ou abandonado não pode ser reutilizado'; END IF;
     UPDATE numeros_documentos SET numero=atual WHERE empresa_id=e AND tipo=t AND documento_id=id_doc;
     UPDATE sincronizacao.sequencias_documentos SET proximo=atual+1 WHERE empresa_id=e AND tipo=t; n:=atual;
    END IF;
    x:=jsonb_set(x,'{payload}',sincronizacao.numero_payload(x->'payload',n));
   END IF;
   ops:=ops||jsonb_build_array(x);
  END LOOP;
  r:=sincronizacao.batch_colaboracao_v3(ops,p_dispositivo);
  IF NOT (r->>'ok')::boolean THEN RAISE no_data_found; END IF;
 EXCEPTION WHEN no_data_found THEN RETURN r;
 END;
 RETURN r||jsonb_build_object('numeros',(SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'documentoId',documento_id,'numero',numero)),'[]') FROM numeros_documentos WHERE empresa_id=e AND tipo||':'||documento_id IN (SELECT item->>'entidade' FROM jsonb_array_elements(p_operacoes) item)));
END $$;

CREATE OR REPLACE FUNCTION public.gdo_numeracao_v3(p_tipo text,p_proximo integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); proximo integer; ultimo integer;
BEGIN
 IF p_tipo NOT IN ('orcamento','relatorio','recibo') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
 SELECT coalesce(max(numero),0) INTO ultimo FROM numeros_documentos WHERE empresa_id=e AND tipo=p_tipo;
 SELECT greatest(ultimo+1,coalesce((SELECT s.proximo FROM sincronizacao.sequencias_documentos s WHERE s.empresa_id=e AND s.tipo=p_tipo),1)) INTO proximo;
 IF p_proximo IS NOT NULL THEN
  IF p_proximo<proximo OR p_proximo>999999 THEN RAISE EXCEPTION 'Informe um número entre % e 999999. Números atribuídos ou abandonados não são reutilizados',proximo; END IF;
  INSERT INTO sincronizacao.sequencias_documentos VALUES(e,p_tipo,p_proximo) ON CONFLICT(empresa_id,tipo) DO UPDATE SET proximo=excluded.proximo;
  INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,entidade,dados) VALUES(e,auth.uid(),'numeracao','numeracao:'||p_tipo,jsonb_build_object('proximo',p_proximo));
  proximo:=p_proximo;
 END IF;
 RETURN jsonb_build_object('proximoNumero',proximo,'minimo',proximo,'ultimoNumero',ultimo);
END $$;
CREATE OR REPLACE FUNCTION public.gdo_alteracoes_v3(p_cursor bigint DEFAULT 0,p_limite integer DEFAULT 50) RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
 SELECT to_jsonb(e)||jsonb_build_object('autoria',to_jsonb(a),'controle',to_jsonb(l),'emissao',to_jsonb(m)) FROM gdo_entities e
 LEFT JOIN autoria_documentos a ON a.empresa_id=e.usuario AND e.entidade=a.tipo||':'||a.documento_id
 LEFT JOIN edicoes_documento l ON l.empresa_id=e.usuario AND e.entidade=l.tipo||':'||l.documento_id
 LEFT JOIN numeros_emitidos m ON m.empresa_id=e.usuario AND e.entidade=m.tipo||':'||m.documento_id
 WHERE e.usuario=gdo_empresa() AND e.sequencia>p_cursor ORDER BY e.sequencia LIMIT least(greatest(p_limite,1),100);
$$;
CREATE OR REPLACE FUNCTION public.gdo_documento_v3(p_tipo text,p_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
 SELECT x FROM gdo_alteracoes_v3(0,100) x WHERE x->>'entidade'=p_tipo||':'||p_id;
$$;
-- A consulta de um documento não pode depender da posição na paginação.
CREATE OR REPLACE FUNCTION public.gdo_documento_v3(p_tipo text,p_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
 SELECT to_jsonb(e)||jsonb_build_object('autoria',to_jsonb(a),'controle',to_jsonb(l),'emissao',to_jsonb(m)) FROM gdo_entities e
 LEFT JOIN autoria_documentos a ON a.empresa_id=e.usuario AND a.tipo=p_tipo AND a.documento_id=p_id
 LEFT JOIN edicoes_documento l ON l.empresa_id=e.usuario AND l.tipo=p_tipo AND l.documento_id=p_id
 LEFT JOIN numeros_emitidos m ON m.empresa_id=e.usuario AND m.tipo=p_tipo AND m.documento_id=p_id
 WHERE e.usuario=gdo_empresa() AND e.entidade=p_tipo||':'||p_id;
$$;
CREATE OR REPLACE FUNCTION public.gdo_contexto_v3(p_criar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c jsonb;
BEGIN
 c:=gdo_contexto_v2(p_criar)||jsonb_build_object('protocolo',3);
 INSERT INTO migracoes_numeracao(empresa_id) VALUES((c->>'empresaId')::uuid) ON CONFLICT DO NOTHING;
 RETURN c;
END $$;
CREATE OR REPLACE FUNCTION public.gdo_dispositivo_v3(p_dispositivo uuid,p_nome text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT gdo_dispositivo_v2(p_dispositivo,p_nome) $$;
CREATE OR REPLACE FUNCTION public.gdo_membros_v3(p_usuario uuid DEFAULT NULL,p_email text DEFAULT NULL,p_nome text DEFAULT NULL,p_ativo boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT gdo_membros_v2(p_usuario,p_email,p_nome,p_ativo) $$;
CREATE OR REPLACE FUNCTION public.gdo_edicao_v3(p_tipo text,p_id text,p_dispositivo uuid,p_acao text DEFAULT 'obter',p_geracao bigint DEFAULT NULL,p_destino uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$ SELECT gdo_edicao_v2(p_tipo,p_id,p_dispositivo,p_acao,p_geracao,p_destino) $$;
REVOKE ALL ON FUNCTION public.gdo_dispositivo_v2(uuid,text),public.gdo_membros_v2(uuid,text,text,boolean),public.gdo_edicao_v2(text,text,uuid,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gdo_dispositivo_v3(uuid,text),public.gdo_membros_v3(uuid,text,text,boolean),public.gdo_edicao_v3(text,text,uuid,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_dispositivo_v3(uuid,text),public.gdo_membros_v3(uuid,text,text,boolean),public.gdo_edicao_v3(text,text,uuid,text,bigint,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gdo_batch_v2(jsonb,uuid),public.gdo_reserve_v2(text,uuid,integer),public.gdo_bootstrap_v2(uuid,jsonb),public.gdo_numeracao_v2(text,integer) FROM PUBLIC,anon,authenticated;
DROP FUNCTION public.gdo_alteracoes_v2(bigint,integer);
DROP FUNCTION public.gdo_documento_v2(text,text);
CREATE TABLE IF NOT EXISTS sincronizacao.identificadores_anteriores (LIKE public.identificadores_documento INCLUDING ALL);
INSERT INTO sincronizacao.identificadores_anteriores SELECT * FROM public.identificadores_documento ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS sincronizacao.contadores_anteriores (LIKE sincronizacao.contadores_internos INCLUDING ALL);
INSERT INTO sincronizacao.contadores_anteriores SELECT * FROM sincronizacao.contadores_internos ON CONFLICT DO NOTHING;
DROP TABLE public.identificadores_documento;
DROP TABLE sincronizacao.contadores_internos;
REVOKE ALL ON sincronizacao.identificadores_anteriores,sincronizacao.contadores_anteriores FROM PUBLIC,anon,authenticated;
ALTER TABLE sincronizacao.identificadores_anteriores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sincronizacao.contadores_anteriores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sincronizacao FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sincronizacao.membro(uuid) TO authenticated;
DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['autoria_documentos','numeros_documentos','mapa_numeracao','migracoes_numeracao'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS empresa_leitura ON public.%I',t);
  EXECUTE format('CREATE POLICY empresa_leitura ON public.%I FOR SELECT TO authenticated USING(sincronizacao.membro(empresa_id))',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $rls$;
REVOKE ALL ON FUNCTION public.gdo_batch_v3(jsonb,uuid),public.gdo_numeracao_v3(text,integer),public.gdo_alteracoes_v3(bigint,integer),public.gdo_documento_v3(text,text),public.gdo_contexto_v3(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_batch_v3(jsonb,uuid),public.gdo_numeracao_v3(text,integer),public.gdo_alteracoes_v3(bigint,integer),public.gdo_documento_v3(text,text),public.gdo_contexto_v3(boolean) TO authenticated;
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
-- Padrões são criados uma vez para cada empresa central, antes de qualquer perfil baixar o delta.
CREATE OR REPLACE FUNCTION sincronizacao.criar_padroes_empresa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE observacao_id text:='00000000-0000-4000-8000-000000000001'; pagamento_id text:='00000000-0000-4000-8000-000000000002';
BEGIN
  -- No modo legado, a empresa é auth.users(id) e publica os padrões locais.
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.id) THEN RETURN NEW; END IF;
  INSERT INTO public.observacoes_padrao(empresa_id,id,texto,padrao,ordem,aplicacao)
    VALUES(NEW.id,observacao_id,'O valor considera o escopo e as quantidades informadas nesta proposta. Alterações serão acordadas entre as partes.',1,0,'orcamento');
  INSERT INTO public.formas_pagamento_padrao(empresa_id,id,texto,padrao,ordem,aplicacao)
    VALUES(NEW.id,pagamento_id,'Pagamento conforme combinado entre as partes.',1,0,'orcamento');
  INSERT INTO sincronizacao.entidades(empresa_id,entidade,revisao,sequencia,excluido)
    VALUES(NEW.id,'observacoes_padrao:'||observacao_id,1,nextval('public.gdo_changes'),false),
          (NEW.id,'pagamentos_padrao:'||pagamento_id,1,nextval('public.gdo_changes'),false);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sincronizacao.criar_padroes_empresa() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS gdo_padroes_empresa ON public.empresas;
CREATE TRIGGER gdo_padroes_empresa AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION sincronizacao.criar_padroes_empresa();
