-- Protocolo 2: fixture de regressão.
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
CREATE TABLE IF NOT EXISTS public.servicos (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, nome text, descricao_padrao text, unidade text, preco_referencia numeric, ordem integer, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.observacoes_padrao (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, texto text, padrao integer, ordem integer, aplicacao text, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.formas_pagamento_padrao (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, texto text, padrao integer, ordem integer, aplicacao text, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.configuracoes_empresa (empresa_id uuid NOT NULL REFERENCES auth.users(id), chave text NOT NULL, valor jsonb, PRIMARY KEY (empresa_id,chave));
CREATE TABLE IF NOT EXISTS public.imagens (empresa_id uuid NOT NULL REFERENCES auth.users(id), hash text NOT NULL, mime text, base64 text, miniatura_base64 text, bytes integer, largura integer, altura integer, PRIMARY KEY (empresa_id,hash));
CREATE TABLE IF NOT EXISTS public.orcamentos (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, numero bigint, data date, cliente_id text, destinatario text, formato text, titulo text, introducao text, prazo_dias integer, observacao_interna text, valor_total numeric, status text, criado_em text, atualizado_em text, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.itens_orcamento (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, orcamento_id text NOT NULL, ordem integer, servico_id text, descricao text, unidade text, quantidade numeric, valor_unitario numeric, valor_total numeric, calculo_json jsonb, PRIMARY KEY (empresa_id,orcamento_id,id));
CREATE TABLE IF NOT EXISTS public.materiais_orcamento (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, orcamento_id text NOT NULL, ordem integer, quantidade numeric, unidade text, especificacao text, PRIMARY KEY (empresa_id,orcamento_id,id));
CREATE TABLE IF NOT EXISTS public.textos_orcamento (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, orcamento_id text NOT NULL, tipo text, ordem integer, texto text, origem_padrao_id text, PRIMARY KEY (empresa_id,orcamento_id,id));
CREATE TABLE IF NOT EXISTS public.anexos_orcamento (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, orcamento_id text NOT NULL, item_servico_id text, ordem integer, titulo text, descricao text, mime text, largura integer, altura integer, imagem text, miniatura text, PRIMARY KEY (empresa_id,orcamento_id,id));
CREATE TABLE IF NOT EXISTS public.relatorios (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, numero bigint, data date, cliente_id text, destinatario text, formato text, titulo text, introducao text, status text, origem_orcamento_id text, origem_orcamento_numero bigint, origem_orcamento_cliente text, total_servicos numeric, total_adiantamentos numeric, total_reembolsos numeric, saldo numeric, criado_em text, atualizado_em text, observacao_interna text, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.itens_relatorio (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, relatorio_id text NOT NULL, ordem integer, servico_id text, descricao text, unidade text, quantidade numeric, valor_unitario numeric, valor_total numeric, calculo_json jsonb, PRIMARY KEY (empresa_id,relatorio_id,id));
CREATE TABLE IF NOT EXISTS public.lancamentos_relatorio (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, relatorio_id text NOT NULL, tipo text, ordem integer, descricao text, valor numeric, PRIMARY KEY (empresa_id,relatorio_id,id));
CREATE TABLE IF NOT EXISTS public.textos_relatorio (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, relatorio_id text NOT NULL, tipo text, ordem integer, texto text, origem_padrao_id text, PRIMARY KEY (empresa_id,relatorio_id,id));
CREATE TABLE IF NOT EXISTS public.anexos_relatorio (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, relatorio_id text NOT NULL, referencia_tipo text, referencia_id text, ordem integer, titulo text, descricao text, mime text, largura integer, altura integer, imagem text, miniatura text, PRIMARY KEY (empresa_id,relatorio_id,id));
CREATE TABLE IF NOT EXISTS public.versoes_documentos (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, tipo text, documento_id text, numero integer, anterior_id text, criado_em text, computador text, descricao text, documento jsonb, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.recebimentos (empresa_id uuid NOT NULL REFERENCES auth.users(id), id text NOT NULL, recibo_id text, relatorio_id text, adiantamento_id text, valor numeric, estornado integer, PRIMARY KEY (empresa_id,id));
CREATE TABLE IF NOT EXISTS public.clientes (empresa_id uuid NOT NULL REFERENCES auth.users(id),id text NOT NULL,nome text,tratamento text,contato text,observacao text,ativo integer,criado_em text,tipo_pessoa text,cpf_cnpj text,telefone text,email text,endereco jsonb,nome_fantasia text,pessoa_contato text,campos_presentes text[] NOT NULL, dados_adicionais jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(empresa_id,id));
CREATE TABLE IF NOT EXISTS public.recibos (empresa_id uuid NOT NULL REFERENCES auth.users(id),id text NOT NULL,numero bigint,data date,cliente_id text,destinatario text,descricao text,valor numeric,local_pagamento text,forma_pagamento text,status text,quitacao text,origem_tipo text,origem_id text,adiantamento_id text,observacao text,criado_em text,atualizado_em text,campos_presentes text[] NOT NULL, dados_adicionais jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(empresa_id,id));

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
  WHEN 'servicos' THEN INSERT INTO public.servicos (empresa_id,id,nome,descricao_padrao,unidade,preco_referencia,ordem) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'nome')::text,(p_row->>'descricao_padrao')::text,(p_row->>'unidade')::text,(p_row->>'preco_referencia')::numeric,(p_row->>'ordem')::integer) ON CONFLICT (empresa_id,id) DO UPDATE SET nome=excluded.nome,descricao_padrao=excluded.descricao_padrao,unidade=excluded.unidade,preco_referencia=excluded.preco_referencia,ordem=excluded.ordem;
WHEN 'observacoes_padrao' THEN INSERT INTO public.observacoes_padrao (empresa_id,id,texto,padrao,ordem,aplicacao) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'texto')::text,(p_row->>'padrao')::integer,(p_row->>'ordem')::integer,(p_row->>'aplicacao')::text) ON CONFLICT (empresa_id,id) DO UPDATE SET texto=excluded.texto,padrao=excluded.padrao,ordem=excluded.ordem,aplicacao=excluded.aplicacao;
WHEN 'pagamentos_padrao' THEN INSERT INTO public.formas_pagamento_padrao (empresa_id,id,texto,padrao,ordem,aplicacao) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'texto')::text,(p_row->>'padrao')::integer,(p_row->>'ordem')::integer,(p_row->>'aplicacao')::text) ON CONFLICT (empresa_id,id) DO UPDATE SET texto=excluded.texto,padrao=excluded.padrao,ordem=excluded.ordem,aplicacao=excluded.aplicacao;
WHEN 'configuracoes' THEN INSERT INTO public.configuracoes_empresa (empresa_id,chave,valor) VALUES (p_empresa,(p_row->>'chave')::text,(p_row->>'valor')::jsonb) ON CONFLICT (empresa_id,chave) DO UPDATE SET valor=excluded.valor;
WHEN 'imagens' THEN INSERT INTO public.imagens (empresa_id,hash,mime,base64,miniatura_base64,bytes,largura,altura) VALUES (p_empresa,(p_row->>'hash')::text,(p_row->>'mime')::text,(p_row->>'base64')::text,(p_row->>'miniatura_base64')::text,(p_row->>'bytes')::integer,(p_row->>'largura')::integer,(p_row->>'altura')::integer) ON CONFLICT (empresa_id,hash) DO UPDATE SET mime=excluded.mime,base64=excluded.base64,miniatura_base64=excluded.miniatura_base64,bytes=excluded.bytes,largura=excluded.largura,altura=excluded.altura;
WHEN 'orcamentos' THEN INSERT INTO public.orcamentos (empresa_id,id,numero,data,cliente_id,destinatario,formato,titulo,introducao,prazo_dias,observacao_interna,valor_total,status,criado_em,atualizado_em) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'numero')::bigint,(p_row->>'data')::date,(p_row->>'cliente_id')::text,(p_row->>'destinatario')::text,(p_row->>'formato')::text,(p_row->>'titulo')::text,(p_row->>'introducao')::text,(p_row->>'prazo_dias')::integer,(p_row->>'observacao_interna')::text,(p_row->>'valor_total')::numeric,(p_row->>'status')::text,(p_row->>'criado_em')::text,(p_row->>'atualizado_em')::text) ON CONFLICT (empresa_id,id) DO UPDATE SET numero=excluded.numero,data=excluded.data,cliente_id=excluded.cliente_id,destinatario=excluded.destinatario,formato=excluded.formato,titulo=excluded.titulo,introducao=excluded.introducao,prazo_dias=excluded.prazo_dias,observacao_interna=excluded.observacao_interna,valor_total=excluded.valor_total,status=excluded.status,criado_em=excluded.criado_em,atualizado_em=excluded.atualizado_em;
WHEN 'itens_servico' THEN INSERT INTO public.itens_orcamento (empresa_id,id,orcamento_id,ordem,servico_id,descricao,unidade,quantidade,valor_unitario,valor_total,calculo_json) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'orcamento_id')::text,(p_row->>'ordem')::integer,(p_row->>'servico_id')::text,(p_row->>'descricao')::text,(p_row->>'unidade')::text,(p_row->>'quantidade')::numeric,(p_row->>'valor_unitario')::numeric,(p_row->>'valor_total')::numeric,(p_row->>'calculo_json')::jsonb) ON CONFLICT (empresa_id,orcamento_id,id) DO UPDATE SET ordem=excluded.ordem,servico_id=excluded.servico_id,descricao=excluded.descricao,unidade=excluded.unidade,quantidade=excluded.quantidade,valor_unitario=excluded.valor_unitario,valor_total=excluded.valor_total,calculo_json=excluded.calculo_json;
WHEN 'materiais' THEN INSERT INTO public.materiais_orcamento (empresa_id,id,orcamento_id,ordem,quantidade,unidade,especificacao) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'orcamento_id')::text,(p_row->>'ordem')::integer,(p_row->>'quantidade')::numeric,(p_row->>'unidade')::text,(p_row->>'especificacao')::text) ON CONFLICT (empresa_id,orcamento_id,id) DO UPDATE SET ordem=excluded.ordem,quantidade=excluded.quantidade,unidade=excluded.unidade,especificacao=excluded.especificacao;
WHEN 'orcamento_textos' THEN INSERT INTO public.textos_orcamento (empresa_id,id,orcamento_id,tipo,ordem,texto,origem_padrao_id) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'orcamento_id')::text,(p_row->>'tipo')::text,(p_row->>'ordem')::integer,(p_row->>'texto')::text,(p_row->>'origem_padrao_id')::text) ON CONFLICT (empresa_id,orcamento_id,id) DO UPDATE SET tipo=excluded.tipo,ordem=excluded.ordem,texto=excluded.texto,origem_padrao_id=excluded.origem_padrao_id;
WHEN 'anexos' THEN INSERT INTO public.anexos_orcamento (empresa_id,id,orcamento_id,item_servico_id,ordem,titulo,descricao,mime,largura,altura,imagem,miniatura) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'orcamento_id')::text,(p_row->>'item_servico_id')::text,(p_row->>'ordem')::integer,(p_row->>'titulo')::text,(p_row->>'descricao')::text,(p_row->>'mime')::text,(p_row->>'largura')::integer,(p_row->>'altura')::integer,(p_row->>'imagem')::text,(p_row->>'miniatura')::text) ON CONFLICT (empresa_id,orcamento_id,id) DO UPDATE SET item_servico_id=excluded.item_servico_id,ordem=excluded.ordem,titulo=excluded.titulo,descricao=excluded.descricao,mime=excluded.mime,largura=excluded.largura,altura=excluded.altura,imagem=excluded.imagem,miniatura=excluded.miniatura;
WHEN 'relatorios' THEN INSERT INTO public.relatorios (empresa_id,id,numero,data,cliente_id,destinatario,formato,titulo,introducao,status,origem_orcamento_id,origem_orcamento_numero,origem_orcamento_cliente,total_servicos,total_adiantamentos,total_reembolsos,saldo,criado_em,atualizado_em,observacao_interna) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'numero')::bigint,(p_row->>'data')::date,(p_row->>'cliente_id')::text,(p_row->>'destinatario')::text,(p_row->>'formato')::text,(p_row->>'titulo')::text,(p_row->>'introducao')::text,(p_row->>'status')::text,(p_row->>'origem_orcamento_id')::text,(p_row->>'origem_orcamento_numero')::bigint,(p_row->>'origem_orcamento_cliente')::text,(p_row->>'total_servicos')::numeric,(p_row->>'total_adiantamentos')::numeric,(p_row->>'total_reembolsos')::numeric,(p_row->>'saldo')::numeric,(p_row->>'criado_em')::text,(p_row->>'atualizado_em')::text,(p_row->>'observacao_interna')::text) ON CONFLICT (empresa_id,id) DO UPDATE SET numero=excluded.numero,data=excluded.data,cliente_id=excluded.cliente_id,destinatario=excluded.destinatario,formato=excluded.formato,titulo=excluded.titulo,introducao=excluded.introducao,status=excluded.status,origem_orcamento_id=excluded.origem_orcamento_id,origem_orcamento_numero=excluded.origem_orcamento_numero,origem_orcamento_cliente=excluded.origem_orcamento_cliente,total_servicos=excluded.total_servicos,total_adiantamentos=excluded.total_adiantamentos,total_reembolsos=excluded.total_reembolsos,saldo=excluded.saldo,criado_em=excluded.criado_em,atualizado_em=excluded.atualizado_em,observacao_interna=excluded.observacao_interna;
WHEN 'relatorio_itens_servico' THEN INSERT INTO public.itens_relatorio (empresa_id,id,relatorio_id,ordem,servico_id,descricao,unidade,quantidade,valor_unitario,valor_total,calculo_json) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'relatorio_id')::text,(p_row->>'ordem')::integer,(p_row->>'servico_id')::text,(p_row->>'descricao')::text,(p_row->>'unidade')::text,(p_row->>'quantidade')::numeric,(p_row->>'valor_unitario')::numeric,(p_row->>'valor_total')::numeric,(p_row->>'calculo_json')::jsonb) ON CONFLICT (empresa_id,relatorio_id,id) DO UPDATE SET ordem=excluded.ordem,servico_id=excluded.servico_id,descricao=excluded.descricao,unidade=excluded.unidade,quantidade=excluded.quantidade,valor_unitario=excluded.valor_unitario,valor_total=excluded.valor_total,calculo_json=excluded.calculo_json;
WHEN 'relatorio_lancamentos' THEN INSERT INTO public.lancamentos_relatorio (empresa_id,id,relatorio_id,tipo,ordem,descricao,valor) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'relatorio_id')::text,(p_row->>'tipo')::text,(p_row->>'ordem')::integer,(p_row->>'descricao')::text,(p_row->>'valor')::numeric) ON CONFLICT (empresa_id,relatorio_id,id) DO UPDATE SET tipo=excluded.tipo,ordem=excluded.ordem,descricao=excluded.descricao,valor=excluded.valor;
WHEN 'relatorio_textos' THEN INSERT INTO public.textos_relatorio (empresa_id,id,relatorio_id,tipo,ordem,texto,origem_padrao_id) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'relatorio_id')::text,(p_row->>'tipo')::text,(p_row->>'ordem')::integer,(p_row->>'texto')::text,(p_row->>'origem_padrao_id')::text) ON CONFLICT (empresa_id,relatorio_id,id) DO UPDATE SET tipo=excluded.tipo,ordem=excluded.ordem,texto=excluded.texto,origem_padrao_id=excluded.origem_padrao_id;
WHEN 'relatorio_anexos' THEN INSERT INTO public.anexos_relatorio (empresa_id,id,relatorio_id,referencia_tipo,referencia_id,ordem,titulo,descricao,mime,largura,altura,imagem,miniatura) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'relatorio_id')::text,(p_row->>'referencia_tipo')::text,(p_row->>'referencia_id')::text,(p_row->>'ordem')::integer,(p_row->>'titulo')::text,(p_row->>'descricao')::text,(p_row->>'mime')::text,(p_row->>'largura')::integer,(p_row->>'altura')::integer,(p_row->>'imagem')::text,(p_row->>'miniatura')::text) ON CONFLICT (empresa_id,relatorio_id,id) DO UPDATE SET referencia_tipo=excluded.referencia_tipo,referencia_id=excluded.referencia_id,ordem=excluded.ordem,titulo=excluded.titulo,descricao=excluded.descricao,mime=excluded.mime,largura=excluded.largura,altura=excluded.altura,imagem=excluded.imagem,miniatura=excluded.miniatura;
WHEN 'versoes' THEN INSERT INTO public.versoes_documentos (empresa_id,id,tipo,documento_id,numero,anterior_id,criado_em,computador,descricao,documento) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'tipo')::text,(p_row->>'documento_id')::text,(p_row->>'numero')::integer,(p_row->>'anterior_id')::text,(p_row->>'criado_em')::text,(p_row->>'computador')::text,(p_row->>'descricao')::text,(p_row->>'documento')::jsonb) ON CONFLICT (empresa_id,id) DO UPDATE SET tipo=excluded.tipo,documento_id=excluded.documento_id,numero=excluded.numero,anterior_id=excluded.anterior_id,criado_em=excluded.criado_em,computador=excluded.computador,descricao=excluded.descricao,documento=excluded.documento;
WHEN 'recebimentos' THEN INSERT INTO public.recebimentos (empresa_id,id,recibo_id,relatorio_id,adiantamento_id,valor,estornado) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'recibo_id')::text,(p_row->>'relatorio_id')::text,(p_row->>'adiantamento_id')::text,(p_row->>'valor')::numeric,(p_row->>'estornado')::integer) ON CONFLICT (empresa_id,id) DO UPDATE SET recibo_id=excluded.recibo_id,relatorio_id=excluded.relatorio_id,adiantamento_id=excluded.adiantamento_id,valor=excluded.valor,estornado=excluded.estornado;
WHEN 'clientes' THEN d:=(p_row->>'dados_json')::jsonb; IF jsonb_typeof(d)<>'object' THEN RAISE EXCEPTION 'Conteúdo inválido em clientes'; END IF; INSERT INTO public.clientes (empresa_id,id,nome,tratamento,contato,observacao,ativo,criado_em,tipo_pessoa,cpf_cnpj,telefone,email,endereco,nome_fantasia,pessoa_contato,campos_presentes,dados_adicionais) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'nome')::text,(p_row->>'tratamento')::text,(p_row->>'contato')::text,(p_row->>'observacao')::text,(p_row->>'ativo')::integer,(p_row->>'criado_em')::text,(d->>'tipoPessoa')::text,(d->>'documento')::text,(d->>'telefone')::text,(d->>'email')::text,d->'endereco',(d->>'nomeFantasia')::text,(d->>'pessoaContato')::text,ARRAY(SELECT jsonb_object_keys(d) INTERSECT SELECT unnest(ARRAY['id','nome','tratamento','contato','observacao','ativo','criadoEm','tipoPessoa','documento','telefone','email','endereco','nomeFantasia','pessoaContato']::text[])),d - ARRAY['id','nome','tratamento','contato','observacao','ativo','criadoEm','tipoPessoa','documento','telefone','email','endereco','nomeFantasia','pessoaContato']::text[]) ON CONFLICT (empresa_id,id) DO UPDATE SET nome=excluded.nome,tratamento=excluded.tratamento,contato=excluded.contato,observacao=excluded.observacao,ativo=excluded.ativo,criado_em=excluded.criado_em,tipo_pessoa=excluded.tipo_pessoa,cpf_cnpj=excluded.cpf_cnpj,telefone=excluded.telefone,email=excluded.email,endereco=excluded.endereco,nome_fantasia=excluded.nome_fantasia,pessoa_contato=excluded.pessoa_contato,campos_presentes=excluded.campos_presentes,dados_adicionais=excluded.dados_adicionais;
WHEN 'recibos' THEN d:=(p_row->>'dados')::jsonb; IF jsonb_typeof(d)<>'object' THEN RAISE EXCEPTION 'Conteúdo inválido em recibos'; END IF; INSERT INTO public.recibos (empresa_id,id,numero,data,cliente_id,destinatario,descricao,valor,local_pagamento,forma_pagamento,status,quitacao,origem_tipo,origem_id,adiantamento_id,observacao,criado_em,atualizado_em,campos_presentes,dados_adicionais) VALUES (p_empresa,(p_row->>'id')::text,(p_row->>'numero')::bigint,(d->>'data')::date,(d->>'clienteId')::text,(d->>'destinatario')::text,(d->>'descricao')::text,(d->>'valor')::numeric,(d->>'local')::text,(d->>'formaPagamento')::text,(d->>'status')::text,(d->>'quitacao')::text,(d->>'origemTipo')::text,(d->>'origemId')::text,(d->>'adiantamentoId')::text,(d->>'observacao')::text,(d->>'criadoEm')::text,(d->>'atualizadoEm')::text,ARRAY(SELECT jsonb_object_keys(d) INTERSECT SELECT unnest(ARRAY['id','numero','data','clienteId','destinatario','descricao','valor','local','formaPagamento','status','quitacao','origemTipo','origemId','adiantamentoId','observacao','criadoEm','atualizadoEm']::text[])),d - ARRAY['id','numero','data','clienteId','destinatario','descricao','valor','local','formaPagamento','status','quitacao','origemTipo','origemId','adiantamentoId','observacao','criadoEm','atualizadoEm']::text[]) ON CONFLICT (empresa_id,id) DO UPDATE SET numero=excluded.numero,data=excluded.data,cliente_id=excluded.cliente_id,destinatario=excluded.destinatario,descricao=excluded.descricao,valor=excluded.valor,local_pagamento=excluded.local_pagamento,forma_pagamento=excluded.forma_pagamento,status=excluded.status,quitacao=excluded.quitacao,origem_tipo=excluded.origem_tipo,origem_id=excluded.origem_id,adiantamento_id=excluded.adiantamento_id,observacao=excluded.observacao,criado_em=excluded.criado_em,atualizado_em=excluded.atualizado_em,campos_presentes=excluded.campos_presentes,dados_adicionais=excluded.dados_adicionais;

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
  -- Os clientes antigos representam exclusão com row:null; a resposta canônica
  -- omite row. Somente essa chave é normalizada, sem ocultar campos desconhecidos.
  IF p->>'tabela' IN ('clientes','servicos','observacoes_padrao','pagamentos_padrao','configuracoes','imagens')
     AND NOT(p ? 'rows') AND p ? 'row' AND p->'row'='null'::jsonb THEN
    resultado:=resultado-'row';
  END IF;
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
  WHEN 'servicos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'descricao_padrao',r.descricao_padrao,'unidade',r.unidade,'preco_referencia',r.preco_referencia,'ordem',r.ordem) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.servicos r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'observacoes_padrao' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'texto',r.texto,'padrao',r.padrao,'ordem',r.ordem,'aplicacao',r.aplicacao) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.observacoes_padrao r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'pagamentos_padrao' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'texto',r.texto,'padrao',r.padrao,'ordem',r.ordem,'aplicacao',r.aplicacao) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.formas_pagamento_padrao r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'configuracoes' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('chave',r.chave,'valor',CASE WHEN r.valor IS NULL THEN NULL ELSE r.valor::text END) ORDER BY r.chave),'[]'::jsonb) INTO resultado FROM public.configuracoes_empresa r WHERE r.empresa_id=p_empresa AND r.chave=p_id;
WHEN 'imagens' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('hash',r.hash,'mime',r.mime,'base64',r.base64,'miniatura_base64',r.miniatura_base64,'bytes',r.bytes,'largura',r.largura,'altura',r.altura) ORDER BY r.hash),'[]'::jsonb) INTO resultado FROM public.imagens r WHERE r.empresa_id=p_empresa AND r.hash=p_id;
WHEN 'orcamentos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'numero',r.numero,'data',r.data,'cliente_id',r.cliente_id,'destinatario',r.destinatario,'formato',r.formato,'titulo',r.titulo,'introducao',r.introducao,'prazo_dias',r.prazo_dias,'observacao_interna',r.observacao_interna,'valor_total',r.valor_total,'status',r.status,'criado_em',r.criado_em,'atualizado_em',r.atualizado_em) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.orcamentos r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'itens_servico' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orcamento_id',r.orcamento_id,'ordem',r.ordem,'servico_id',r.servico_id,'descricao',r.descricao,'unidade',r.unidade,'quantidade',r.quantidade,'valor_unitario',r.valor_unitario,'valor_total',r.valor_total,'calculo_json',CASE WHEN r.calculo_json IS NULL THEN NULL ELSE r.calculo_json::text END) ORDER BY r.orcamento_id,r.id),'[]'::jsonb) INTO resultado FROM public.itens_orcamento r WHERE r.empresa_id=p_empresa AND r.orcamento_id=p_id;
WHEN 'materiais' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orcamento_id',r.orcamento_id,'ordem',r.ordem,'quantidade',r.quantidade,'unidade',r.unidade,'especificacao',r.especificacao) ORDER BY r.orcamento_id,r.id),'[]'::jsonb) INTO resultado FROM public.materiais_orcamento r WHERE r.empresa_id=p_empresa AND r.orcamento_id=p_id;
WHEN 'orcamento_textos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orcamento_id',r.orcamento_id,'tipo',r.tipo,'ordem',r.ordem,'texto',r.texto,'origem_padrao_id',r.origem_padrao_id) ORDER BY r.orcamento_id,r.id),'[]'::jsonb) INTO resultado FROM public.textos_orcamento r WHERE r.empresa_id=p_empresa AND r.orcamento_id=p_id;
WHEN 'anexos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'orcamento_id',r.orcamento_id,'item_servico_id',r.item_servico_id,'ordem',r.ordem,'titulo',r.titulo,'descricao',r.descricao,'mime',r.mime,'largura',r.largura,'altura',r.altura,'imagem',r.imagem,'miniatura',r.miniatura) ORDER BY r.orcamento_id,r.id),'[]'::jsonb) INTO resultado FROM public.anexos_orcamento r WHERE r.empresa_id=p_empresa AND r.orcamento_id=p_id;
WHEN 'relatorios' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'numero',r.numero,'data',r.data,'cliente_id',r.cliente_id,'destinatario',r.destinatario,'formato',r.formato,'titulo',r.titulo,'introducao',r.introducao,'status',r.status,'origem_orcamento_id',r.origem_orcamento_id,'origem_orcamento_numero',r.origem_orcamento_numero,'origem_orcamento_cliente',r.origem_orcamento_cliente,'total_servicos',r.total_servicos,'total_adiantamentos',r.total_adiantamentos,'total_reembolsos',r.total_reembolsos,'saldo',r.saldo,'criado_em',r.criado_em,'atualizado_em',r.atualizado_em,'observacao_interna',r.observacao_interna) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.relatorios r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'relatorio_itens_servico' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relatorio_id',r.relatorio_id,'ordem',r.ordem,'servico_id',r.servico_id,'descricao',r.descricao,'unidade',r.unidade,'quantidade',r.quantidade,'valor_unitario',r.valor_unitario,'valor_total',r.valor_total,'calculo_json',CASE WHEN r.calculo_json IS NULL THEN NULL ELSE r.calculo_json::text END) ORDER BY r.relatorio_id,r.id),'[]'::jsonb) INTO resultado FROM public.itens_relatorio r WHERE r.empresa_id=p_empresa AND r.relatorio_id=p_id;
WHEN 'relatorio_lancamentos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relatorio_id',r.relatorio_id,'tipo',r.tipo,'ordem',r.ordem,'descricao',r.descricao,'valor',r.valor) ORDER BY r.relatorio_id,r.id),'[]'::jsonb) INTO resultado FROM public.lancamentos_relatorio r WHERE r.empresa_id=p_empresa AND r.relatorio_id=p_id;
WHEN 'relatorio_textos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relatorio_id',r.relatorio_id,'tipo',r.tipo,'ordem',r.ordem,'texto',r.texto,'origem_padrao_id',r.origem_padrao_id) ORDER BY r.relatorio_id,r.id),'[]'::jsonb) INTO resultado FROM public.textos_relatorio r WHERE r.empresa_id=p_empresa AND r.relatorio_id=p_id;
WHEN 'relatorio_anexos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relatorio_id',r.relatorio_id,'referencia_tipo',r.referencia_tipo,'referencia_id',r.referencia_id,'ordem',r.ordem,'titulo',r.titulo,'descricao',r.descricao,'mime',r.mime,'largura',r.largura,'altura',r.altura,'imagem',r.imagem,'miniatura',r.miniatura) ORDER BY r.relatorio_id,r.id),'[]'::jsonb) INTO resultado FROM public.anexos_relatorio r WHERE r.empresa_id=p_empresa AND r.relatorio_id=p_id;
WHEN 'versoes' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'tipo',r.tipo,'documento_id',r.documento_id,'numero',r.numero,'anterior_id',r.anterior_id,'criado_em',r.criado_em,'computador',r.computador,'descricao',r.descricao,'documento',CASE WHEN r.documento IS NULL THEN NULL ELSE r.documento::text END) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.versoes_documentos r WHERE r.empresa_id=p_empresa AND r.tipo=p_tipo AND r.documento_id=p_id;
WHEN 'recebimentos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'recibo_id',r.recibo_id,'relatorio_id',r.relatorio_id,'adiantamento_id',r.adiantamento_id,'valor',r.valor,'estornado',r.estornado) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.recebimentos r WHERE r.empresa_id=p_empresa AND r.recibo_id=p_id;
WHEN 'clientes' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'tratamento',r.tratamento,'contato',r.contato,'observacao',r.observacao,'ativo',r.ativo,'criado_em',r.criado_em,'dados_json',sincronizacao.recompor_json(to_jsonb(r), '{"id":"id","nome":"nome","tratamento":"tratamento","contato":"contato","observacao":"observacao","ativo":"ativo:boolean","criadoEm":"criado_em","tipoPessoa":"tipo_pessoa","documento":"cpf_cnpj","telefone":"telefone","email":"email","endereco":"endereco","nomeFantasia":"nome_fantasia","pessoaContato":"pessoa_contato"}'::jsonb,r.campos_presentes,r.dados_adicionais)::text)),'[]'::jsonb) INTO resultado FROM public.clientes r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'recibos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'numero',r.numero,'dados',sincronizacao.recompor_json(to_jsonb(r), '{"id":"id","numero":"numero","data":"data","clienteId":"cliente_id","destinatario":"destinatario","descricao":"descricao","valor":"valor","local":"local_pagamento","formaPagamento":"forma_pagamento","status":"status","quitacao":"quitacao","origemTipo":"origem_tipo","origemId":"origem_id","adiantamentoId":"adiantamento_id","observacao":"observacao","criadoEm":"criado_em","atualizadoEm":"atualizado_em"}'::jsonb,r.campos_presentes,r.dados_adicionais)::text)),'[]'::jsonb) INTO resultado FROM public.recibos r WHERE r.empresa_id=p_empresa AND r.id=p_id;

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
  FOR nome IN SELECT unnest(ARRAY['servicos','observacoes_padrao','formas_pagamento_padrao','configuracoes_empresa','imagens','orcamentos','itens_orcamento','materiais_orcamento','textos_orcamento','anexos_orcamento','relatorios','itens_relatorio','lancamentos_relatorio','textos_relatorio','anexos_relatorio','versoes_documentos','recebimentos','clientes','recibos','documentos','imagens_versoes','computadores','reservas_numeros','entidades','operacoes']) LOOP
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

COMMIT;
