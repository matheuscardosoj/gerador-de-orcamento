-- Separa o Operador do Sistema dos membros das empresas e permite remover
-- empresas apenas pela rota autenticada do serviço central.
BEGIN;

CREATE TABLE IF NOT EXISTS central.empresas_excluidas (
  empresa_id uuid PRIMARY KEY,
  excluida_em timestamptz NOT NULL DEFAULT now()
);

-- A instalação suporta exatamente um Operador do Sistema.
CREATE UNIQUE INDEX IF NOT EXISTS operadores_unico_no_sistema
  ON central.operadores ((true));

CREATE OR REPLACE FUNCTION sincronizacao.membro(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM central.empresas_excluidas x WHERE x.empresa_id=p_empresa
  ) AND (
    EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=auth.uid() AND ativo)
    OR EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION central.administrador(p_empresa uuid,p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM central.empresas_excluidas x WHERE x.empresa_id=p_empresa)
 AND (
   EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_usuario)
   OR EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=p_usuario AND ativo AND papel='administrador')
 );
$$;

CREATE OR REPLACE FUNCTION public.gdo_contas() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
 SELECT jsonb_build_object(
  'operador',EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()),
  'empresas',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',e.id,
    'nome',coalesce(nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),e.nome),
    'papel',CASE WHEN o.usuario_id IS NOT NULL THEN 'administrador' ELSE m.papel END,
    'usuarioNome',coalesce(m.nome,nullif(a.raw_user_meta_data->>'name',''),split_part(a.email,'@',1),a.email)
   ) ORDER BY coalesce(nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),e.nome))
   FROM empresas e
   LEFT JOIN membros_empresa m ON m.empresa_id=e.id AND m.usuario_id=auth.uid() AND m.ativo
   LEFT JOIN configuracoes_empresa c ON c.empresa_id=e.id AND c.chave='empresa'
   LEFT JOIN auth.users a ON a.id=auth.uid()
   LEFT JOIN central.operadores o ON o.usuario_id=auth.uid()
   WHERE NOT EXISTS(SELECT 1 FROM central.empresas_excluidas x WHERE x.empresa_id=e.id)
     AND (o.usuario_id IS NOT NULL OR m.usuario_id IS NOT NULL)
  ),'[]'::jsonb)
 );
$$;

CREATE OR REPLACE FUNCTION public.gdo_contexto_v4(p_empresa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
DECLARE nome text; papel text;
BEGIN
 IF EXISTS(SELECT 1 FROM central.empresas_excluidas WHERE empresa_id=p_empresa) THEN
   RAISE EXCEPTION 'EMPRESA_EXCLUIDA: esta empresa foi removida pelo Operador do Sistema.';
 END IF;
 IF p_empresa IS DISTINCT FROM gdo_empresa() THEN RAISE EXCEPTION 'Empresa selecionada inválida'; END IF;
 SELECT coalesce(m.nome,nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1),u.email),
        CASE WHEN o.usuario_id IS NOT NULL THEN 'administrador' ELSE m.papel END
 INTO nome,papel
 FROM auth.users u
 LEFT JOIN membros_empresa m ON m.empresa_id=p_empresa AND m.usuario_id=u.id AND m.ativo
 LEFT JOIN central.operadores o ON o.usuario_id=u.id
 WHERE u.id=auth.uid();
 IF papel IS NULL THEN RAISE EXCEPTION 'Você não tem acesso a esta empresa'; END IF;
 RETURN jsonb_build_object('protocolo',4,'empresaId',p_empresa,'usuarioId',auth.uid(),'usuarioNome',nome,'papel',papel);
END $$;

CREATE OR REPLACE FUNCTION public.gdo_meu_nome(p_nome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF length(trim(p_nome)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Informe um nome com até 120 caracteres'; END IF;
 IF EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()) THEN
   UPDATE auth.users SET raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{name}',to_jsonb(trim(p_nome)),true)
   WHERE id=auth.uid();
 ELSE
   UPDATE membros_empresa SET nome=trim(p_nome) WHERE empresa_id=e AND usuario_id=auth.uid();
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gdo_membros_v3(p_usuario uuid DEFAULT NULL,p_email text DEFAULT NULL,p_nome text DEFAULT NULL,p_ativo boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF p_email IS NOT NULL THEN RAISE EXCEPTION 'Use Enviar convite para adicionar uma pessoa'; END IF;
 IF p_usuario IS NOT NULL THEN
  IF NOT central.administrador(e,auth.uid()) THEN RAISE EXCEPTION 'Somente administradores podem gerenciar usuários'; END IF;
  IF EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_usuario) THEN
    RAISE EXCEPTION 'O Operador do Sistema não pode ser alterado como usuário da empresa';
  END IF;
  PERFORM 1 FROM empresas WHERE id=e FOR UPDATE;
  IF p_ativo=false AND EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=p_usuario AND ativo AND papel='administrador') AND
    (SELECT count(*) FROM membros_empresa WHERE empresa_id=e AND ativo AND papel='administrador')<=1 THEN
    RAISE EXCEPTION 'Mantenha pelo menos um administrador ativo';
  END IF;
  UPDATE membros_empresa SET ativo=coalesce(p_ativo,ativo),nome=coalesce(nullif(trim(p_nome),''),nome)
   WHERE empresa_id=e AND usuario_id=p_usuario;
  INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados)
   VALUES(e,auth.uid(),'membro',jsonb_build_object('usuario',p_usuario,'ativo',p_ativo));
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('usuarioId',m.usuario_id,'nome',m.nome,'email',u.email,'ativo',m.ativo,'papel',m.papel) ORDER BY m.nome),'[]')
   FROM membros_empresa m JOIN auth.users u ON u.id=m.usuario_id
   WHERE m.empresa_id=e AND NOT EXISTS(SELECT 1 FROM central.operadores o WHERE o.usuario_id=m.usuario_id));
END $$;

CREATE OR REPLACE FUNCTION public.gdo_papel_membro(p_usuario uuid,p_papel text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF p_papel NOT IN ('administrador','membro') OR NOT central.administrador(e,auth.uid()) THEN
   RAISE EXCEPTION 'Você não pode alterar este papel';
 END IF;
 IF EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_usuario) THEN
   RAISE EXCEPTION 'O nível de acesso do Operador do Sistema não pode ser alterado';
 END IF;
 PERFORM 1 FROM empresas WHERE id=e FOR UPDATE;
 IF p_papel='membro' AND EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=p_usuario AND ativo AND papel='administrador') AND
   (SELECT count(*) FROM membros_empresa WHERE empresa_id=e AND ativo AND papel='administrador')<=1 THEN
   RAISE EXCEPTION 'Mantenha pelo menos um administrador ativo';
 END IF;
 UPDATE membros_empresa SET papel=p_papel WHERE empresa_id=e AND usuario_id=p_usuario;
 INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados)
   VALUES(e,auth.uid(),'papel_membro',jsonb_build_object('usuario',p_usuario,'papel',p_papel));
END $$;

-- Chamado somente pela Edge Function depois de validar o JWT do operador.
-- As linhas são apagadas em ordem dependente, mantendo as contas Auth intactas.
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
END $$;

REVOKE ALL ON FUNCTION public.gdo_excluir_empresa(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gdo_excluir_empresa(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gdo_membros_v3(uuid,text,text,boolean),public.gdo_papel_membro(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_membros_v3(uuid,text,text,boolean),public.gdo_papel_membro(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.gdo_contas(),public.gdo_contexto_v4(uuid),public.gdo_meu_nome(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_contas(),public.gdo_contexto_v4(uuid),public.gdo_meu_nome(text) TO authenticated;

COMMIT;
