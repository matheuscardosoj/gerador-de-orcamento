-- Aplicar uma vez, sobre protocolo 3, após ensaio e backup verificado.
BEGIN;
CREATE SCHEMA IF NOT EXISTS central;
REVOKE ALL ON SCHEMA central FROM PUBLIC,anon,authenticated;
CREATE TABLE central.operadores(usuario_id uuid PRIMARY KEY REFERENCES auth.users(id));
ALTER TABLE central.operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros_empresa ADD COLUMN papel text NOT NULL DEFAULT 'membro' CHECK(papel IN ('administrador','membro'));
-- A empresa migrada preserva o UUID do responsável inicial.
UPDATE membros_empresa SET papel='administrador' WHERE empresa_id=usuario_id;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM empresas e WHERE NOT EXISTS(SELECT 1 FROM membros_empresa m WHERE m.empresa_id=e.id AND m.ativo AND m.papel='administrador')) THEN
  RAISE EXCEPTION 'Defina o administrador das empresas importadas antes da migração';
 END IF;
END $$;
CREATE TABLE central.convites(
 id uuid PRIMARY KEY,empresa_id uuid NOT NULL REFERENCES empresas(id),email text NOT NULL,
 nome text NOT NULL,papel text NOT NULL CHECK(papel IN ('administrador','membro')),
 criado_por uuid NOT NULL REFERENCES auth.users(id),expira_em timestamptz NOT NULL DEFAULT now()+interval '7 days',
 aceito_em timestamptz,cancelado_em timestamptz,ultimo_envio timestamptz,
 UNIQUE(empresa_id,email,id)
);
ALTER TABLE central.convites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA central FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gdo_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 e:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-gdo-empresa';
 IF e IS NULL THEN RAISE EXCEPTION 'Selecione uma empresa no aplicativo atualizado'; END IF;
 IF NOT sincronizacao.membro(e) THEN RAISE EXCEPTION 'Você não tem acesso a esta empresa'; END IF;
 RETURN e;
END $$;

CREATE FUNCTION central.administrador(p_empresa uuid,p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=p_usuario AND ativo AND papel='administrador');
$$;
CREATE FUNCTION public.gdo_contas() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('operador',EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()),
 'empresas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'nome',coalesce(nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),e.nome),'papel',m.papel,'usuarioNome',m.nome) ORDER BY coalesce(nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),e.nome))
 FROM empresas e JOIN membros_empresa m ON m.empresa_id=e.id LEFT JOIN configuracoes_empresa c ON c.empresa_id=e.id AND c.chave='empresa' WHERE m.usuario_id=auth.uid() AND m.ativo),'[]'::jsonb));
$$;
CREATE FUNCTION public.gdo_contexto_v4(p_empresa uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_empresa IS DISTINCT FROM gdo_empresa() THEN RAISE EXCEPTION 'Empresa selecionada inválida'; END IF;
 RETURN jsonb_build_object('protocolo',4,'empresaId',p_empresa,'usuarioId',auth.uid(),
 'usuarioNome',(SELECT nome FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=auth.uid()),
 'papel',(SELECT papel FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=auth.uid()));
END $$;

CREATE FUNCTION public.gdo_meu_nome(p_nome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF length(trim(p_nome)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Informe um nome com até 120 caracteres'; END IF;
 UPDATE membros_empresa SET nome=trim(p_nome) WHERE empresa_id=e AND usuario_id=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.gdo_membros_v3(p_usuario uuid DEFAULT NULL,p_email text DEFAULT NULL,p_nome text DEFAULT NULL,p_ativo boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF p_email IS NOT NULL THEN RAISE EXCEPTION 'Use Enviar convite para adicionar uma pessoa'; END IF;
 IF p_usuario IS NOT NULL THEN
  IF NOT central.administrador(e,auth.uid()) THEN RAISE EXCEPTION 'Somente administradores podem gerenciar usuários'; END IF;
  PERFORM 1 FROM empresas WHERE id=e FOR UPDATE;
  IF p_ativo=false AND EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=p_usuario AND ativo AND papel='administrador') AND
    (SELECT count(*) FROM membros_empresa WHERE empresa_id=e AND ativo AND papel='administrador')<=1 THEN RAISE EXCEPTION 'Mantenha pelo menos um administrador ativo'; END IF;
  UPDATE membros_empresa SET ativo=coalesce(p_ativo,ativo),nome=coalesce(nullif(trim(p_nome),''),nome) WHERE empresa_id=e AND usuario_id=p_usuario;
  INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(e,auth.uid(),'membro',jsonb_build_object('usuario',p_usuario,'ativo',p_ativo));
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('usuarioId',m.usuario_id,'nome',m.nome,'email',u.email,'ativo',m.ativo,'papel',m.papel) ORDER BY m.nome),'[]') FROM membros_empresa m JOIN auth.users u ON u.id=m.usuario_id WHERE m.empresa_id=e);
END $$;

CREATE FUNCTION public.gdo_papel_membro(p_usuario uuid,p_papel text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF p_papel NOT IN ('administrador','membro') OR NOT central.administrador(e,auth.uid()) THEN RAISE EXCEPTION 'Você não pode alterar este papel'; END IF;
 PERFORM 1 FROM empresas WHERE id=e FOR UPDATE;
 IF p_papel='membro' AND EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=p_usuario AND ativo AND papel='administrador') AND
   (SELECT count(*) FROM membros_empresa WHERE empresa_id=e AND ativo AND papel='administrador')<=1 THEN RAISE EXCEPTION 'Mantenha pelo menos um administrador ativo'; END IF;
 UPDATE membros_empresa SET papel=p_papel WHERE empresa_id=e AND usuario_id=p_usuario;
 INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(e,auth.uid(),'papel_membro',jsonb_build_object('usuario',p_usuario,'papel',p_papel));
END $$;

-- Esta RPC só pode ser chamada pela função de servidor após validar o JWT.
CREATE FUNCTION public.gdo_preparar_convite(p_ator uuid,p_id uuid,p_empresa uuid,p_empresa_nome text,p_email text,p_nome text,p_papel text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=p_empresa; c central.convites;
BEGIN
 IF p_papel NOT IN ('administrador','membro') OR length(trim(p_nome)) NOT BETWEEN 1 AND 120 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Confira nome, e-mail e papel'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO c FROM central.convites WHERE id=p_id;
 IF FOUND THEN
  IF c.criado_por<>p_ator OR c.email<>lower(trim(p_email)) OR c.cancelado_em IS NOT NULL OR c.aceito_em IS NOT NULL OR c.expira_em<now() THEN RAISE EXCEPTION 'Convite indisponível'; END IF;
  e:=c.empresa_id;
 ELSE
  IF e IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_ator) THEN RAISE EXCEPTION 'Somente o operador pode criar empresas'; END IF;
   IF length(trim(p_empresa_nome)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Informe o nome da empresa'; END IF;
   e:=gen_random_uuid();
   INSERT INTO empresas(id,nome) VALUES(e,trim(p_empresa_nome));
   INSERT INTO migracoes_numeracao(empresa_id) VALUES(e);
   p_papel:='administrador';
  ELSIF NOT central.administrador(e,p_ator) THEN RAISE EXCEPTION 'Somente administradores podem convidar pessoas';
  END IF;
  INSERT INTO central.convites(id,empresa_id,email,nome,papel,criado_por) VALUES(p_id,e,lower(trim(p_email)),trim(p_nome),p_papel,p_ator);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=p_ator) AND NOT central.administrador(e,p_ator) THEN RAISE EXCEPTION 'Seu acesso foi revogado'; END IF;
 IF c.ultimo_envio>now()-interval '60 seconds' THEN RAISE EXCEPTION 'Aguarde um minuto antes de reenviar'; END IF;
 UPDATE central.convites SET ultimo_envio=now() WHERE id=p_id;
 INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(e,p_ator,'convite_preparado',jsonb_build_object('convite',p_id));
 RETURN jsonb_build_object('id',p_id,'empresaId',e,'email',lower(trim(p_email)));
END $$;
CREATE TABLE central.limites_email(email text PRIMARY KEY,janela timestamptz NOT NULL,ultimo timestamptz NOT NULL,total integer NOT NULL);
ALTER TABLE central.limites_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON central.limites_email FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.gdo_autorizar_codigo(p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lim central.limites_email; email_normalizado text:=lower(trim(p_email));
BEGIN
 IF length(email_normalizado)>254 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM central.convites WHERE email=email_normalizado AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em>now()) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(email_normalizado,1));
 SELECT * INTO lim FROM central.limites_email WHERE email=email_normalizado;
 IF FOUND AND (lim.ultimo>now()-interval '60 seconds' OR (lim.janela>now()-interval '1 hour' AND lim.total>=5)) THEN RETURN false; END IF;
 INSERT INTO central.limites_email VALUES(email_normalizado,now(),now(),1) ON CONFLICT(email) DO UPDATE SET
 janela=CASE WHEN central.limites_email.janela<now()-interval '1 hour' THEN now() ELSE central.limites_email.janela END,
 ultimo=now(),total=CASE WHEN central.limites_email.janela<now()-interval '1 hour' THEN 1 ELSE central.limites_email.total+1 END;
 RETURN true;
END $$;
CREATE FUNCTION public.gdo_convites_operador(p_empresa uuid DEFAULT NULL,p_cancelar uuid DEFAULT NULL) RETURNS jsonb
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
CREATE FUNCTION public.gdo_aceitar_convites() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c central.convites; email_usuario text;
BEGIN
 SELECT lower(email) INTO email_usuario FROM auth.users WHERE id=auth.uid();
 IF email_usuario IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 FOR c IN SELECT * FROM central.convites WHERE email=email_usuario AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em>now() FOR UPDATE LOOP
  INSERT INTO membros_empresa(empresa_id,usuario_id,nome,ativo,papel) VALUES(c.empresa_id,auth.uid(),c.nome,true,c.papel)
   ON CONFLICT(empresa_id,usuario_id) DO NOTHING;
  UPDATE central.convites SET aceito_em=now() WHERE id=c.id;
  INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(c.empresa_id,auth.uid(),'convite_aceito',jsonb_build_object('convite',c.id));
 END LOOP;
 RETURN gdo_contas();
END $$;
ALTER FUNCTION public.gdo_batch_v3(jsonb,uuid) SET SCHEMA central;
CREATE FUNCTION public.gdo_batch_v3(p_operacoes jsonb,p_dispositivo uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 IF NOT central.administrador(e,auth.uid()) AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_operacoes) x WHERE x->'payload'->>'tabela' IN ('configuracoes','observacoes_padrao','pagamentos_padrao')) THEN
  RAISE EXCEPTION 'Somente administradores podem alterar a configuração da empresa';
 END IF;
 RETURN central.gdo_batch_v3(p_operacoes,p_dispositivo);
END $$;
REVOKE ALL ON FUNCTION public.gdo_batch_v3(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_batch_v3(jsonb,uuid) TO authenticated;
ALTER FUNCTION public.gdo_numeracao_v3(text,integer) SET SCHEMA central;
CREATE FUNCTION public.gdo_numeracao_v3(p_tipo text,p_proximo integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_proximo IS NOT NULL AND NOT central.administrador(gdo_empresa(),auth.uid()) THEN
  RAISE EXCEPTION 'Somente administradores podem alterar a numeração da empresa';
 END IF;
 RETURN central.gdo_numeracao_v3(p_tipo,p_proximo);
END $$;
REVOKE ALL ON FUNCTION public.gdo_numeracao_v3(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_numeracao_v3(text,integer) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA central FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION gdo_preparar_convite(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION gdo_preparar_convite(uuid,uuid,uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION gdo_autorizar_codigo(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION gdo_autorizar_codigo(text) TO service_role;
REVOKE ALL ON FUNCTION gdo_convites_operador(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION gdo_convites_operador(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION gdo_contas(),gdo_contexto_v4(uuid),gdo_meu_nome(text),gdo_papel_membro(uuid,text),gdo_aceitar_convites() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION gdo_contas(),gdo_contexto_v4(uuid),gdo_meu_nome(text),gdo_papel_membro(uuid,text),gdo_aceitar_convites() TO authenticated;
-- Instalação central exige convite, inclusive para o primeiro membro.
REVOKE ALL ON FUNCTION gdo_contexto_v2(boolean),gdo_contexto_v3(boolean) FROM PUBLIC,anon,authenticated;
COMMIT;
