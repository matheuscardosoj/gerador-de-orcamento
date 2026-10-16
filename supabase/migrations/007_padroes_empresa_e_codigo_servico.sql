-- Corrige o delta do código dos serviços e inicializa padrões apenas na criação de empresas.
-- Exige backup validado antes de aplicar ao projeto compartilhado.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gdo-padroes-codigo-v1',0));
CREATE OR REPLACE FUNCTION sincronizacao.linhas(p_empresa uuid,p_tabela text,p_id text,p_tipo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN CASE p_tabela
  WHEN 'servicos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'descricao_padrao',r.descricao_padrao,'unidade',r.unidade,'preco_referencia',r.preco_referencia,'ordem',r.ordem,'codigo',r.codigo) ORDER BY r.id),'[]'::jsonb) INTO resultado FROM public.servicos r WHERE r.empresa_id=p_empresa AND r.id=p_id;
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
WHEN 'clientes' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'tratamento',r.tratamento,'contato',r.contato,'observacao',r.observacao,'ativo',r.ativo,'criado_em',r.criado_em,'dados_json',(sincronizacao.recompor_json(to_jsonb(r), '{"id":"id","nome":"nome","tratamento":"tratamento","contato":"contato","observacao":"observacao","ativo":"ativo:boolean","criadoEm":"criado_em","tipoPessoa":"tipo_pessoa","documento":"cpf_cnpj","telefone":"telefone","email":"email","endereco":"endereco","nomeFantasia":"nome_fantasia","pessoaContato":"pessoa_contato","codigo":"codigo"}'::jsonb,r.campos_presentes,r.dados_adicionais) || jsonb_build_object('codigo',r.codigo))::text)),'[]'::jsonb) INTO resultado FROM public.clientes r WHERE r.empresa_id=p_empresa AND r.id=p_id;
WHEN 'recibos' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'numero',r.numero,'dados',sincronizacao.recompor_json(to_jsonb(r), '{"id":"id","numero":"numero","data":"data","clienteId":"cliente_id","destinatario":"destinatario","descricao":"descricao","valor":"valor","local":"local_pagamento","formaPagamento":"forma_pagamento","status":"status","quitacao":"quitacao","origemTipo":"origem_tipo","origemId":"origem_id","adiantamentoId":"adiantamento_id","observacao":"observacao","criadoEm":"criado_em","atualizadoEm":"atualizado_em"}'::jsonb,r.campos_presentes,r.dados_adicionais)::text)),'[]'::jsonb) INTO resultado FROM public.recibos r WHERE r.empresa_id=p_empresa AND r.id=p_id;

  WHEN 'documento_meta' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',r.tipo,'documento_id',r.documento_id,'dados',r.dados::text)),'[]'::jsonb) INTO resultado FROM documentos r WHERE r.empresa_id=p_empresa AND r.tipo=p_tipo AND r.documento_id=p_id;
  ELSE RAISE EXCEPTION 'Tabela não compartilhável'; END CASE; RETURN resultado;
END $$;

-- Padrões pertencem à empresa, não ao perfil de cada usuário/computador.
-- O gatilho roda apenas na criação da empresa e nunca recria um texto apagado.
CREATE OR REPLACE FUNCTION sincronizacao.criar_padroes_empresa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,sincronizacao,pg_temp AS $$
DECLARE observacao_id text:='00000000-0000-4000-8000-000000000001'; pagamento_id text:='00000000-0000-4000-8000-000000000002';
BEGIN
  -- O modo legado publica os seus próprios padrões ao criar auth.users(id).
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

NOTIFY pgrst,'reload schema';
COMMIT;
