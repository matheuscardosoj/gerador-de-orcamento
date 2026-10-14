# Acesso central — validação de 13/10/2026

## Implementado no código

- Login, opção de manter conectado, saída e entrada com outra conta.
- Perfis locais separados por projeto, empresa e usuário; espera das operações
  da conta anterior antes de trocar o banco e a sessão.
- Minha conta, alteração de nome e senha, convites, papéis de acesso e primeiros
  passos com nome da empresa e logo, usando os componentes visuais existentes.
- Operações antigas em uma seção recolhida, sem tratá-las como falha atual.
- Novas bases sem identidade, clientes ou dados bancários da empresa original.
- Migração incremental para contexto por empresa, proteção do último
  administrador e função de convites com credenciais somente no servidor.
- Configuração pública do serviço no pacote, sem exigir URL/chave do usuário.
- Cadastro de clientes extraído para repositório próprio, documentação das
  fronteiras entre módulos e pacote restrito ao código compilado e recursos.

## Evidências locais

`npm run check` passou: lint, formatação, TypeScript, 268 testes em 45 arquivos e
compilação. Permanecem avisos de importações estáticas e dinâmicas já compartilhadas.
Esse comando cobre o aplicativo e os testes SQL; não executa a função Edge no
ambiente remoto do Supabase.

Os testes incluem autorização antes do login, separação física de perfis,
troca/reabertura da base, espera da renovação de sessão, permissões SQL,
proteção do último administrador, aceitação de convites por destinatário e
persistência da identidade das solicitações para repetir envios sem duplicar empresas.
A migração SQL foi exercitada em PGlite com dados de teste, não na produção.

A tela Minha conta foi conferida na prévia demonstrativa, incluindo a confirmação
de alterações não salvas. Isso não substitui os testes de autenticação real.

O SMTP personalizado do Gmail foi salvo no Supabase e o endpoint oficial de
recuperação aceitou a solicitação. O e-mail chegou ao endereço Outlook usado no
teste, confirmando o envio real, mas foi classificado como lixo eletrônico. A
entrega ainda precisa ser repetida em Gmail e Outlook depois da configuração dos
demais templates. O lançamento deve orientar o usuário a marcar a primeira
mensagem como confiável enquanto o remetente gratuito constrói reputação.

A conta `matheuscardosoj@outlook.com` foi habilitada como operadora central e a
permissão foi confirmada no banco. No Outlook, marcar a mensagem recebida como
“Não é lixo eletrônico” e adicionar o remetente aos remetentes confiáveis ajuda
a treinar a classificação; não garante que mensagens futuras cheguem à caixa de
entrada.

O cadastro público em Authentication → Sign In / Providers foi desativado após
confirmação do responsável. A tela do Supabase confirmou “Successfully updated
settings” e mostrou a opção desligada. As contas existentes permanecem ativas;
os novos usuários devem entrar por convite do aplicativo.

Antes da migração foi criada uma cópia da base compartilhada em
`Downloads/Gerador de Orcamentos/Migracao acesso central 2026-10-13`. O arquivo
tem o mesmo SHA-256 da origem e passou por `PRAGMA integrity_check`, sem violações
de chaves estrangeiras, com esquema local 11. O script somente leitura
`scripts/verificar-backup-local.mjs` permite repetir essa verificação.

## Organização dos arquivos do usuário

Oito artefatos antigos foram preservados em
`Downloads/Gerador de Orcamentos/Arquivo de versoes anteriores`, com comparação
SHA-256 antes/depois e inventário JSON. O atalho atual e o backup pessoal foram
mantidos. Não houve exclusão desses arquivos nem liberação de espaço alegada.

## Pendências obrigatórias da entrega

1. Configurar o template de convite/código e repetir os testes reais de entrega,
   código, reenvio e recuperação em Gmail e Outlook. O SMTP e a recuperação já
   foram confirmados; falta reduzir a classificação como lixo eletrônico.
2. Depois de backup verificado e dos dois aplicativos fechados/sincronizados,
   `001_servico_central.sql` foi aplicado ao projeto `gerador-orcamento` e o
   Supabase retornou `Success. No rows returned`. Uma consulta de leitura confirmou
   o protocolo v4, as três tabelas centrais (`convites`, `limites_email`,
   `operadores`), uma empresa, 17 orçamentos, 4 relatórios, 1 recibo, 4
   recebimentos, 11 clientes, 81 versões e dois membros. A conta
   `matheuscardosoj@outlook.com` aparece ativa como administradora. O backup
   verificado permanece em Downloads.
3. A função central `central-contas` foi publicada no projeto, os templates de
   código de acesso e recuperação foram configurados e a conta
   `matheuscardosoj@outlook.com` foi registrada como operadora após autorização.
   Falta validar convites de ponta a ponta e a entrega em Gmail e Outlook. O
   projeto ecoplay está fora do escopo.
4. Validar a conta do operador sem empresa vinculada, repetição após perda da
   resposta ao criar empresa, expiração/revogação e alterações simultâneas.
5. Validar o executável em perfis separados, SMTP real e dois computadores.
   Só então gerar e entregar o candidato central. Manter a versão anterior
   funcionando até a troca coordenada.

Não foi realizado merge para main, publicação de versão final ou migração real.
