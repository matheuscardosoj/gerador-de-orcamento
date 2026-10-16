-- Mostra o nome configurado da empresa na seleção após o login.
-- Mantém empresas.nome como fallback para empresas sem identificação configurada.
BEGIN;

CREATE OR REPLACE FUNCTION public.gdo_contas() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'operador',EXISTS(SELECT 1 FROM central.operadores WHERE usuario_id=auth.uid()),
  'empresas',coalesce((
   SELECT jsonb_agg(
    jsonb_build_object(
     'id',e.id,
     'nome',coalesce(
      nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),
      e.nome
     ),
     'papel',m.papel,
     'usuarioNome',m.nome
    )
    ORDER BY coalesce(
     nullif(btrim(CASE WHEN c.valor->>'nomeExibicao'='razaoSocial' THEN c.valor->>'razaoSocial' ELSE c.valor->>'nome' END),''),
     e.nome
    )
   )
   FROM empresas e
   JOIN membros_empresa m ON m.empresa_id=e.id
   LEFT JOIN configuracoes_empresa c ON c.empresa_id=e.id AND c.chave='empresa'
   WHERE m.usuario_id=auth.uid() AND m.ativo
  ),'[]'::jsonb)
 );
$$;

REVOKE ALL ON FUNCTION public.gdo_contas() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_contas() TO authenticated;

COMMIT;
