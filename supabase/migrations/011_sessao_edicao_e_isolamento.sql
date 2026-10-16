-- Sessões encerradas e colaboração do Administrador do Sistema.
BEGIN;
CREATE OR REPLACE FUNCTION public.gdo_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 e:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-gdo-empresa';
 IF e IS NULL THEN RAISE EXCEPTION 'Selecione uma empresa no aplicativo atualizado'; END IF;
 IF EXISTS(SELECT 1 FROM central.empresas_excluidas WHERE empresa_id=e) THEN RAISE EXCEPTION USING ERRCODE='GDE01', MESSAGE='Esta empresa foi excluída'; END IF;
 IF NOT sincronizacao.membro(e) THEN RAISE EXCEPTION USING ERRCODE='GDA01', MESSAGE='Você não tem acesso a esta empresa'; END IF;
 RETURN e;
END $$;
CREATE OR REPLACE FUNCTION public.gdo_contexto_v4(p_empresa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
DECLARE nome text; papel text;
BEGIN
 IF EXISTS(SELECT 1 FROM central.empresas_excluidas WHERE empresa_id=p_empresa) THEN
   RAISE EXCEPTION USING ERRCODE='GDE01', MESSAGE='Esta empresa foi removida pelo Operador do Sistema.';
 END IF;
 IF p_empresa IS DISTINCT FROM gdo_empresa() THEN RAISE EXCEPTION 'Empresa selecionada inválida'; END IF;
 SELECT coalesce(m.nome,nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1),u.email),
        CASE WHEN o.usuario_id IS NOT NULL THEN 'administrador' ELSE m.papel END
 INTO nome,papel
 FROM auth.users u
 LEFT JOIN membros_empresa m ON m.empresa_id=p_empresa AND m.usuario_id=u.id AND m.ativo
 LEFT JOIN central.operadores o ON o.usuario_id=u.id
 WHERE u.id=auth.uid();
 IF papel IS NULL THEN RAISE EXCEPTION USING ERRCODE='GDA01', MESSAGE='Você não tem acesso a esta empresa'; END IF;
 RETURN jsonb_build_object('protocolo',4,'empresaId',p_empresa,'usuarioId',auth.uid(),'usuarioNome',nome,'papel',papel);
END $$;
CREATE OR REPLACE FUNCTION public.gdo_edicao_v2(p_tipo text,p_id text,p_dispositivo uuid,p_acao text DEFAULT 'obter',p_geracao bigint DEFAULT NULL,p_destino uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); l public.edicoes_documento%rowtype; r bigint; u uuid; vencido boolean; relacionado record;
BEGIN
  PERFORM sincronizacao.exigir_dispositivo(e,p_dispositivo);
  IF p_tipo NOT IN ('orcamento','relatorio','recibo') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
  SELECT revisao INTO r FROM sincronizacao.entidades WHERE empresa_id=e AND entidade=p_tipo||':'||p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM edicoes_documento WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
  vencido:=l.geracao IS NULL OR (NOT l.offline AND (l.expira_em IS NULL OR l.expira_em<=now()));
  IF p_acao IN ('adquirir','offline','recuperar') THEN
    IF NOT vencido AND (l.usuario_id<>auth.uid() OR l.dispositivo<>p_dispositivo) AND p_acao<>'recuperar' THEN RAISE EXCEPTION 'Documento em edição ou preparado offline por outro usuário/computador'; END IF;
    IF p_acao<>'recuperar' AND EXISTS(SELECT 1 FROM edicoes_documento a JOIN sincronizacao.conjunto_financeiro(e,p_tipo,p_id) c USING(tipo,documento_id)
      WHERE a.empresa_id=e AND (a.usuario_id<>auth.uid() OR a.dispositivo<>p_dispositivo) AND
      (a.offline OR (p_acao='offline' AND a.expira_em>now()))) THEN
      RAISE EXCEPTION 'O conjunto financeiro possui autorização em outro usuário/computador'; END IF;
    IF p_acao='recuperar' THEN
      UPDATE edicoes_documento a SET geracao=a.geracao+1,offline=false,expira_em=now()
        FROM sincronizacao.conjunto_financeiro(e,p_tipo,p_id) c
        WHERE a.empresa_id=e AND a.tipo=c.tipo AND a.documento_id=c.documento_id AND NOT (a.tipo=p_tipo AND a.documento_id=p_id);
    END IF;
    IF NOT vencido AND l.usuario_id=auth.uid() AND l.dispositivo=p_dispositivo AND (p_acao='adquirir' OR (p_acao='offline' AND l.offline)) THEN
      UPDATE edicoes_documento SET expira_em=CASE WHEN offline THEN NULL ELSE now()+interval '120 seconds' END WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
    ELSE
    INSERT INTO edicoes_documento VALUES(e,p_tipo,p_id,auth.uid(),p_dispositivo,coalesce(l.geracao,0)+1,CASE WHEN p_acao='offline' THEN NULL ELSE now()+interval '120 seconds' END,p_acao='offline',r)
      ON CONFLICT(empresa_id,tipo,documento_id) DO UPDATE SET usuario_id=excluded.usuario_id,dispositivo=excluded.dispositivo,geracao=excluded.geracao,expira_em=excluded.expira_em,offline=excluded.offline,revisao=excluded.revisao;
    END IF;
    IF p_acao='offline' THEN
      FOR relacionado IN SELECT * FROM sincronizacao.conjunto_financeiro(e,p_tipo,p_id) LOOP
        IF relacionado.tipo=p_tipo AND relacionado.documento_id=p_id THEN CONTINUE; END IF;
        INSERT INTO edicoes_documento VALUES(e,relacionado.tipo,relacionado.documento_id,auth.uid(),p_dispositivo,1,NULL,true,
          (SELECT revisao FROM sincronizacao.entidades WHERE empresa_id=e AND entidade=relacionado.tipo||':'||relacionado.documento_id))
        ON CONFLICT(empresa_id,tipo,documento_id) DO UPDATE SET usuario_id=excluded.usuario_id,dispositivo=excluded.dispositivo,
          geracao=CASE WHEN edicoes_documento.offline AND edicoes_documento.usuario_id=auth.uid() AND edicoes_documento.dispositivo=p_dispositivo THEN edicoes_documento.geracao ELSE edicoes_documento.geracao+1 END,
          offline=true,expira_em=NULL,revisao=excluded.revisao;
      END LOOP;
    END IF;
  ELSIF p_acao IN ('renovar','liberar','transferir') THEN
    IF l.usuario_id IS DISTINCT FROM auth.uid() OR l.dispositivo IS DISTINCT FROM p_dispositivo OR l.geracao IS DISTINCT FROM p_geracao OR vencido THEN RAISE EXCEPTION 'Autorização de edição expirada ou revogada'; END IF;
    IF p_acao='renovar' THEN UPDATE edicoes_documento SET expira_em=CASE WHEN offline THEN NULL ELSE now()+interval '120 seconds' END WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
    ELSIF p_acao='liberar' THEN UPDATE edicoes_documento SET offline=false,expira_em=now(),geracao=geracao+1 WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
    ELSE
      SELECT usuario_id INTO u FROM dispositivos_usuarios WHERE empresa_id=e AND dispositivo=p_destino;
      IF u IS NULL OR NOT central.administrador(e,u) AND NOT EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=u AND ativo) THEN RAISE EXCEPTION 'Destino não registrado ou membro inativo'; END IF;
      UPDATE edicoes_documento SET usuario_id=u,dispositivo=p_destino,geracao=geracao+1,expira_em=CASE WHEN offline THEN NULL ELSE now()+interval '120 seconds' END WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
    END IF;
    IF l.offline AND p_acao IN ('liberar','transferir') THEN
      UPDATE edicoes_documento a SET usuario_id=CASE WHEN p_acao='transferir' THEN u ELSE a.usuario_id END,
        dispositivo=CASE WHEN p_acao='transferir' THEN p_destino ELSE a.dispositivo END,
        geracao=a.geracao+1,offline=p_acao='transferir',expira_em=CASE WHEN p_acao='transferir' THEN NULL ELSE now() END
      FROM sincronizacao.conjunto_financeiro(e,p_tipo,p_id) c
      WHERE a.empresa_id=e AND a.tipo=c.tipo AND a.documento_id=c.documento_id AND NOT (a.tipo=p_tipo AND a.documento_id=p_id);
    END IF;
  ELSIF p_acao='cancelarPedido' THEN
    DELETE FROM pedidos_edicao WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id AND usuario_id=auth.uid() AND dispositivo=p_dispositivo;
  ELSIF p_acao='solicitar' THEN
    IF l.geracao IS NULL OR (NOT l.offline AND l.expira_em<=now()) THEN
      RETURN gdo_edicao_v2(p_tipo,p_id,p_dispositivo,'adquirir',p_geracao,p_destino);
    END IF;
    INSERT INTO pedidos_edicao VALUES(e,p_tipo,p_id,auth.uid(),p_dispositivo,now())
      ON CONFLICT(empresa_id,tipo,documento_id,usuario_id,dispositivo) DO UPDATE SET criado_em=excluded.criado_em;
  ELSIF p_acao<>'obter' THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  IF p_acao IN ('liberar','transferir','recuperar') THEN DELETE FROM pedidos_edicao WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id; END IF;
  IF p_acao NOT IN ('obter','renovar') THEN INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,dispositivo,acao,entidade,dados) VALUES(e,auth.uid(),p_dispositivo,p_acao,p_tipo||':'||p_id,jsonb_build_object('destino',p_destino)); END IF;
  SELECT * INTO l FROM edicoes_documento WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
  IF l.geracao IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tipo',p_tipo,'documentoId',p_id,'usuarioId',l.usuario_id,'usuarioNome',(SELECT coalesce(nullif(a.raw_user_meta_data->>'name',''),a.email) FROM auth.users a WHERE a.id=l.usuario_id),'computador',l.dispositivo,'geracao',l.geracao,'expiraEm',l.expira_em,'offline',l.offline,'revisao',r,'podeEditar',l.usuario_id=auth.uid() AND l.dispositivo=p_dispositivo AND (l.offline OR l.expira_em>now()),
    'pedidoPendente',EXISTS(SELECT 1 FROM pedidos_edicao WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id AND usuario_id=auth.uid() AND dispositivo=p_dispositivo),'solicitacoes',(SELECT coalesce(jsonb_agg(jsonb_build_object('usuarioNome',coalesce(m.nome,nullif(a.raw_user_meta_data->>'name',''),a.email),'computador',p.dispositivo,'criadoEm',p.criado_em) ORDER BY p.criado_em),'[]') FROM pedidos_edicao p JOIN auth.users a ON a.id=p.usuario_id LEFT JOIN membros_empresa m ON m.empresa_id=p.empresa_id AND m.usuario_id=p.usuario_id WHERE p.empresa_id=e AND p.tipo=p_tipo AND p.documento_id=p_id AND (m.ativo OR EXISTS(SELECT 1 FROM central.operadores o WHERE o.usuario_id=p.usuario_id))));
END $$;
CREATE OR REPLACE FUNCTION public.gdo_convites_operador(p_empresa uuid DEFAULT NULL,p_cancelar uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE operador boolean:=EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()); e uuid;
BEGIN
 IF NOT operador AND (p_empresa IS NULL OR NOT central.administrador(p_empresa,auth.uid())) THEN RAISE EXCEPTION 'Você não pode gerenciar estes convites'; END IF;
 IF p_cancelar IS NOT NULL THEN
  SELECT empresa_id INTO e FROM central.convites WHERE id=p_cancelar;
  IF e IS DISTINCT FROM p_empresa THEN RAISE EXCEPTION 'Convite indisponível'; END IF;
  UPDATE central.convites SET cancelado_em=now() WHERE id=p_cancelar AND aceito_em IS NULL;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'empresaId',empresa_id,'email',email,'nome',nome,'papel',papel,'expiraEm',expira_em,'aceitoEm',aceito_em,'canceladoEm',cancelado_em,'ultimoEnvio',ultimo_envio) ORDER BY expira_em DESC),'[]') FROM central.convites WHERE (p_empresa IS NULL OR empresa_id=p_empresa));
END $$;
CREATE OR REPLACE FUNCTION public.gdo_excluir_empresa(p_ator uuid,p_empresa uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
DECLARE r record; removidas bigint; progresso boolean; restantes bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_ator) THEN
   RAISE EXCEPTION 'Somente o Operador do Sistema pode remover empresas';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM empresas WHERE id=p_empresa) THEN
   IF EXISTS(SELECT 1 FROM central.empresas_excluidas WHERE empresa_id=p_empresa) THEN RETURN; END IF;
   RAISE EXCEPTION 'Empresa não encontrada';
 END IF;
 PERFORM 1 FROM empresas WHERE id=p_empresa FOR UPDATE;
 INSERT INTO central.empresas_excluidas(empresa_id) VALUES(p_empresa) ON CONFLICT DO NOTHING;
 LOOP
   progresso:=false;
   FOR r IN
     SELECT c.table_schema,c.table_name FROM information_schema.columns c
      WHERE table_schema IN ('public','central','sincronizacao') AND column_name='empresa_id'
        AND NOT (table_schema='central' AND table_name='empresas_excluidas')
        AND NOT (table_schema='public' AND table_name='empresas')
        AND EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE')
      GROUP BY table_schema,table_name ORDER BY table_schema,table_name
   LOOP
     BEGIN
       EXECUTE format('DELETE FROM %I.%I WHERE empresa_id=$1',r.table_schema,r.table_name) USING p_empresa;
       GET DIAGNOSTICS removidas=ROW_COUNT;
       IF removidas>0 THEN progresso:=true; END IF;
     EXCEPTION WHEN foreign_key_violation THEN
       -- Tenta novamente depois de remover as tabelas dependentes.
       NULL;
     END;
   END LOOP;
   restantes:=0;
   FOR r IN
     SELECT c.table_schema,c.table_name FROM information_schema.columns c
      WHERE table_schema IN ('public','central','sincronizacao') AND column_name='empresa_id'
        AND NOT (table_schema='central' AND table_name='empresas_excluidas')
        AND NOT (table_schema='public' AND table_name='empresas')
        AND EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE')
      GROUP BY table_schema,table_name
   LOOP
     BEGIN
       EXECUTE format('SELECT count(*) FROM %I.%I WHERE empresa_id=$1',r.table_schema,r.table_name) INTO removidas USING p_empresa;
       restantes:=restantes+removidas;
     EXCEPTION WHEN undefined_table THEN NULL;
     END;
   END LOOP;
   EXIT WHEN restantes=0;
   IF NOT progresso THEN RAISE EXCEPTION 'Não foi possível remover todos os dados relacionados à empresa'; END IF;
 END LOOP;
 DELETE FROM public.empresas WHERE id=p_empresa;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
   PERFORM realtime.send(jsonb_build_object('empresaExcluida',true),'alteracao','empresa:'||p_empresa::text,true);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
