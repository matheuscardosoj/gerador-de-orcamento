# Acesso central — validação do candidato rc.8 (14/10/2026)

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
confirma o envio real. Depois de instalar o rc.6, o destinatário confirmou
que informou o código, definiu uma senha e entrou na empresa pelo aplicativo.
O convite apareceu como aceito, a conta permaneceu na empresa correta após
reiniciar o aplicativo e a saída/entrada com a conta principal funcionou sem
misturar os dados exibidos, conforme confirmação do usuário.

## Pendências de validação real

1. Testar reenvio, cancelamento, expiração e rejeição de outro e-mail. Repetir
   entrega em Outlook; o único e-mail de recuperação confirmado chegou ao lixo
   eletrônico.
2. Testar permissões entre empresas e operações de administrador. Alteração de
   senha, reinício e troca de conta passaram no rc.7.
3. Testar nos dois computadores edição concorrente, numeração, pagamentos e
   recuperação de conexão. Confirmar que as 37 operações antigas seguem apenas
   como histórico preservado.
4. Validar a operadora sem empresa vinculada, repetição após perda da resposta
   ao criar empresa e convite, expiração/revogação e alterações simultâneas.

## Teste de sincronização entre computadores

Os dois computadores foram confirmados no rc.6. O usuário criou um cliente no
computador principal, observou sua chegada no notebook, renomeou-o no notebook
e observou a atualização no computador principal. A percepção relatada foi de
menos de dois segundos em cada sentido, sem mencionar erro ou pendência nova.
Esse resultado confirma a meta no teste realizado, embora não seja uma garantia
de latência constante em toda conexão.

Após esse teste, o usuário confirmou que ambos os computadores estão no rc.6.

## Ajuste da tabela de usuários

Uma captura do rc.6 em janela estreita mostrou e-mail e perfil de acesso
invadindo colunas adjacentes. O rc.7 define larguras proporcionais para as cinco
colunas no mesmo componente compartilhado das outras tabelas e quebra nomes e
e-mails longos em até duas linhas. O executável rc.7 passou pelo ensaio das
telas de acesso em perfil isolado. O usuário instalou o rc.7, verificou a tabela
na largura da captura e confirmou que ficou alinhada, sem sobreposição.

## Visualização de senha

O usuário confirmou que conseguiu alterar a senha da conta de teste no rc.7 e
entrar novamente com a nova senha. O rc.8 adiciona o controle animado de mostrar
e ocultar em todos os campos de senha: login, aceite/recuperação de convite,
Minha conta e conexão da nuvem. A interação será exercitada no ensaio do
executável.

O executável empacotado do rc.6 passou novamente pelo ensaio automatizado em
perfil isolado, incluindo a tela de aceitação de convite e recuperação em
larguras de 1024 e 1440 px. O envio real do convite passou no serviço após a
correção, e o destinatário confirmou a aceitação com código e senha diretamente
no aplicativo.

O executável empacotado do rc.8 passou por ensaio automatizado em perfil
descartável: a tela de acesso e a tela de aceite do convite exibiram os
controles de senha, e o teste confirmou a alternância entre senha visível e
oculta. `npm run check` passou no rc.8: lint, formatação, TypeScript, 268 testes
em 45 arquivos e compilação. Permanecem avisos de divisão de módulos do Vite,
sem falha de build.

## Limpeza autorizada em 14/10/2026

Após autorização explícita do administrador, uma transação no projeto
`gerador-orcamento` removeu os vínculos de acesso à empresa de
`notebook@gmail.com` e `gerador.orcamentos.app+teste@gmail.com`, apagou os dois
registros de convite do alias de teste e removeu o cadastro sem documentos
associados `Teste de sincronização rc6`. As identidades globais de autenticação
e a autoria histórica foram preservadas. A relação de autoria não foi reescrita;
nenhum documento estava atribuído ao Notebook.

A exclusão do cliente foi publicada como tombstone de sincronização, revisão 3,
para que cópias locais removam o registro ao sincronizar. A verificação posterior
retornou zero membros de teste, zero convites do alias, zero clientes com o ID
removido, duas entradas de auditoria da remoção e uma entrada da transferência.
Os dois vínculos de dispositivo que estavam associados a Notebook e ao usuário
de teste foram transferidos para `matheuscardosoj@outlook.com`, conforme
autorização. Na próxima utilização, o notebook deve entrar com a conta Matheus e
baixar/sincronizar a base; a operação antiga preservada continua no perfil
anterior e não será publicada.

Após essa limpeza, a captura do usuário revelou mais um convite cancelado de
teste, ainda visível na tela. O registro foi conferido pelo ID e pelo estado
cancelado, removido do schema `central`, e a contagem da empresa foi verificada:
zero convites, zero cancelados e zero pendentes. A tela de convites consulta a
lista ao ser aberta; se já estava aberta durante a limpeza, feche e abra a aba
Usuários para buscar o estado atualizado. A trilha de auditoria guarda apenas o
ID técnico e o motivo, sem manter o endereço do convite.

O usuário confirmou o teste real de convite: o código chegou, a conta de teste
entrou na empresa correta, reiniciou e saiu/entrou sem misturar dados. Também
confirmou sincronização entre os dois computadores em menos de dois segundos no
teste executado e validou o alinhamento da tabela de usuários no rc.7. A limpeza
removeu depois o usuário de teste e o convite, portanto esses acessos já não
estão disponíveis para novos ensaios.

Não houve merge para `main` nem publicação da versão final. Os testes automatizados
de recebimentos parciais, adiantamentos existentes, estornos, atomicidade,
reenvio idempotente e conciliação financeira passaram no `npm run check`. Ainda
falta confirmar uma operação financeira no ambiente real entre dois computadores.
Também permanecem os testes de reenvio/cancelamento/expiração de convites,
destinatário incorreto, entrega no Outlook, permissões entre empresas, criação
repetida de empresas, concorrência, numeração e reconexão, além da checagem
manual dos ícones de senha no rc.8. Não declarar o produto pronto para lançamento
público até validar esses pontos.

## Artefato entregue

O instalador rc.8 está em `Downloads/Gerador de Orcamentos/Candidato
1.5.0-rc.8` com este relatório e as instruções de teste. O rc.7 permanece na
pasta anterior. Os pacotes incluem apenas a URL e a chave pública; não contêm
credenciais SMTP ou administrativas. SHA-256 do instalador:
`38836A4EFFC0AC798759A455FF9B0FC6C6CF93E909F598C9E1C83DF0FBECD8A1`.
