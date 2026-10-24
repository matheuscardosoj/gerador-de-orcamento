-- Limpeza de dados do projeto gerador-orcamento (conferida em 24/10/2026 com a consulta de leitura).
-- Remove a empresa TESTE e as 3 contas de teste sem empresa; mantém o administrador
-- (matheuscardosoj@outlook.com) e a empresa "VS PRESTADORA DE SERVIÇOS" com todos os dados.
-- É PERMANENTE. Tudo roda em uma transação: qualquer guarda ou erro cancela tudo.
-- Cole inteiro no SQL Editor do Supabase e execute uma vez.

BEGIN;

DO $$
BEGIN
  -- Guardas: só segue se o estado é exatamente o conferido.
  IF NOT EXISTS (SELECT 1 FROM public.empresas
                  WHERE id = '27e5fb3e-8131-42ff-9c7d-b76a92304565' AND nome = 'VS PRESTADORA DE SERVIÇOS') THEN
    RAISE EXCEPTION 'A empresa que deve ficar não foi encontrada com este id e nome. Nada foi apagado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas
                  WHERE id = '17488fc0-3f84-47ac-9de5-a5f9874895f1' AND nome = 'TESTE') THEN
    RAISE EXCEPTION 'A empresa TESTE não foi encontrada com este id e nome. Nada foi apagado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u JOIN central.operadores o ON o.usuario_id = u.id
                  WHERE u.id = '27e5fb3e-8131-42ff-9c7d-b76a92304565' AND lower(u.email) = 'matheuscardosoj@outlook.com') THEN
    RAISE EXCEPTION 'O administrador do sistema não foi encontrado. Nada foi apagado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.membros_empresa
              WHERE usuario_id IN ('fe315453-3254-4bc7-8ce4-ecd266e93325','ebf4414a-c387-446a-8dc9-afcc2f149699','ca5d7068-8001-4685-af15-08cb715af2d1')) THEN
    RAISE EXCEPTION 'Alguma conta de teste agora pertence a uma empresa. Nada foi apagado.';
  END IF;
END $$;

-- 1) Empresa TESTE: usa a mesma função do botão "Excluir" do aplicativo (ator = administrador).
SELECT public.gdo_excluir_empresa('27e5fb3e-8131-42ff-9c7d-b76a92304565'::uuid, '17488fc0-3f84-47ac-9de5-a5f9874895f1'::uuid);

-- 2) Contas de teste sem empresa.
DELETE FROM auth.users
 WHERE id IN ('fe315453-3254-4bc7-8ce4-ecd266e93325','ebf4414a-c387-446a-8dc9-afcc2f149699','ca5d7068-8001-4685-af15-08cb715af2d1')
   AND email IN ('teste@teste.com','teste@teste.coom','teste@teste4.com');

-- 3) Conferência final (deve mostrar 1 empresa e 1 usuário).
SELECT (SELECT count(*) FROM public.empresas) AS empresas,
       (SELECT count(*) FROM auth.users) AS usuarios,
       (SELECT count(*) FROM public.orcamentos WHERE empresa_id = '27e5fb3e-8131-42ff-9c7d-b76a92304565') AS orcamentos_mantidos;

COMMIT;
