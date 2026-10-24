# Limpeza de dados no Supabase

Objetivo: deixar o projeto só com o administrador (`matheuscardosoj@outlook.com`) e a empresa
que fica, com os documentos, arquivos e imagens dela. **A exclusão é permanente e não tem desfazer.**
Faça antes uma cópia de segurança do projeto (Supabase > Database > Backups) e confirme o nome da empresa
que fica: nas telas aparecem "VS PRESTADORA DE SERVIÇOS" e "TESTE"; "V S DE JESUS" não apareceu.

1. **Conferir (somente leitura).** Abra o SQL Editor e execute
   `supabase/manutencao/limpeza-conferencia.sql`. Troque o nome da empresa no item 3 pelo nome exato do item 1.
   Confira se "SERIA APAGADO" lista só quem deve sair.
2. **Apagar as outras empresas pelo aplicativo.** Entre como administrador do sistema, na tela
   "Escolha sua empresa", use **Excluir** em cada empresa que não fica e digite o nome exato para confirmar.
   É o caminho suportado: a função `gdo_excluir_empresa` remove todas as tabelas daquela empresa em ordem e
   registra a exclusão, sem tocar nas demais.
3. **Apagar os usuários que não ficam.** Supabase > Authentication > Users: selecione cada usuário listado
   no item 3 e use _Delete user_. (Usuários de empresas já excluídas deixam de ter vínculo, mas a conta de
   login continua existindo até ser removida aqui.)
4. **Conferir de novo.** Reexecute o arquivo do passo 1: deve restar uma empresa e o administrador (mais os
   membros da empresa que fica).
5. Arquivos e imagens da empresa que fica não são tocados por nenhum desses passos.

## Execução rápida (conferida em 24/10/2026)

A consulta de leitura mostrou: empresa **TESTE** (1 orçamento de teste), empresa **VS PRESTADORA DE SERVIÇOS**
(22 orçamentos, 5 relatórios, 1 recibo, 13 clientes, 17 imagens, que fica), o administrador
`matheuscardosoj@outlook.com` e três contas de teste sem empresa. No SQL Editor, nesta ordem:

1. `supabase/manutencao/limpeza-backup.sql` (leitura): Export > JSON e guarde o arquivo.
2. `supabase/manutencao/limpeza-executar.sql`: cole inteiro e execute uma vez. Tem guardas e transação;
   se algo não bater com o conferido, nada é apagado.
