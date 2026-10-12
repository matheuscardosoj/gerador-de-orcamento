-- Instalação e migração transacional. Mantém as rotas da versão 1.4.0.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gdo-esquema-relacional-v2',0));
CREATE SCHEMA IF NOT EXISTS sincronizacao;
CREATE SEQUENCE IF NOT EXISTS public.gdo_changes;
DO $mover$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='gdo_entities' AND c.relkind='r') THEN
    ALTER TABLE public.gdo_entities SET SCHEMA sincronizacao;
    ALTER TABLE sincronizacao.gdo_entities RENAME TO legado_em_migracao;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='gdo_operations' AND c.relkind='r') THEN
    ALTER TABLE public.gdo_operations SET SCHEMA sincronizacao;
    ALTER TABLE sincronizacao.gdo_operations RENAME TO operacoes;
    ALTER TABLE sincronizacao.operacoes RENAME COLUMN usuario TO empresa_id;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='gdo_devices' AND c.relkind='r') THEN
    ALTER TABLE public.gdo_devices RENAME TO computadores;
    ALTER TABLE public.computadores RENAME COLUMN usuario TO empresa_id;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='gdo_numbers' AND c.relkind='r') THEN
    ALTER TABLE public.gdo_numbers RENAME TO reservas_numeros;
    ALTER TABLE public.reservas_numeros RENAME COLUMN usuario TO empresa_id;
  END IF;
END $mover$;
CREATE TABLE IF NOT EXISTS public.computadores(empresa_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,nome text NOT NULL,PRIMARY KEY(empresa_id,id));
CREATE TABLE IF NOT EXISTS public.reservas_numeros(empresa_id uuid NOT NULL REFERENCES auth.users(id),tipo text NOT NULL,numero integer NOT NULL CHECK(numero BETWEEN 1 AND 999999),dispositivo uuid NOT NULL,documento text,PRIMARY KEY(empresa_id,tipo,numero));
CREATE TABLE IF NOT EXISTS sincronizacao.operacoes(empresa_id uuid NOT NULL REFERENCES auth.users(id),id uuid NOT NULL,entidade text NOT NULL,revisao bigint NOT NULL,PRIMARY KEY(empresa_id,id));
CREATE TABLE IF NOT EXISTS sincronizacao.entidades(empresa_id uuid NOT NULL REFERENCES auth.users(id),entidade text NOT NULL,revisao bigint NOT NULL,sequencia bigint NOT NULL,excluido boolean NOT NULL,PRIMARY KEY(empresa_id,entidade));
CREATE INDEX IF NOT EXISTS idx_entidades_sequencia ON sincronizacao.entidades(empresa_id,sequencia);
CREATE TABLE IF NOT EXISTS public.documentos(empresa_id uuid NOT NULL REFERENCES auth.users(id),tipo text NOT NULL CHECK(tipo IN ('orcamento','relatorio','recibo')),documento_id text NOT NULL,excluido boolean NOT NULL,responsavel uuid NOT NULL,dados jsonb NOT NULL,PRIMARY KEY(empresa_id,tipo,documento_id));
__TABELAS__
CREATE TABLE IF NOT EXISTS public.imagens_versoes(empresa_id uuid NOT NULL,versao_id text NOT NULL,imagem_hash text NOT NULL,PRIMARY KEY(empresa_id,versao_id,imagem_hash));
CREATE UNIQUE INDEX IF NOT EXISTS idx_versao_vinculo ON public.versoes_documentos(empresa_id,tipo,documento_id,id);
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS tipo_documento text GENERATED ALWAYS AS ('orcamento'::text) STORED;
ALTER TABLE public.relatorios ADD COLUMN IF NOT EXISTS tipo_documento text GENERATED ALWAYS AS ('relatorio'::text) STORED;
ALTER TABLE public.relatorios ADD COLUMN IF NOT EXISTS origem_tipo text GENERATED ALWAYS AS ('orcamento'::text) STORED;
ALTER TABLE public.recibos ADD COLUMN IF NOT EXISTS tipo_documento text GENERATED ALWAYS AS ('recibo'::text) STORED;
ALTER TABLE public.recebimentos ADD COLUMN IF NOT EXISTS recibo_tipo text GENERATED ALWAYS AS ('recibo'::text) STORED;
ALTER TABLE public.recebimentos ADD COLUMN IF NOT EXISTS relatorio_tipo text GENERATED ALWAYS AS ('relatorio'::text) STORED;

-- Todos os vínculos incluem a empresa; nunca relacionam registros de duas contas.
DO $vinculos$
DECLARE x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES
    ('documentos','fk_documentos_computador','FOREIGN KEY(empresa_id,responsavel) REFERENCES computadores(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('reservas_numeros','fk_reserva_computador','FOREIGN KEY(empresa_id,dispositivo) REFERENCES computadores(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('orcamentos','fk_orcamento_cliente','FOREIGN KEY(empresa_id,cliente_id) REFERENCES clientes(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('relatorios','fk_relatorio_cliente','FOREIGN KEY(empresa_id,cliente_id) REFERENCES clientes(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('recibos','fk_recibo_cliente','FOREIGN KEY(empresa_id,cliente_id) REFERENCES clientes(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('orcamentos','fk_orcamento_documento','FOREIGN KEY(empresa_id,tipo_documento,id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('relatorios','fk_relatorio_documento','FOREIGN KEY(empresa_id,tipo_documento,id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('relatorios','fk_relatorio_origem','FOREIGN KEY(empresa_id,origem_tipo,origem_orcamento_id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('recibos','fk_recibo_documento','FOREIGN KEY(empresa_id,tipo_documento,id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('recibos','fk_recibo_origem','FOREIGN KEY(empresa_id,origem_tipo,origem_id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('recebimentos','fk_recebimento_recibo','FOREIGN KEY(empresa_id,recibo_tipo,recibo_id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('recebimentos','fk_recebimento_relatorio','FOREIGN KEY(empresa_id,relatorio_tipo,relatorio_id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('itens_orcamento','fk_item_orcamento','FOREIGN KEY(empresa_id,orcamento_id) REFERENCES orcamentos(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('materiais_orcamento','fk_material_orcamento','FOREIGN KEY(empresa_id,orcamento_id) REFERENCES orcamentos(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('textos_orcamento','fk_texto_orcamento','FOREIGN KEY(empresa_id,orcamento_id) REFERENCES orcamentos(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('anexos_orcamento','fk_anexo_orcamento','FOREIGN KEY(empresa_id,orcamento_id) REFERENCES orcamentos(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('anexos_orcamento','fk_anexo_item','FOREIGN KEY(empresa_id,orcamento_id,item_servico_id) REFERENCES itens_orcamento(empresa_id,orcamento_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('anexos_orcamento','fk_anexo_imagem','FOREIGN KEY(empresa_id,imagem) REFERENCES imagens(empresa_id,hash) DEFERRABLE INITIALLY DEFERRED'),
    ('itens_relatorio','fk_item_relatorio','FOREIGN KEY(empresa_id,relatorio_id) REFERENCES relatorios(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('lancamentos_relatorio','fk_lancamento_relatorio','FOREIGN KEY(empresa_id,relatorio_id) REFERENCES relatorios(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('textos_relatorio','fk_texto_relatorio','FOREIGN KEY(empresa_id,relatorio_id) REFERENCES relatorios(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('anexos_relatorio','fk_anexo_relatorio','FOREIGN KEY(empresa_id,relatorio_id) REFERENCES relatorios(empresa_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
    ('anexos_relatorio','fk_anexo_relatorio_imagem','FOREIGN KEY(empresa_id,imagem) REFERENCES imagens(empresa_id,hash) DEFERRABLE INITIALLY DEFERRED'),
    ('versoes_documentos','fk_versao_documento','FOREIGN KEY(empresa_id,tipo,documento_id) REFERENCES documentos(empresa_id,tipo,documento_id) DEFERRABLE INITIALLY DEFERRED'),
    ('versoes_documentos','fk_versao_anterior','FOREIGN KEY(empresa_id,tipo,documento_id,anterior_id) REFERENCES versoes_documentos(empresa_id,tipo,documento_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('imagens_versoes','fk_imagem_versao','FOREIGN KEY(empresa_id,versao_id) REFERENCES versoes_documentos(empresa_id,id) DEFERRABLE INITIALLY DEFERRED'),
    ('imagens_versoes','fk_imagem_historica','FOREIGN KEY(empresa_id,imagem_hash) REFERENCES imagens(empresa_id,hash) DEFERRABLE INITIALLY DEFERRED')
  ) v(tabela,nome,definicao) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=('public.'||x.tabela)::regclass AND conname=x.nome) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s',x.tabela,x.nome,x.definicao);
    END IF;
  END LOOP;
END $vinculos$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_numero ON public.orcamentos(empresa_id,numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relatorio_numero ON public.relatorios(empresa_id,numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recibo_numero ON public.recibos(empresa_id,numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versao_numero ON public.versoes_documentos(empresa_id,tipo,documento_id,numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recebimento_recibo ON public.recebimentos(empresa_id,recibo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recebimento_adiantamento ON public.recebimentos(empresa_id,relatorio_id,adiantamento_id) WHERE adiantamento_id IS NOT NULL AND estornado=0;
DO $regras$
DECLARE x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES
    ('clientes','cliente_nome','nome IS NOT NULL AND length(btrim(nome))>0'),
    ('clientes','cliente_tipo','tipo_pessoa IS NULL OR tipo_pessoa IN (''pf'',''pj'')'),
    ('clientes','cliente_ativo','ativo IN (0,1)'),
    ('orcamentos','orcamento_estado','status IN (''rascunho'',''enviado'',''aprovado'',''recusado'')'),
    ('recibos','recibo_estado','status IS NOT NULL AND status IN (''rascunho'',''pendente'',''recebido'',''cancelado'')'),
    ('recibos','recibo_valor','valor IS NOT NULL AND valor>=0 AND valor<>''NaN''::numeric'),
    ('recibos','recibo_quitacao','quitacao IS NOT NULL AND quitacao IN (''parcial'',''total'')'),
    ('recibos','recibo_origem','origem_id IS NULL OR (origem_tipo IS NOT NULL AND origem_tipo IN (''orcamento'',''relatorio''))'),
    ('imagens','imagem_tamanho','bytes IS NOT NULL AND bytes=octet_length(decode(base64,''base64'')) AND largura>=0 AND altura>=0'),
    ('imagens','imagem_integridade','bytes>0 AND mime IN (''image/jpeg'',''image/png'') AND hash=encode(sha256(decode(base64,''base64'')),''hex'')'),
    ('recebimentos','recebimento_valor','valor IS NOT NULL AND valor>=0 AND valor<>''NaN''::numeric AND estornado IN (0,1)'),
    ('lancamentos_relatorio','lancamento_tipo','tipo IN (''adiantamento'',''reembolso'')'),
    ('configuracoes_empresa','configuracao_compartilhavel','chave IN (''empresa'',''parametros'',''camposClientePadrao'')')
  ) v(tabela,nome,regra) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=('public.'||x.tabela)::regclass AND conname=x.nome) THEN EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK(%s)',x.tabela,x.nome,x.regra); END IF;
  END LOOP;
END $regras$;

CREATE OR REPLACE FUNCTION sincronizacao.recompor_json(p_row jsonb,p_map jsonb,p_keys text[],p_extra jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_extra,'{}'::jsonb)||coalesce((SELECT jsonb_object_agg(k.key,CASE WHEN k.value LIKE '%:boolean' THEN to_jsonb((p_row->>split_part(k.value,':',1))::integer=1) ELSE p_row->k.value END) FROM jsonb_each_text(p_map) k WHERE k.key=ANY(p_keys)),'{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION sincronizacao.escrever_linha(p_empresa uuid,p_tabela text,p_row jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE d jsonb; antigo jsonb; ref text;
BEGIN
  IF jsonb_typeof(p_row)<>'object' THEN RAISE EXCEPTION 'Linha de dados inválida'; END IF;
  IF p_tabela='versoes' THEN
    SELECT (to_jsonb(v)-'empresa_id') INTO antigo FROM versoes_documentos v WHERE empresa_id=p_empresa AND id=p_row->>'id';
    IF FOUND AND antigo IS DISTINCT FROM ((p_row-'documento')||jsonb_build_object('documento',(p_row->>'documento')::jsonb)) THEN RAISE EXCEPTION 'Uma versão já registrada não pode ser alterada'; END IF;
  END IF;
  CASE p_tabela
  __ENTRADA__
  ELSE RAISE EXCEPTION 'Tabela não compartilhável'; END CASE;
  IF p_tabela='versoes' THEN
    d:=(p_row->>'documento')::jsonb;
    FOR ref IN SELECT DISTINCT a->>'imagemHash' FROM jsonb_array_elements(coalesce(d->'anexos','[]'::jsonb)) a WHERE a->>'imagemHash' IS NOT NULL
      UNION SELECT d->'empresaSnapshot'->>'logoHash' WHERE d->'empresaSnapshot'->>'logoHash' IS NOT NULL
    LOOP INSERT INTO imagens_versoes VALUES(p_empresa,p_row->>'id',ref) ON CONFLICT DO NOTHING; END LOOP;
  END IF;
END $$;

-- Normaliza somente os campos serializados do protocolo; mantém os snapshots e
-- a ordem interna dos serviços/fotos. A ordem externa é dada pelas colunas ordem.
CREATE OR REPLACE FUNCTION sincronizacao.semantico(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE resultado jsonb:=p; tabela text; dados jsonb; linha jsonb; novo jsonb; k text; serializados text[]; arr jsonb;
BEGIN
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
  ELSIF p ? 'row' THEN
    k:=CASE p->>'tabela' WHEN 'clientes' THEN 'dados_json' WHEN 'configuracoes' THEN 'valor' ELSE NULL END;
    IF k IS NOT NULL AND jsonb_typeof(p->'row'->k)='string' THEN resultado:=jsonb_set(resultado,ARRAY['row',k],(p->'row'->>k)::jsonb); END IF;
  END IF;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION sincronizacao.validar_financeiro() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE u uuid:=coalesce(NEW.empresa_id,OLD.empresa_id);
BEGIN
  IF EXISTS(SELECT 1 FROM recebimentos p LEFT JOIN recibos r ON r.empresa_id=p.empresa_id AND r.id=p.recibo_id
    WHERE p.empresa_id=u AND p.estornado=0 AND (r.id IS NULL OR r.status<>'recebido' OR r.valor<>p.valor OR
      (p.relatorio_id IS NOT NULL AND (r.origem_tipo IS DISTINCT FROM 'relatorio' OR r.origem_id IS DISTINCT FROM p.relatorio_id OR
        NOT EXISTS(SELECT 1 FROM lancamentos_relatorio l WHERE l.empresa_id=u AND l.relatorio_id=p.relatorio_id AND l.id=p.adiantamento_id AND l.tipo='adiantamento' AND l.valor=p.valor))))) THEN RAISE EXCEPTION 'Recibo, recebimento e adiantamento devem ser confirmados juntos'; END IF;
  IF EXISTS(SELECT 1 FROM recibos r WHERE r.empresa_id=u AND r.status='recebido' AND NOT EXISTS(SELECT 1 FROM recebimentos p WHERE p.empresa_id=u AND p.recibo_id=r.id AND p.estornado=0)) THEN RAISE EXCEPTION 'Recibo recebido sem lançamento financeiro'; END IF;
  IF EXISTS(SELECT 1 FROM relatorios r WHERE r.empresa_id=u AND (r.total_servicos IS DISTINCT FROM coalesce((SELECT round(sum(i.valor_total),2) FROM itens_relatorio i WHERE i.empresa_id=u AND i.relatorio_id=r.id),0) OR r.total_adiantamentos IS DISTINCT FROM coalesce((SELECT round(sum(l.valor),2) FROM lancamentos_relatorio l WHERE l.empresa_id=u AND l.relatorio_id=r.id AND l.tipo='adiantamento'),0) OR r.total_reembolsos IS DISTINCT FROM coalesce((SELECT round(sum(l.valor),2) FROM lancamentos_relatorio l WHERE l.empresa_id=u AND l.relatorio_id=r.id AND l.tipo='reembolso'),0) OR r.saldo IS DISTINCT FROM round(r.total_servicos-r.total_adiantamentos+r.total_reembolsos,2))) THEN RAISE EXCEPTION 'Saldo ou totais do relatório divergentes dos lançamentos'; END IF;
  RETURN NULL;
END $$;
DO $financeiro$
DECLARE t text;
BEGIN FOREACH t IN ARRAY ARRAY['recibos','recebimentos','relatorios','itens_relatorio','lancamentos_relatorio'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS validar_financeiro ON public.%I',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER validar_financeiro AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sincronizacao.validar_financeiro()',t);
END LOOP; END $financeiro$;
CREATE OR REPLACE FUNCTION sincronizacao.linhas(p_empresa uuid,p_tabela text,p_id text,p_tipo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN CASE p_tabela
  __SAIDA__
  WHEN 'documento_meta' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',r.tipo,'documento_id',r.documento_id,'dados',r.dados::text)),'[]'::jsonb) INTO resultado FROM documentos r WHERE r.empresa_id=p_empresa AND r.tipo=p_tipo AND r.documento_id=p_id;
  ELSE RAISE EXCEPTION 'Tabela não compartilhável'; END CASE; RETURN resultado;
END $$;
CREATE OR REPLACE FUNCTION sincronizacao.payload(p_empresa uuid,p_entidade text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE t text:=split_part(p_entidade,':',1); id_doc text:=substr(p_entidade,length(t)+2); principal text; filhos text[]; filho text; rows jsonb; d public.documentos; e boolean;
BEGIN
  SELECT excluido INTO e FROM sincronizacao.entidades WHERE empresa_id=p_empresa AND entidade=p_entidade;
  IF t NOT IN ('orcamento','relatorio','recibo') THEN
    IF e THEN RETURN jsonb_build_object('tabela',t,'id',id_doc); END IF;
    RETURN jsonb_build_object('tabela',t,'id',id_doc,'row',sincronizacao.linhas(p_empresa,t,id_doc)->0);
  END IF;
  SELECT * INTO d FROM public.documentos WHERE empresa_id=p_empresa AND tipo=t AND documento_id=id_doc;
  principal:=CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END;
  filhos:=CASE t WHEN 'orcamento' THEN ARRAY['itens_servico','materiais','orcamento_textos','anexos'] WHEN 'relatorio' THEN ARRAY['relatorio_itens_servico','relatorio_lancamentos','relatorio_textos','relatorio_anexos'] ELSE ARRAY[]::text[] END;
  rows:=jsonb_build_object(principal,sincronizacao.linhas(p_empresa,principal,id_doc));
  FOREACH filho IN ARRAY filhos LOOP rows:=rows||jsonb_build_object(filho,sincronizacao.linhas(p_empresa,filho,id_doc)); END LOOP;
  rows:=rows||jsonb_build_object('documento_meta',sincronizacao.linhas(p_empresa,'documento_meta',id_doc,t),'versoes',sincronizacao.linhas(p_empresa,'versoes',id_doc,t));
  IF t='recibo' THEN rows:=rows||jsonb_build_object('recebimentos',sincronizacao.linhas(p_empresa,'recebimentos',id_doc)); END IF;
  RETURN jsonb_build_object('tipo',t,'id',id_doc,'excluido',d.excluido,'responsavel',d.responsavel::text,'rows',rows);
END $$;
CREATE OR REPLACE FUNCTION sincronizacao.materializar(p_empresa uuid,p_entidade text,p_payload jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE t text:=split_part(p_entidade,':',1); id_doc text:=substr(p_entidade,length(t)+2); principal text; filho text; filhos text[]; nome text; linha jsonb; meta jsonb; removido boolean;
BEGIN
  IF t NOT IN ('orcamento','relatorio','recibo') THEN
    IF t NOT IN ('clientes','servicos','observacoes_padrao','pagamentos_padrao','configuracoes','imagens') OR p_payload->>'tabela' IS DISTINCT FROM t OR p_payload->>'id' IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Cadastro inválido'; END IF;
    IF t='configuracoes' AND id_doc NOT IN ('empresa','parametros','camposClientePadrao') THEN RAISE EXCEPTION 'Configuração local não pode ser publicada'; END IF;
    IF p_payload ? 'row' AND p_payload->'row'<>'null'::jsonb THEN
      IF coalesce(p_payload->'row'->>'id',p_payload->'row'->>'hash',p_payload->'row'->>'chave') IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Identificação de cadastro divergente'; END IF;
      PERFORM sincronizacao.escrever_linha(p_empresa,t,p_payload->'row');
    ELSE
      nome:=CASE t WHEN 'pagamentos_padrao' THEN 'formas_pagamento_padrao' WHEN 'configuracoes' THEN 'configuracoes_empresa' ELSE t END;
      EXECUTE format('DELETE FROM public.%I WHERE empresa_id=$1 AND %I=$2',nome,CASE t WHEN 'imagens' THEN 'hash' WHEN 'configuracoes' THEN 'chave' ELSE 'id' END) USING p_empresa,id_doc;
    END IF; RETURN;
  END IF;
  IF p_payload->>'tipo' IS DISTINCT FROM t OR p_payload->>'id' IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Documento inválido'; END IF;
  removido:=coalesce((p_payload->>'excluido')::boolean,false); meta:=(p_payload->'rows'->'documento_meta'->0->>'dados')::jsonb;
  IF meta IS NULL OR (meta->>'computadorResponsavel')::uuid IS DISTINCT FROM (p_payload->>'responsavel')::uuid OR
     p_payload->'rows'->'documento_meta'->0->>'tipo' IS DISTINCT FROM t OR p_payload->'rows'->'documento_meta'->0->>'documento_id' IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Metadados de documento inválidos'; END IF;
  INSERT INTO documentos VALUES(p_empresa,t,id_doc,removido,(p_payload->>'responsavel')::uuid,meta) ON CONFLICT(empresa_id,tipo,documento_id) DO UPDATE SET excluido=excluded.excluido,responsavel=excluded.responsavel,dados=excluded.dados;
  principal:=CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END;
  filhos:=CASE t WHEN 'orcamento' THEN ARRAY['itens_orcamento','materiais_orcamento','textos_orcamento','anexos_orcamento'] WHEN 'relatorio' THEN ARRAY['itens_relatorio','lancamentos_relatorio','textos_relatorio','anexos_relatorio'] ELSE ARRAY[]::text[] END;
  FOREACH filho IN ARRAY filhos LOOP EXECUTE format('DELETE FROM public.%I WHERE empresa_id=$1 AND %I=$2',filho,t||'_id') USING p_empresa,id_doc; END LOOP;
  IF removido THEN EXECUTE format('DELETE FROM public.%I WHERE empresa_id=$1 AND id=$2',principal) USING p_empresa,id_doc;
  ELSE
    IF p_payload->'rows'->principal->0->>'id' IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Identificação de documento divergente'; END IF;
    PERFORM sincronizacao.escrever_linha(p_empresa,principal,p_payload->'rows'->principal->0);
    filhos:=CASE t WHEN 'orcamento' THEN ARRAY['itens_servico','materiais','orcamento_textos','anexos'] WHEN 'relatorio' THEN ARRAY['relatorio_itens_servico','relatorio_lancamentos','relatorio_textos','relatorio_anexos'] ELSE ARRAY[]::text[] END;
    FOREACH filho IN ARRAY filhos LOOP FOR linha IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'rows'->filho,'[]'::jsonb)) LOOP
      IF linha->>(t||'_id') IS DISTINCT FROM id_doc THEN RAISE EXCEPTION 'Item pertence a outro documento'; END IF;
      PERFORM sincronizacao.escrever_linha(p_empresa,filho,linha);
    END LOOP; END LOOP;
  END IF;
  FOR nome IN SELECT unnest(CASE t WHEN 'recibo' THEN ARRAY['versoes','recebimentos'] ELSE ARRAY['versoes'] END) LOOP
    FOR linha IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'rows'->nome,'[]'::jsonb)) LOOP
      IF (nome='versoes' AND (linha->>'tipo' IS DISTINCT FROM t OR linha->>'documento_id' IS DISTINCT FROM id_doc)) OR (nome='recebimentos' AND linha->>'recibo_id' IS DISTINCT FROM id_doc) THEN RAISE EXCEPTION 'Histórico ou recebimento pertence a outro documento'; END IF;
      PERFORM sincronizacao.escrever_linha(p_empresa,nome,linha);
    END LOOP;
  END LOOP;
END $$;

-- Consulta de transporte compatível, calculada; não armazena outra cópia dos dados.
CREATE OR REPLACE VIEW public.gdo_entities WITH (security_invoker=true) AS SELECT empresa_id AS usuario,entidade,revisao,sincronizacao.payload(empresa_id,entidade) AS payload,sequencia FROM sincronizacao.entidades;
CREATE OR REPLACE VIEW public.gdo_devices WITH (security_invoker=true) AS SELECT empresa_id AS usuario,id,nome FROM public.computadores;
CREATE OR REPLACE VIEW public.gdo_numbers WITH (security_invoker=true) AS SELECT empresa_id AS usuario,tipo,numero,dispositivo,documento FROM public.reservas_numeros;
CREATE OR REPLACE VIEW public.gdo_operations WITH (security_invoker=true) AS SELECT empresa_id AS usuario,id,entidade,revisao FROM sincronizacao.operacoes;

CREATE OR REPLACE FUNCTION public.gdo_apply(p_id uuid,p_entidade text,p_base bigint,p_payload jsonb,p_dispositivo uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE u uuid:=auth.uid(); atual record; r bigint; n bigint; t text; doc text; dono uuid;
BEGIN
  IF u IS NULL OR p_dispositivo IS NULL OR NOT EXISTS(SELECT 1 FROM computadores WHERE empresa_id=u AND id=p_dispositivo) THEN RAISE EXCEPTION 'Login e dispositivo registrados necessários'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
  SELECT revisao INTO r FROM sincronizacao.operacoes WHERE empresa_id=u AND id=p_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'revisao',r); END IF;
  SELECT * INTO atual FROM gdo_entities WHERE usuario=u AND entidade=p_entidade;
  IF coalesce(atual.revisao,0)<>p_base THEN RETURN jsonb_build_object('ok',false,'remoto',to_jsonb(atual)); END IF;
  t:=split_part(p_entidade,':',1);doc:=substr(p_entidade,length(t)+2);
  IF t IN ('orcamento','relatorio','recibo') THEN
    dono:=(atual.payload->>'responsavel')::uuid;
    IF dono IS NOT NULL AND dono<>p_dispositivo THEN RAISE EXCEPTION 'Documento pertence a outro computador'; END IF;
    IF (p_payload->>'responsavel')::uuid IS DISTINCT FROM p_dispositivo THEN RAISE EXCEPTION 'Responsabilidade inválida'; END IF;
    IF NOT coalesce((p_payload->>'excluido')::boolean,false) THEN
      n:=(p_payload->'rows'->(CASE t WHEN 'orcamento' THEN 'orcamentos' WHEN 'relatorio' THEN 'relatorios' ELSE 'recibos' END)->0->>'numero')::bigint;
      IF n>0 THEN UPDATE reservas_numeros SET documento=doc WHERE empresa_id=u AND tipo=t AND numero=n AND dispositivo=p_dispositivo AND (documento IS NULL OR documento=doc);IF NOT FOUND THEN RAISE EXCEPTION 'Numero nao reservado por este computador'; END IF; END IF;
    END IF;
  END IF;
  PERFORM sincronizacao.materializar(u,p_entidade,p_payload);r:=p_base+1;
  INSERT INTO sincronizacao.entidades VALUES(u,p_entidade,r,nextval('gdo_changes'),CASE WHEN t IN ('orcamento','relatorio','recibo') THEN coalesce((p_payload->>'excluido')::boolean,false) ELSE NOT(p_payload?'row') OR p_payload->'row'='null'::jsonb END) ON CONFLICT(empresa_id,entidade) DO UPDATE SET revisao=excluded.revisao,sequencia=excluded.sequencia,excluido=excluded.excluido;
  IF sincronizacao.semantico(p_payload) IS DISTINCT FROM sincronizacao.semantico(sincronizacao.payload(u,p_entidade)) THEN RAISE EXCEPTION 'Campos incompatíveis com o esquema da nuvem. Atualize a configuração do banco; nenhuma alteração foi aplicada'; END IF;
  INSERT INTO sincronizacao.operacoes VALUES(u,p_id,p_entidade,r);
  RETURN jsonb_build_object('ok',true,'revisao',r);
END $$;
CREATE OR REPLACE FUNCTION public.gdo_device(p_dispositivo uuid,p_nome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login necessario'; END IF;INSERT INTO computadores VALUES(auth.uid(),p_dispositivo,left(p_nome,100)) ON CONFLICT(empresa_id,id) DO UPDATE SET nome=excluded.nome; END $$;
CREATE OR REPLACE FUNCTION public.gdo_bootstrap_numbers(p_dispositivo uuid,p_numeros jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE u uuid:=auth.uid();x jsonb;
BEGIN IF u IS NULL THEN RAISE EXCEPTION 'Login necessario'; END IF;PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));IF EXISTS(SELECT 1 FROM sincronizacao.entidades WHERE empresa_id=u) THEN RAISE EXCEPTION 'A nuvem ja possui dados; conecte baixando a base'; END IF;FOR x IN SELECT * FROM jsonb_array_elements(p_numeros) LOOP INSERT INTO reservas_numeros VALUES(u,x->>'tipo',(x->>'numero')::integer,p_dispositivo,NULL) ON CONFLICT DO NOTHING;END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.gdo_reserve(p_tipo text,p_dispositivo uuid,p_minimo integer DEFAULT 0) RETURNS SETOF integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();n integer;inicio integer;
BEGIN IF u IS NULL OR p_tipo NOT IN ('orcamento','relatorio','recibo') OR NOT EXISTS(SELECT 1 FROM computadores WHERE empresa_id=u AND id=p_dispositivo) THEN RAISE EXCEPTION 'Reserva inválida'; END IF;PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));SELECT greatest(coalesce(max(numero),0),p_minimo)+1 INTO inicio FROM reservas_numeros WHERE empresa_id=u AND tipo=p_tipo;IF inicio+19>999999 THEN RAISE EXCEPTION 'Limite de numeracao atingido';END IF;FOR n IN inicio..inicio+19 LOOP INSERT INTO reservas_numeros VALUES(u,p_tipo,n,p_dispositivo,NULL);RETURN NEXT n;END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.gdo_transfer(p_entidade text,p_origem uuid,p_destino uuid,p_revisao bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE u uuid:=auth.uid();e record;t text;id_doc text;
BEGIN IF u IS NULL OR p_origem IS NULL OR p_destino IS NULL THEN RAISE EXCEPTION 'Login e dispositivos necessarios';END IF;PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));SELECT * INTO e FROM gdo_entities WHERE usuario=u AND entidade=p_entidade;IF NOT FOUND OR e.revisao IS DISTINCT FROM p_revisao OR (e.payload->>'responsavel')::uuid IS DISTINCT FROM p_origem THEN RAISE EXCEPTION 'Sincronize antes de transferir';END IF;IF NOT EXISTS(SELECT 1 FROM computadores WHERE empresa_id=u AND id=p_destino) THEN RAISE EXCEPTION 'Computador de destino desconhecido';END IF;t:=split_part(p_entidade,':',1);id_doc:=substr(p_entidade,length(t)+2);UPDATE documentos SET responsavel=p_destino,dados=jsonb_set(dados,'{computadorResponsavel}',to_jsonb(p_destino::text)) WHERE empresa_id=u AND tipo=t AND documento_id=id_doc;UPDATE reservas_numeros SET dispositivo=p_destino WHERE empresa_id=u AND tipo=t AND documento=id_doc;UPDATE sincronizacao.entidades SET revisao=revisao+1,sequencia=nextval('gdo_changes') WHERE empresa_id=u AND entidade=p_entidade;END $$;
CREATE OR REPLACE FUNCTION public.gdo_batch(p_operacoes jsonb,p_dispositivo uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x jsonb;r jsonb;resultados jsonb:='[]'::jsonb;
BEGIN BEGIN FOR x IN SELECT * FROM jsonb_array_elements(p_operacoes) LOOP r:=gdo_apply((x->>'id')::uuid,x->>'entidade',(x->>'base')::bigint,x->'payload',p_dispositivo);IF NOT(r->>'ok')::boolean THEN r:=r||jsonb_build_object('entidade',x->>'entidade');RAISE no_data_found;END IF;resultados:=resultados||jsonb_build_array(jsonb_build_object('entidade',x->>'entidade','revisao',r->'revisao'));END LOOP;EXCEPTION WHEN no_data_found THEN RETURN r;END;RETURN jsonb_build_object('ok',true,'resultados',resultados);END $$;
CREATE OR REPLACE FUNCTION public.gdo_usage() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login necessario';END IF;RETURN pg_database_size(current_database());END $$;

-- Migra a fonte anterior mantendo as mesmas revisões/sequências e todas as versões.
DO $migrar$
DECLARE e record;
BEGIN
  IF to_regclass('sincronizacao.legado_em_migracao') IS NOT NULL THEN
    FOR e IN SELECT * FROM sincronizacao.legado_em_migracao ORDER BY CASE split_part(entidade,':',1) WHEN 'imagens' THEN 0 WHEN 'clientes' THEN 1 WHEN 'orcamento' THEN 3 WHEN 'relatorio' THEN 4 WHEN 'recibo' THEN 5 ELSE 2 END LOOP
      PERFORM sincronizacao.materializar(e.usuario,e.entidade,e.payload);
      INSERT INTO sincronizacao.entidades VALUES(e.usuario,e.entidade,e.revisao,e.sequencia,CASE WHEN split_part(e.entidade,':',1) IN ('orcamento','relatorio','recibo') THEN coalesce((e.payload->>'excluido')::boolean,false) ELSE NOT(e.payload?'row') OR e.payload->'row'='null'::jsonb END);
    END LOOP;
    FOR e IN SELECT * FROM sincronizacao.legado_em_migracao LOOP
      IF sincronizacao.semantico(e.payload) IS DISTINCT FROM sincronizacao.semantico(sincronizacao.payload(e.usuario,e.entidade)) THEN RAISE EXCEPTION 'A migração alteraria o conteúdo de %. Nenhum dado foi substituído',e.entidade; END IF;
    END LOOP;
  END IF;
END $migrar$;
SET CONSTRAINTS ALL IMMEDIATE;

-- RLS e permissões são aplicadas também às tabelas usadas pela consulta compatível.
DO $permissoes$
DECLARE nome text;schema_nome text;
BEGIN
  FOR nome IN SELECT unnest(ARRAY[__NOMES__,'computadores','reservas_numeros','entidades','operacoes']) LOOP
    schema_nome:=CASE WHEN nome IN ('entidades','operacoes') THEN 'sincronizacao' ELSE 'public' END;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',schema_nome,nome);
    EXECUTE format('DROP POLICY IF EXISTS empresa_leitura ON %I.%I',schema_nome,nome);
    EXECUTE format('CREATE POLICY empresa_leitura ON %I.%I FOR SELECT TO authenticated USING(empresa_id=auth.uid())',schema_nome,nome);
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon,authenticated',schema_nome,nome);
    EXECUTE format('GRANT SELECT ON %I.%I TO authenticated',schema_nome,nome);
  END LOOP;
END $permissoes$;
GRANT USAGE ON SCHEMA sincronizacao TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sincronizacao FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sincronizacao.payload(uuid,text),sincronizacao.linhas(uuid,text,text,text),sincronizacao.recompor_json(jsonb,jsonb,text[],jsonb) TO authenticated;
REVOKE ALL ON public.gdo_entities,public.gdo_devices,public.gdo_numbers,public.gdo_operations FROM anon,authenticated;
GRANT SELECT ON public.gdo_entities,public.gdo_devices TO authenticated;
REVOKE ALL ON FUNCTION public.gdo_apply(uuid,text,bigint,jsonb,uuid),public.gdo_device(uuid,text),public.gdo_bootstrap_numbers(uuid,jsonb),public.gdo_reserve(text,uuid,integer),public.gdo_transfer(text,uuid,uuid,bigint),public.gdo_batch(jsonb,uuid),public.gdo_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdo_apply(uuid,text,bigint,jsonb,uuid),public.gdo_device(uuid,text),public.gdo_bootstrap_numbers(uuid,jsonb),public.gdo_reserve(text,uuid,integer),public.gdo_transfer(text,uuid,uuid,bigint),public.gdo_batch(jsonb,uuid),public.gdo_usage() TO authenticated;
DROP FUNCTION IF EXISTS public.gdo_correct_initial_migration_20261012(jsonb,jsonb);
DROP TABLE IF EXISTS sincronizacao.legado_em_migracao;
NOTIFY pgrst,'reload schema';
COMMIT;
