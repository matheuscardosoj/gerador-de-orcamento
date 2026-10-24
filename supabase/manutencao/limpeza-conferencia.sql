-- Limpeza de dados no Supabase: PARTE 1, SOMENTE LEITURA.
-- Execute no SQL Editor e confira o resultado antes de apagar qualquer coisa
-- (o passo a passo está em docs/LIMPEZA-SUPABASE.md).

-- 1) Empresas, quantos membros e quanto cada uma guarda.
SELECT e.id, e.nome, e.criado_em,
       (SELECT count(*) FROM membros_empresa m WHERE m.empresa_id = e.id) AS membros,
       (SELECT count(*) FROM orcamentos o WHERE o.empresa_id = e.id) AS orcamentos,
       (SELECT count(*) FROM relatorios r WHERE r.empresa_id = e.id) AS relatorios,
       (SELECT count(*) FROM recibos c WHERE c.empresa_id = e.id) AS recibos,
       (SELECT count(*) FROM clientes c WHERE c.empresa_id = e.id) AS clientes,
       (SELECT count(*) FROM imagens i WHERE i.empresa_id = e.id) AS imagens
  FROM public.empresas e
 ORDER BY e.nome;

-- 2) Usuários e a quais empresas pertencem (marca o administrador do sistema).
SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
       EXISTS (SELECT 1 FROM central.operadores o WHERE o.usuario_id = u.id) AS administrador_do_sistema,
       coalesce(string_agg(DISTINCT e.nome, ' | ' ORDER BY e.nome), '(nenhuma)') AS empresas
  FROM auth.users u
  LEFT JOIN public.membros_empresa m ON m.usuario_id = u.id
  LEFT JOIN public.empresas e ON e.id = m.empresa_id
 GROUP BY u.id
 ORDER BY u.email;

-- 3) Usuários que o roteiro apagaria: todos, exceto o administrador e quem é membro da empresa a manter.
--    Troque o texto do filtro abaixo pelo nome EXATO da empresa que fica (veja o resultado do item 1).
WITH mantida AS (SELECT id FROM public.empresas WHERE nome = 'TROQUE PELO NOME EXATO DA EMPRESA QUE FICA'),
     fica AS (
       SELECT id FROM auth.users WHERE lower(email) = 'matheuscardosoj@outlook.com'
       UNION
       SELECT m.usuario_id FROM public.membros_empresa m JOIN mantida ON mantida.id = m.empresa_id
     )
SELECT u.id, u.email, 'SERIA APAGADO' AS situacao
  FROM auth.users u
 WHERE u.id NOT IN (SELECT id FROM fica)
 ORDER BY u.email;
