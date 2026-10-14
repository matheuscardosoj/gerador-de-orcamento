# Acesso central — validação do candidato 1.5.0-rc.6 (13/10/2026)

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
de alterações não salvas. O executável empacotado do rc.5 passou por um ensaio
automatizado em perfil descartável: telas de convite e recuperação, código inicial
do convite, reenvio, correção de e-mail e ausência de rolagem horizontal nas
larguras de 1024 e 1440 px. O envio de código nesse ensaio foi simulado; não
substitui os testes de autenticação real.

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

## Migração real já concluída

Depois de backup verificado e dos dois aplicativos fechados/sincronizados,
`001_servico_central.sql` foi aplicado ao projeto `gerador-orcamento` e o
Supabase retornou `Success. No rows returned`. Uma consulta de leitura confirmou
o protocolo v4, as três tabelas centrais (`convites`, `limites_email`,
`operadores`), uma empresa, 17 orçamentos, 4 relatórios, 1 recibo, 4
recebimentos, 11 clientes, 81 versões e dois membros naquele momento. Esses
números são uma fotografia da migração, não um retrato necessariamente atual.
O backup verificado permanece em Downloads. Não reaplicar a migração nem
restaurar esse backup sobre a base atual.

A função `central-contas` foi publicada no projeto, os templates de convite e
recuperação foram configurados e a conta
`matheuscardosoj@outlook.com` foi registrada como operadora após autorização.
O projeto ecoplay está fora do escopo.

## Convite real e correção do rc.6

No primeiro teste com o rc.5, o convite novo foi registrado, mas o e-mail não
foi enviado. Os logs do projeto mostraram que a função chamava `/auth/v1/otp`,
que respondeu `422 Signups not allowed for this instance` porque o cadastro
público está corretamente desligado. A função foi alterada para enviar o
convite por `inviteUserByEmail`, na rota administrativa. Para contas já
confirmadas, ela envia um código de recuperação; o aplicativo aceita ambos os
tipos de código ao concluir o convite. O convite pendente foi preservado.

A função corrigida foi publicada no projeto. Ao repetir o envio pelo rc.5,
o usuário confirmou que o convite foi enviado e chegou à caixa Gmail de teste.
O template Invite foi salvo em português, com o código de acesso. Esse teste
confirma o envio real, mas ainda não a aceitação do código e a definição da
senha; essas etapas exigem o rc.6 no aplicativo.

## Pendências de validação real

1. Testar aceitação do convite no alias Gmail autorizado, definição de senha,
   reenvio, cancelamento, expiração e rejeição de outro e-mail. Repetir entrega
   em Outlook; o único e-mail de recuperação confirmado chegou ao lixo eletrônico.
2. Testar no serviço real alteração de senha, manter conectado, troca de conta,
   permissões entre empresas e operações de administrador.
3. Repetir no notebook e no computador principal sincronização após salvar,
   edição concorrente, numeração, pagamentos e recuperação de conexão. Confirmar
   que as 37 operações antigas seguem apenas como histórico preservado.
4. Validar a operadora sem empresa vinculada, repetição após perda da resposta
   ao criar empresa e convite, expiração/revogação e alterações simultâneas.

O executável empacotado do rc.6 passou novamente pelo ensaio automatizado em
perfil isolado, incluindo a tela de aceitação de convite e recuperação em
larguras de 1024 e 1440 px. O envio real do convite passou no serviço após a
correção; a aceitação ainda depende do teste pelo destinatário com o código
recebido diretamente no aplicativo.

O candidato rc.6 foi gerado para esses testes. Não houve merge para `main`
nem publicação da versão final. Não recomendar o uso por outras empresas
até concluir os ensaios reais acima.

## Artefato entregue

O instalador `Gerador de Orçamentos Setup 1.5.0-rc.6.exe` está em
`Downloads/Gerador de Orcamentos/Candidato 1.5.0-rc.6`. O arquivo original e a
cópia têm o mesmo SHA-256:

`08BF9F75D1DBBCA2FFAC1DA22D953EE583EF160421B903F4835E70B6D17AB60B`

A configuração empacotada contém a URL e a chave pública do projeto, sem
e-mail preenchido. Uma busca no arquivo da aplicação não encontrou valor de
chave secreta nem a conta usada no SMTP. A biblioteca contém somente a
expressão genérica `sb_secret_` (sem caracteres de chave após o prefixo) e
referências genéricas a `service_role`; nenhuma delas é uma credencial.
