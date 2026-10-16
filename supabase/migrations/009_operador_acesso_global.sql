-- Operadores podem administrar empresas sem vínculo individual. Os demais
-- usuários continuam limitados aos vínculos ativos registrados.
BEGIN;

CREATE OR REPLACE FUNCTION sincronizacao.membro(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM membros_empresa
    WHERE empresa_id=p_empresa AND usuario_id=auth.uid() AND ativo
  ) OR EXISTS(
    SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION central.administrador(p_empresa uuid,p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,central,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_usuario)
 OR EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=p_usuario AND ativo AND papel='administrador');
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
   WHERE o.usuario_id IS NOT NULL OR m.usuario_id IS NOT NULL
  ),'[]'::jsonb)
 );
$$;

CREATE OR REPLACE FUNCTION public.gdo_contexto_v4(p_empresa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,central,auth,pg_temp AS $$
DECLARE nome text; papel text;
BEGIN
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
 UPDATE membros_empresa SET nome=trim(p_nome) WHERE empresa_id=e AND usuario_id=auth.uid();
 IF NOT FOUND AND EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()) THEN
  UPDATE auth.users SET raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{name}',to_jsonb(trim(p_nome)),true)
  WHERE id=auth.uid();
 END IF;
END $$;

DO $$
BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL THEN
  EXECUTE 'DROP POLICY IF EXISTS gdo_realtime_leitura ON realtime.messages';
  EXECUTE $policy$CREATE POLICY gdo_realtime_leitura ON realtime.messages FOR SELECT TO authenticated
    USING(EXISTS(SELECT 1 FROM public.empresas e WHERE realtime.topic()='empresa:'||e.id::text AND sincronizacao.membro(e.id)))$policy$;
 END IF;
END $$;

REVOKE ALL ON FUNCTION sincronizacao.membro(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sincronizacao.membro(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gdo_contas(),public.gdo_contexto_v4(uuid),public.gdo_meu_nome(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_contas(),public.gdo_contexto_v4(uuid),public.gdo_meu_nome(text) TO authenticated;

COMMIT;
