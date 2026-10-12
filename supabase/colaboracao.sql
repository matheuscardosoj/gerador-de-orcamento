-- Camada de colaboração. Executada dentro da transação do esquema completo.
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY, nome text NOT NULL DEFAULT 'Empresa', criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.membros_empresa (
  empresa_id uuid NOT NULL REFERENCES empresas(id), usuario_id uuid NOT NULL REFERENCES auth.users(id),
  nome text NOT NULL, ativo boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(empresa_id,usuario_id)
);
INSERT INTO empresas(id) SELECT DISTINCT empresa_id FROM sincronizacao.entidades
  UNION SELECT DISTINCT empresa_id FROM computadores ON CONFLICT DO NOTHING;
INSERT INTO membros_empresa(empresa_id,usuario_id,nome)
  SELECT e.id,e.id,'Responsável inicial' FROM empresas e JOIN auth.users a ON a.id=e.id ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION sincronizacao.membro(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=p_empresa AND usuario_id=auth.uid() AND ativo);
$$;
CREATE OR REPLACE FUNCTION public.gdo_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid; n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na conta da empresa'; END IF;
  SELECT count(*),min(empresa_id::text)::uuid INTO n,e FROM membros_empresa WHERE usuario_id=auth.uid() AND ativo;
  IF n=0 THEN RAISE EXCEPTION 'Sua conta não está vinculada a esta empresa. Solicite acesso a um membro ativo'; END IF;
  IF n>1 THEN RAISE EXCEPTION 'Use um projeto separado para cada empresa'; END IF;
  RETURN e;
END $$;

-- O identificador da empresa continua sendo o mesmo da migração, mas passa a
-- referenciar a empresa em vez de depender da permanência do primeiro login.
DO $empresas_fk$
DECLARE c record;
BEGIN
  FOR c IN SELECT n.nspname,t.relname,k.conname FROM pg_constraint k
    JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE k.contype='f' AND k.confrelid='auth.users'::regclass
      AND n.nspname IN ('public','sincronizacao')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=ANY(k.conkey) AND a.attname='empresa_id')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',c.nspname,c.relname,c.conname);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) DEFERRABLE INITIALLY DEFERRED',c.nspname,c.relname,c.conname);
  END LOOP;
END $empresas_fk$;

CREATE TABLE IF NOT EXISTS public.identificadores_documento (
  empresa_id uuid NOT NULL REFERENCES empresas(id), tipo text NOT NULL, documento_id text NOT NULL,
  id_interno bigint NOT NULL CHECK(id_interno>0), usuario_criador uuid, alterado_por uuid,
  PRIMARY KEY(empresa_id,tipo,documento_id), UNIQUE(empresa_id,tipo,id_interno),
  FOREIGN KEY(empresa_id,tipo,documento_id) REFERENCES documentos(empresa_id,tipo,documento_id)
);
CREATE TABLE IF NOT EXISTS sincronizacao.contadores_internos (
  empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,proximo bigint NOT NULL,
  PRIMARY KEY(empresa_id,tipo)
);
CREATE TABLE IF NOT EXISTS public.dispositivos_usuarios (
  empresa_id uuid NOT NULL,dispositivo uuid NOT NULL,usuario_id uuid NOT NULL REFERENCES auth.users(id),
  visto_em timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(empresa_id,dispositivo),
  FOREIGN KEY(empresa_id,dispositivo) REFERENCES computadores(empresa_id,id)
);
CREATE TABLE IF NOT EXISTS public.edicoes_documento (
  empresa_id uuid NOT NULL,tipo text NOT NULL,documento_id text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES auth.users(id),dispositivo uuid NOT NULL,
  geracao bigint NOT NULL CHECK(geracao>0),expira_em timestamptz,offline boolean NOT NULL DEFAULT false,
  revisao bigint NOT NULL,PRIMARY KEY(empresa_id,tipo,documento_id),
  FOREIGN KEY(empresa_id,tipo,documento_id) REFERENCES documentos(empresa_id,tipo,documento_id),
  FOREIGN KEY(empresa_id,dispositivo) REFERENCES computadores(empresa_id,id)
);
CREATE TABLE IF NOT EXISTS public.auditoria_colaboracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES empresas(id),
  criado_em timestamptz NOT NULL DEFAULT now(),usuario_id uuid,dispositivo uuid,
  acao text NOT NULL,entidade text,dados jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS public.numeros_emitidos (
  empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,documento_id text NOT NULL,
  numero bigint NOT NULL,criado_em timestamptz NOT NULL DEFAULT now(),usuario_id uuid,dispositivo uuid,
  PRIMARY KEY(empresa_id,tipo,documento_id),FOREIGN KEY(empresa_id,tipo,documento_id) REFERENCES documentos(empresa_id,tipo,documento_id)
);
CREATE TABLE IF NOT EXISTS public.pedidos_edicao (
  empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,documento_id text NOT NULL,
  usuario_id uuid NOT NULL,dispositivo uuid NOT NULL,criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(empresa_id,tipo,documento_id,usuario_id,dispositivo),
  FOREIGN KEY(empresa_id,tipo,documento_id) REFERENCES documentos(empresa_id,tipo,documento_id)
);
INSERT INTO numeros_emitidos(empresa_id,tipo,documento_id,numero)
 SELECT empresa_id,'orcamento',id,numero FROM orcamentos WHERE status<>'rascunho'
 UNION ALL SELECT empresa_id,'relatorio',id,numero FROM relatorios WHERE status<>'rascunho'
 UNION ALL SELECT empresa_id,'recibo',id,numero FROM recibos WHERE status<>'rascunho'
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS sincronizacao.sequencias_documentos (
  empresa_id uuid NOT NULL REFERENCES empresas(id),tipo text NOT NULL,proximo integer NOT NULL CHECK(proximo BETWEEN 1 AND 999999),
  PRIMARY KEY(empresa_id,tipo)
);

-- Só os documentos ativos da base inicial recebem a sequência organizada.
DO $ids_iniciais$
DECLARE e record;
BEGIN
  FOR e IN SELECT DISTINCT empresa_id,tipo FROM documentos WHERE NOT excluido LOOP
    IF NOT EXISTS(SELECT 1 FROM identificadores_documento WHERE empresa_id=e.empresa_id AND tipo=e.tipo) THEN
      INSERT INTO identificadores_documento(empresa_id,tipo,documento_id,id_interno,usuario_criador,alterado_por)
      SELECT e.empresa_id,e.tipo,id,row_number() OVER(ORDER BY data,criado,numero,id),NULL,NULL FROM (
        SELECT o.id,o.data::text AS data,o.criado_em AS criado,o.numero FROM orcamentos o WHERE e.tipo='orcamento' AND o.empresa_id=e.empresa_id
        UNION ALL SELECT r.id,r.data::text,r.criado_em,r.numero FROM relatorios r WHERE e.tipo='relatorio' AND r.empresa_id=e.empresa_id
        UNION ALL SELECT r.id,r.data::text,r.criado_em,r.numero FROM recibos r WHERE e.tipo='recibo' AND r.empresa_id=e.empresa_id
      ) a;
    END IF;
  END LOOP;
  INSERT INTO sincronizacao.contadores_internos SELECT empresa_id,tipo,max(id_interno)+1 FROM identificadores_documento GROUP BY empresa_id,tipo ON CONFLICT DO NOTHING;
END $ids_iniciais$;

-- Adapta as operações financeiras e de materialização já testadas ao contexto
-- da empresa. Somente as entradas v2 abaixo podem chamá-las para escrita.
DO $protocolo$
DECLARE n text; d text;
BEGIN
  FOREACH n IN ARRAY ARRAY['gdo_apply','gdo_device','gdo_bootstrap_numbers','gdo_reserve','gdo_transfer','gdo_usage','gdo_batch'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=n;
    d:=replace(d,'auth.uid()','public.gdo_empresa()');
    IF n='gdo_apply' THEN
      d:=replace(d,'IF dono IS NOT NULL AND dono<>p_dispositivo THEN RAISE EXCEPTION ''Documento pertence a outro computador''; END IF;','');
      d:=replace(d,'AND dispositivo=p_dispositivo AND (documento IS NULL OR documento=doc)','AND ((dispositivo=p_dispositivo AND documento IS NULL) OR documento=doc)');
      IF strpos(d,'gdo.protocolo')=0 THEN
        d:=replace(d,'BEGIN'||chr(10),'BEGIN'||chr(10)||'IF current_setting(''gdo.protocolo'',true) IS DISTINCT FROM ''2'' THEN RAISE EXCEPTION ''Atualize o aplicativo para o protocolo 2''; END IF;'||chr(10));
      END IF;
    END IF;
    EXECUTE d;
  END LOOP;
END $protocolo$;

CREATE OR REPLACE FUNCTION public.gdo_contexto_v2(p_criar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na conta'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gdo-empresas',0));
  IF p_criar AND NOT EXISTS(SELECT 1 FROM empresas) THEN
    INSERT INTO empresas(id) VALUES(auth.uid());
    INSERT INTO membros_empresa VALUES(auth.uid(),auth.uid(),'Responsável inicial',true,now());
  END IF;
  e:=gdo_empresa();
  RETURN jsonb_build_object('protocolo',2,'empresaId',e,'usuarioId',auth.uid(),'usuarioNome',(SELECT nome FROM membros_empresa WHERE empresa_id=e AND usuario_id=auth.uid()));
END $$;
CREATE OR REPLACE FUNCTION public.gdo_dispositivo_v2(p_dispositivo uuid,p_nome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
  IF EXISTS(SELECT 1 FROM dispositivos_usuarios WHERE empresa_id=e AND dispositivo=p_dispositivo AND usuario_id<>auth.uid()) THEN RAISE EXCEPTION 'Este identificador de dispositivo está associado a outro usuário'; END IF;
  PERFORM gdo_device(p_dispositivo,p_nome);
  INSERT INTO dispositivos_usuarios VALUES(e,p_dispositivo,auth.uid(),now()) ON CONFLICT(empresa_id,dispositivo) DO UPDATE SET visto_em=now();
END $$;
CREATE OR REPLACE FUNCTION sincronizacao.exigir_dispositivo(e uuid,p uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dispositivos_usuarios WHERE empresa_id=e AND dispositivo=p AND usuario_id=auth.uid()) THEN RAISE EXCEPTION 'Registre o computador para este usuário'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.gdo_membros_v2(p_usuario uuid DEFAULT NULL,p_email text DEFAULT NULL,p_nome text DEFAULT NULL,p_ativo boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); u uuid:=p_usuario;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
  IF p_email IS NOT NULL THEN
    SELECT id INTO u FROM auth.users WHERE lower(email)=lower(trim(p_email));
    IF u IS NULL THEN RAISE EXCEPTION 'Crie e confirme esta conta em Authentication antes de vincular'; END IF;
    IF EXISTS(SELECT 1 FROM membros_empresa WHERE usuario_id=u AND empresa_id<>e AND ativo) THEN RAISE EXCEPTION 'Esta conta já está vinculada a outro projeto de empresa'; END IF;
    INSERT INTO membros_empresa VALUES(e,u,coalesce(nullif(trim(p_nome),''),trim(p_email)),true,now()) ON CONFLICT(empresa_id,usuario_id) DO UPDATE SET ativo=true,nome=excluded.nome;
  ELSIF u IS NOT NULL AND p_ativo IS NOT NULL THEN
    IF NOT p_ativo AND (SELECT count(*) FROM membros_empresa WHERE empresa_id=e AND ativo)<=1 AND EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=u AND ativo) THEN RAISE EXCEPTION 'Não é possível retirar o último membro ativo'; END IF;
    UPDATE membros_empresa SET ativo=p_ativo WHERE empresa_id=e AND usuario_id=u;
    IF NOT FOUND THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
  END IF;
  IF u IS NOT NULL THEN INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(e,auth.uid(),'membro',jsonb_build_object('usuario',u,'ativo',coalesce(p_ativo,true))); END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('usuarioId',m.usuario_id,'nome',m.nome,'email',a.email,'ativo',m.ativo) ORDER BY m.nome),'[]') FROM membros_empresa m JOIN auth.users a ON a.id=m.usuario_id WHERE m.empresa_id=e);
END $$;

-- Um relatório e seus recibos compartilham a autorização financeira offline.
CREATE OR REPLACE FUNCTION sincronizacao.conjunto_financeiro(p_empresa uuid,p_tipo text,p_id text) RETURNS TABLE(tipo text,documento_id text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH origem AS (SELECT CASE WHEN p_tipo='relatorio' THEN p_id ELSE
    (SELECT origem_id FROM recibos WHERE empresa_id=p_empresa AND id=p_id AND origem_tipo='relatorio') END AS id)
  SELECT p_tipo,p_id UNION
  SELECT 'relatorio',id FROM origem WHERE id IS NOT NULL UNION
  SELECT 'recibo',r.id FROM recibos r,origem o WHERE r.empresa_id=p_empresa AND r.origem_tipo='relatorio' AND r.origem_id=o.id;
$$;
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
      IF u IS NULL OR NOT EXISTS(SELECT 1 FROM membros_empresa WHERE empresa_id=e AND usuario_id=u AND ativo) THEN RAISE EXCEPTION 'Destino não registrado ou membro inativo'; END IF;
      UPDATE edicoes_documento SET usuario_id=u,dispositivo=p_destino,geracao=geracao+1,expira_em=CASE WHEN offline THEN NULL ELSE now()+interval '120 seconds' END WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
    END IF;
    IF l.offline AND p_acao IN ('liberar','transferir') THEN
      UPDATE edicoes_documento a SET usuario_id=CASE WHEN p_acao='transferir' THEN u ELSE a.usuario_id END,
        dispositivo=CASE WHEN p_acao='transferir' THEN p_destino ELSE a.dispositivo END,
        geracao=a.geracao+1,offline=p_acao='transferir',expira_em=CASE WHEN p_acao='transferir' THEN NULL ELSE now() END
      FROM sincronizacao.conjunto_financeiro(e,p_tipo,p_id) c
      WHERE a.empresa_id=e AND a.tipo=c.tipo AND a.documento_id=c.documento_id AND NOT (a.tipo=p_tipo AND a.documento_id=p_id);
    END IF;
  ELSIF p_acao='solicitar' THEN
    INSERT INTO pedidos_edicao VALUES(e,p_tipo,p_id,auth.uid(),p_dispositivo,now())
      ON CONFLICT(empresa_id,tipo,documento_id,usuario_id,dispositivo) DO UPDATE SET criado_em=excluded.criado_em;
  ELSIF p_acao<>'obter' THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  IF p_acao IN ('liberar','transferir','recuperar') THEN DELETE FROM pedidos_edicao WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id; END IF;
  IF p_acao NOT IN ('obter','renovar') THEN INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,dispositivo,acao,entidade,dados) VALUES(e,auth.uid(),p_dispositivo,p_acao,p_tipo||':'||p_id,jsonb_build_object('destino',p_destino)); END IF;
  SELECT * INTO l FROM edicoes_documento WHERE empresa_id=e AND tipo=p_tipo AND documento_id=p_id;
  IF l.geracao IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tipo',p_tipo,'documentoId',p_id,'usuarioId',l.usuario_id,'usuarioNome',(SELECT nome FROM membros_empresa WHERE empresa_id=e AND usuario_id=l.usuario_id),'computador',l.dispositivo,'geracao',l.geracao,'expiraEm',l.expira_em,'offline',l.offline,'revisao',r,'podeEditar',l.usuario_id=auth.uid() AND l.dispositivo=p_dispositivo AND (l.offline OR l.expira_em>now()),
    'solicitacoes',(SELECT coalesce(jsonb_agg(jsonb_build_object('usuarioNome',m.nome,'computador',p.dispositivo,'criadoEm',p.criado_em) ORDER BY p.criado_em),'[]') FROM pedidos_edicao p JOIN membros_empresa m ON m.empresa_id=p.empresa_id AND m.usuario_id=p.usuario_id WHERE p.empresa_id=e AND p.tipo=p_tipo AND p.documento_id=p_id AND m.ativo));
END $$;

CREATE OR REPLACE FUNCTION public.gdo_alteracoes_v2(p_cursor bigint DEFAULT 0,p_limite integer DEFAULT 50) RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
  SELECT to_jsonb(e)||jsonb_build_object('identificador',to_jsonb(i),'controle',to_jsonb(l),'emissao',(SELECT to_jsonb(m) FROM numeros_emitidos m WHERE m.empresa_id=e.usuario AND m.tipo=split_part(e.entidade,':',1) AND m.documento_id=substr(e.entidade,length(m.tipo)+2))) FROM public.gdo_entities e
  LEFT JOIN public.identificadores_documento i ON i.empresa_id=e.usuario AND i.tipo=split_part(e.entidade,':',1) AND i.documento_id=substr(e.entidade,length(i.tipo)+2)
  LEFT JOIN public.edicoes_documento l ON l.empresa_id=e.usuario AND l.tipo=split_part(e.entidade,':',1) AND l.documento_id=substr(e.entidade,length(l.tipo)+2)
  WHERE e.usuario=public.gdo_empresa() AND e.sequencia>p_cursor ORDER BY e.sequencia LIMIT least(greatest(p_limite,1),100);
$$;
CREATE OR REPLACE FUNCTION public.gdo_batch_v2(p_operacoes jsonb,p_dispositivo uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); x jsonb; t text; id_doc text; l public.edicoes_documento%rowtype; r jsonb; n bigint; novas text[]:='{}'; d jsonb; pagamento jsonb; origem text;
BEGIN
  PERFORM sincronizacao.exigir_dispositivo(e,p_dispositivo);
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
  PERFORM set_config('gdo.protocolo','2',true);
  FOR x IN SELECT * FROM jsonb_array_elements(p_operacoes) LOOP
    IF EXISTS(SELECT 1 FROM sincronizacao.operacoes WHERE empresa_id=e AND id=(x->>'id')::uuid) THEN CONTINUE; END IF;
    novas:=array_append(novas,x->>'id');
    t:=split_part(x->>'entidade',':',1); id_doc:=substr(x->>'entidade',length(t)+2);
    IF t IN ('orcamento','relatorio','recibo') AND NOT coalesce((x->'payload'->>'excluido')::boolean,false) THEN
      n:=(x->'payload'->'rows'->(CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END)->0->>'numero')::bigint;
      IF EXISTS(SELECT 1 FROM numeros_emitidos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc AND numero<>n) THEN
        RAISE EXCEPTION 'Número de documento emitido protegido; crie um novo rascunho'; END IF;
      IF x->'payload'->'emissao' IS NOT NULL AND x->'payload'->'emissao'<>'null'::jsonb AND (n<=0 OR n IS DISTINCT FROM (x->'payload'->'emissao'->>'numero')::bigint) THEN
        RAISE EXCEPTION 'Emissão com número divergente'; END IF;
    END IF;
    IF t IN ('relatorio','recibo') THEN
      IF EXISTS(SELECT 1 FROM edicoes_documento a JOIN sincronizacao.conjunto_financeiro(e,t,id_doc) c USING(tipo,documento_id)
        WHERE a.empresa_id=e AND a.offline AND (a.usuario_id<>auth.uid() OR a.dispositivo<>p_dispositivo)) THEN
        RAISE EXCEPTION 'Conjunto financeiro reservado offline em outro usuário/computador'; END IF;
    END IF;
    IF t='recibo' THEN
      d:=(x->'payload'->'rows'->'recibos'->0->>'dados')::jsonb;
      origem:=CASE WHEN d->>'origemTipo'='relatorio' THEN d->>'origemId' ELSE NULL END;
      IF origem IS NOT NULL AND EXISTS(SELECT 1 FROM edicoes_documento a JOIN sincronizacao.conjunto_financeiro(e,'relatorio',origem) c USING(tipo,documento_id)
        WHERE a.empresa_id=e AND a.offline AND (a.usuario_id<>auth.uid() OR a.dispositivo<>p_dispositivo)) THEN
        RAISE EXCEPTION 'Relatório de origem reservado offline em outro usuário/computador'; END IF;
      IF EXISTS(SELECT 1 FROM recibos WHERE empresa_id=e AND id=id_doc AND (
          (status='cancelado' AND d->>'status' IS DISTINCT FROM 'cancelado' AND NOT coalesce((x->'payload'->>'excluido')::boolean,false)) OR
          (status='recebido' AND d->>'status' NOT IN ('recebido','cancelado')))) THEN
        RAISE EXCEPTION 'Recebimentos e estornos não podem ser desfeitos por uma versão textual'; END IF;
      FOR pagamento IN SELECT * FROM jsonb_array_elements(coalesce(x->'payload'->'rows'->'recebimentos','[]')) LOOP
        IF EXISTS(SELECT 1 FROM recebimentos p WHERE p.empresa_id=e AND p.id=pagamento->>'id' AND
          (p.estornado>(pagamento->>'estornado')::integer OR p.valor IS DISTINCT FROM (pagamento->>'valor')::numeric OR
           p.relatorio_id IS DISTINCT FROM pagamento->>'relatorio_id' OR p.adiantamento_id IS DISTINCT FROM pagamento->>'adiantamento_id')) THEN
          RAISE EXCEPTION 'Um lançamento financeiro existente não pode ser reescrito'; END IF;
        origem:=pagamento->>'relatorio_id';
        IF origem IS NOT NULL AND NOT EXISTS(SELECT 1 FROM recebimentos p WHERE p.empresa_id=e AND p.id=pagamento->>'id' AND to_jsonb(p)-ARRAY['empresa_id','recibo_tipo','relatorio_tipo']=pagamento) THEN
          SELECT * INTO l FROM edicoes_documento WHERE empresa_id=e AND tipo='relatorio' AND documento_id=origem;
          IF l.usuario_id IS DISTINCT FROM auth.uid() OR l.dispositivo IS DISTINCT FROM p_dispositivo OR
            (NOT l.offline AND (l.expira_em IS NULL OR l.expira_em<=now())) THEN
            RAISE EXCEPTION 'Autorize o relatório antes de confirmar ou estornar o recebimento'; END IF;
        END IF;
      END LOOP;
    END IF;
    IF t IN ('orcamento','relatorio','recibo') AND EXISTS(SELECT 1 FROM documentos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc) THEN
      SELECT * INTO l FROM edicoes_documento WHERE empresa_id=e AND tipo=t AND documento_id=id_doc;
      IF l.geracao IS NULL OR l.usuario_id<>auth.uid() OR l.dispositivo<>p_dispositivo OR
        (l.geracao IS DISTINCT FROM (x->>'geracao')::bigint AND NOT (x->>'geracao' IS NULL AND l.geracao=1 AND EXISTS(SELECT 1 FROM identificadores_documento WHERE empresa_id=e AND tipo=t AND documento_id=id_doc AND usuario_criador=auth.uid()))) OR
        (NOT l.offline AND l.expira_em<=now()) THEN RAISE EXCEPTION 'Autorização de edição expirada ou revogada; preserve o rascunho e solicite edição'; END IF;
    END IF;
  END LOOP;
  r:=gdo_batch((SELECT jsonb_agg(jsonb_set(op.item,'{payload}',(op.item->'payload')-'emissao')) FROM jsonb_array_elements(p_operacoes) AS op(item)),p_dispositivo);
  IF NOT (r->>'ok')::boolean THEN RETURN r; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_operacoes) LOOP
    IF NOT (x->>'id'=ANY(novas)) THEN CONTINUE; END IF;
    t:=split_part(x->>'entidade',':',1); id_doc:=substr(x->>'entidade',length(t)+2);
    IF t IN ('orcamento','relatorio','recibo') AND EXISTS(SELECT 1 FROM documentos WHERE empresa_id=e AND tipo=t AND documento_id=id_doc AND NOT excluido) THEN
      IF NOT EXISTS(SELECT 1 FROM identificadores_documento WHERE empresa_id=e AND tipo=t AND documento_id=id_doc) THEN
        INSERT INTO sincronizacao.contadores_internos VALUES(e,t,1) ON CONFLICT DO NOTHING;
        UPDATE sincronizacao.contadores_internos SET proximo=proximo+1 WHERE empresa_id=e AND tipo=t RETURNING proximo-1 INTO n;
        INSERT INTO identificadores_documento VALUES(e,t,id_doc,n,auth.uid(),auth.uid());
      ELSE UPDATE identificadores_documento SET alterado_por=auth.uid() WHERE empresa_id=e AND tipo=t AND documento_id=id_doc; END IF;
      INSERT INTO edicoes_documento VALUES(e,t,id_doc,auth.uid(),p_dispositivo,1,now()+interval '120 seconds',false,(SELECT revisao FROM sincronizacao.entidades WHERE empresa_id=e AND entidade=x->>'entidade')) ON CONFLICT DO NOTHING;
      IF (x->'payload'->'emissao' IS NOT NULL AND x->'payload'->'emissao'<>'null'::jsonb) OR
        EXISTS(SELECT 1 FROM orcamentos WHERE empresa_id=e AND id=id_doc AND t='orcamento' AND status<>'rascunho') OR
        EXISTS(SELECT 1 FROM relatorios WHERE empresa_id=e AND id=id_doc AND t='relatorio' AND status<>'rascunho') OR
        EXISTS(SELECT 1 FROM recibos WHERE empresa_id=e AND id=id_doc AND t='recibo' AND status<>'rascunho') THEN
        n:=(x->'payload'->'rows'->(CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END)->0->>'numero')::bigint;
        INSERT INTO numeros_emitidos VALUES(e,t,id_doc,n,now(),auth.uid(),p_dispositivo) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,dispositivo,acao,entidade,dados) SELECT e,auth.uid(),p_dispositivo,'salvar',x->>'entidade',jsonb_build_object('operacao',x->>'id','base',x->'base') WHERE NOT EXISTS(SELECT 1 FROM auditoria_colaboracao WHERE empresa_id=e AND dados->>'operacao'=x->>'id');
  END LOOP;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.gdo_reserve_v2(p_tipo text,p_dispositivo uuid,p_minimo integer DEFAULT 0) RETURNS SETOF integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); inicio integer;
BEGIN
  PERFORM sincronizacao.exigir_dispositivo(e,p_dispositivo);
  SELECT proximo INTO inicio FROM sincronizacao.sequencias_documentos WHERE empresa_id=e AND tipo=p_tipo;
  RETURN QUERY SELECT * FROM gdo_reserve(p_tipo,p_dispositivo,greatest(p_minimo,coalesce(inicio,1)-1));
END $$;
CREATE OR REPLACE FUNCTION public.gdo_bootstrap_v2(p_dispositivo uuid,p_numeros jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM sincronizacao.exigir_dispositivo(gdo_empresa(),p_dispositivo); PERFORM gdo_bootstrap_numbers(p_dispositivo,p_numeros); END $$;
CREATE OR REPLACE FUNCTION public.gdo_numeracao_v2(p_tipo text,p_proximo integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid:=gdo_empresa(); minimo integer; proximo integer;
BEGIN
  IF p_tipo NOT IN ('orcamento','relatorio','recibo') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
  SELECT coalesce(max(numero),0)+1 INTO minimo FROM reservas_numeros WHERE empresa_id=e AND tipo=p_tipo;
  IF p_proximo IS NOT NULL THEN
    IF p_proximo<minimo OR p_proximo>999999 THEN RAISE EXCEPTION 'Escolha um número entre % e 999999; números usados ou reservados não são reutilizados',minimo; END IF;
    INSERT INTO sincronizacao.sequencias_documentos VALUES(e,p_tipo,p_proximo) ON CONFLICT(empresa_id,tipo) DO UPDATE SET proximo=excluded.proximo;
    INSERT INTO auditoria_colaboracao(empresa_id,usuario_id,acao,dados) VALUES(e,auth.uid(),'numeracao',jsonb_build_object('tipo',p_tipo,'proximo',p_proximo));
  END IF;
  SELECT greatest(minimo,coalesce((SELECT s.proximo FROM sincronizacao.sequencias_documentos s WHERE s.empresa_id=e AND s.tipo=p_tipo),minimo)) INTO proximo;
  RETURN jsonb_build_object('proximoNumero',proximo,'minimo',minimo);
END $$;

DO $politicas_v2$
DECLARE n record;
BEGIN
  FOR n IN SELECT table_schema,table_name FROM information_schema.columns WHERE column_name='empresa_id' AND table_schema IN ('public','sincronizacao') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',n.table_schema,n.table_name);
    EXECUTE format('DROP POLICY IF EXISTS empresa_leitura ON %I.%I',n.table_schema,n.table_name);
    EXECUTE format('CREATE POLICY empresa_leitura ON %I.%I FOR SELECT TO authenticated USING(sincronizacao.membro(empresa_id))',n.table_schema,n.table_name);
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon,authenticated',n.table_schema,n.table_name);
    EXECUTE format('GRANT SELECT ON %I.%I TO authenticated',n.table_schema,n.table_name);
  END LOOP;
  ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS empresa_leitura ON empresas;
  CREATE POLICY empresa_leitura ON empresas FOR SELECT TO authenticated USING(sincronizacao.membro(id));
  REVOKE ALL ON empresas FROM anon,authenticated;
  GRANT SELECT ON empresas TO authenticated;
END $politicas_v2$;
CREATE OR REPLACE FUNCTION sincronizacao.avisar_realtime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE e uuid;
BEGIN
  e:=NEW.empresa_id;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    PERFORM realtime.send(jsonb_build_object('alterado',true),'alteracao','empresa:'||e::text,true);
  END IF;
  RETURN NEW;
END $$;
DO $notificar$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['sincronizacao.entidades','public.edicoes_documento','public.membros_empresa','public.auditoria_colaboracao'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS gdo_realtime ON %s',n);
    EXECUTE format('CREATE TRIGGER gdo_realtime AFTER INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sincronizacao.avisar_realtime()',n);
  END LOOP;
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS gdo_realtime_leitura ON realtime.messages';
    EXECUTE 'CREATE POLICY gdo_realtime_leitura ON realtime.messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.membros_empresa m WHERE m.usuario_id=auth.uid() AND m.ativo AND realtime.topic()=''empresa:''||m.empresa_id::text))';
  END IF;
END $notificar$;
REVOKE ALL ON FUNCTION public.gdo_apply(uuid,text,bigint,jsonb,uuid),public.gdo_batch(jsonb,uuid),public.gdo_device(uuid,text),public.gdo_reserve(text,uuid,integer),public.gdo_transfer(text,uuid,uuid,bigint),public.gdo_bootstrap_numbers(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sincronizacao FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sincronizacao.membro(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gdo_empresa(),public.gdo_contexto_v2(boolean),public.gdo_dispositivo_v2(uuid,text),public.gdo_membros_v2(uuid,text,text,boolean),public.gdo_edicao_v2(text,text,uuid,text,bigint,uuid),public.gdo_alteracoes_v2(bigint,integer),public.gdo_batch_v2(jsonb,uuid),public.gdo_reserve_v2(text,uuid,integer),public.gdo_bootstrap_v2(uuid,jsonb),public.gdo_numeracao_v2(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_empresa(),public.gdo_contexto_v2(boolean),public.gdo_dispositivo_v2(uuid,text),public.gdo_membros_v2(uuid,text,text,boolean),public.gdo_edicao_v2(text,text,uuid,text,bigint,uuid),public.gdo_alteracoes_v2(bigint,integer),public.gdo_batch_v2(jsonb,uuid),public.gdo_reserve_v2(text,uuid,integer),public.gdo_bootstrap_v2(uuid,jsonb),public.gdo_numeracao_v2(text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.gdo_documento_v2(p_tipo text,p_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
  SELECT to_jsonb(e)||jsonb_build_object('identificador',to_jsonb(i),'controle',to_jsonb(l),'emissao',(SELECT to_jsonb(m) FROM numeros_emitidos m WHERE m.empresa_id=e.usuario AND m.tipo=split_part(e.entidade,':',1) AND m.documento_id=substr(e.entidade,length(m.tipo)+2))) FROM public.gdo_entities e
  LEFT JOIN public.identificadores_documento i ON i.empresa_id=e.usuario AND i.tipo=p_tipo AND i.documento_id=p_id
  LEFT JOIN public.edicoes_documento l ON l.empresa_id=e.usuario AND l.tipo=p_tipo AND l.documento_id=p_id
  WHERE e.usuario=public.gdo_empresa() AND e.entidade=p_tipo||':'||p_id;
$$;
REVOKE ALL ON FUNCTION public.gdo_documento_v2(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_documento_v2(text,text) TO authenticated;
