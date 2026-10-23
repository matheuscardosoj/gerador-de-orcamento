# Nuvem da empresa — esquema local 14

> O acesso central por convite e perfis separados já está integrado. Para uma
> empresa que já usa o Supabase, aplique apenas as migrações incrementais da
> atualização; não execute novamente o esquema inicial nem restaure um backup
> antigo sobre a base ativa.

## Atualização 1.6.0: migração 013 (recomendada)

Execute `migrations/013_realtime_sem_renovacao.sql` uma vez no SQL Editor. Ela faz o aviso em
tempo real ignorar apenas a renovação automática do prazo da sessão de edição (a cada 30 s por
documento), que antes acordava todos os computadores para uma sincronização completa. Trocas de
posse, geração, modo offline e dados continuam avisando em tempo real. É idempotente e não altera
dados. Para desfazer, execute `rollbacks/013_desfazer_realtime_sem_renovacao.sql` (restaura a função
como estava antes). Sem a migração o aplicativo funciona, com mais requisições ao Supabase.

O serviço central pode conter várias empresas. Cada pessoa usa seu próprio login, vinculado às empresas autorizadas. Preferências dos históricos e configuração da IA permanecem locais.

## Atualizar a base que você já usa

### Sua base já está no Supabase

1. Sincronize todos os computadores, resolva pendências e exporte um backup em **Dados e backup**. Salve as edições e feche todos os aplicativos.
2. Guarde uma exportação remota verificada. O ensaio `scripts/verificar-migracao-colaboracao.mjs` compara essa cópia em PostgreSQL isolado, incluindo documentos, valores, imagens, versões e reservas.
3. Para uma instalação sem códigos, execute `migrations/004_codigos_cadastros.sql`. Para uma instalação que já executou a versão antiga de 004, execute `migrations/006_corrigir_fk_codigos_cadastros.sql` após verificar o dump remoto. A 006 troca apenas a chave estrangeira de códigos para `empresas(id)` e aborta diante de empresas órfãs; é idempotente. Não execute novamente o esquema inicial.
4. Na passagem de um protocolo anterior para o protocolo 3, a migração autorizada organiza a numeração dos documentos atuais de 1 em diante por tipo, registrando mapa e novas versões. Preserva chaves técnicas, pagamentos, imagens e versões antigas com os números anteriores. A conta atual torna-se o primeiro membro. Reexecutar o script não repete a renumeração.
5. Atualize **todos os computadores para a mesma versão** antes de editar. O SQLite local migra automaticamente para o esquema 14, com backup verificado anterior à mudança.
6. Abra a versão atualizada com o mesmo usuário do Windows. A base e a sessão existentes continuam na pasta de dados. Confira **0 alterações aguardando envio**, ausência de conflitos e **Tempo real conectado**. Confira documentos e números nos históricos. Se houver operações antigas preservadas, revise a atualização antes de adotar a base; não serão enviadas automaticamente.

Um erro no SQL deve reverter a transação. Não execute novamente o esquema antigo após concluir a migração. Restauração local e restauração da nuvem são operações distintas: preserve os backups e investigue o erro antes de publicar dados.

### Sua base ainda é somente local

1. Exporte um backup da base com suas últimas edições, incluindo o candidato que você já usa. Feche o app e atualize no mesmo usuário do Windows. Não restaure um backup antigo sobre a base atual.
2. A migração local cria backup verificado e preserva documentos. Confira clientes, empresa/logo, valores, fotos, recibos e versões. Exporte uma cópia atualizada.
3. Prepare um projeto Supabase **vazio**. No computador com a base correta, escolha **Publicar os dados locais em uma nuvem vazia**. Preserva números oficiais e arquivos de documentos excluídos. Não selecione baixar uma base vazia sobre seus dados.
4. Aguarde e confira documentos e versões. Nos demais computadores, escolha **Baixar a base da empresa**. Dados locais anteriores ficam em backup antes do download.

## Projeto e contas

1. Entre no [painel Supabase](https://supabase.com/dashboard), crie o projeto da empresa e escolha região próxima. Guarde a senha do banco separadamente.
2. Execute **schema-colaboracao.sql completo** em uma nova consulta no SQL Editor, com **Run**. Não é necessário Storage: imagens ficam em Base64 nas tabelas.
3. Em **Authentication → Users**, crie e confirme a primeira conta com e-mail e senha. A senha da conta será digitada no app; não é a senha administrativa do banco.
4. Copie a URL HTTPS e a chave pública **publishable**. Não use chave secret, service_role ou senha do banco no app. Consulte os [tipos de chave](https://supabase.com/docs/guides/getting-started/api-keys).
5. Conecte o primeiro computador e publique a base em uma nuvem vazia. Não use esse modo para substituir uma nuvem já conectada.
6. Para outra pessoa, crie e confirme sua conta em Authentication. No app, um membro atual abre **Configurações → Usuários**, vincula seu e-mail e nome. Essa pessoa conecta com a mesma URL/chave pública e seu próprio login, escolhendo baixar a base.
7. O script configura leitura do canal privado por membros ativos. Em **Realtime → Settings**, prefira somente canais privados. Não é necessário adicionar as tabelas a uma publicação Postgres Changes: o app usa Broadcast. Consulte [Broadcast para mudanças](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) e [autorização Realtime](https://supabase.com/docs/guides/realtime/authorization).

## Onde estão os dados

Em **Table Editor → public**, consulte:

| Tabelas                                                                   | Conteúdo                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| empresas, membros_empresa                                                 | Empresa e pessoas vinculadas                            |
| clientes, servicos                                                        | Clientes e catálogo; apenas nome obrigatório no cliente |
| orcamentos, itens_orcamento, materiais_orcamento, textos_orcamento        | Propostas, valores e condições                          |
| relatorios, itens_relatorio, lancamentos_relatorio, textos_relatorio      | Serviços executados, adiantamentos, reembolsos e saldo  |
| recibos, recebimentos                                                     | Cobranças, recibos e lançamentos, incluindo estornos    |
| imagens, anexos_orcamento, anexos_relatorio                               | Imagens em texto e referências                          |
| documentos, versoes_documentos, imagens_versoes                           | Registros permanentes, snapshots e fotos das versões    |
| numeros_documentos, numeros_emitidos, mapa_numeracao, migracoes_numeracao | Números definitivos e auditoria da organização inicial  |
| autoria_documentos                                                        | Autoria vinculada às chaves técnicas dos documentos     |
| computadores, dispositivos_usuarios                                       | Dispositivos e usuários vinculados                      |
| edicoes_documento, pedidos_edicao, auditoria_colaboracao                  | Controle de edição, solicitações e autoria              |
| observacoes_padrao, formas_pagamento_padrao, configuracoes_empresa        | Padrões comerciais                                      |

Detalhes do transporte ficam no schema **sincronizacao**. **gdo_entities** é uma consulta que reconstrói dados a partir das tabelas, sem outra cópia das imagens. Edite pelo app para manter versões, números e pagamentos consistentes.

## Identificação

- **Nº do documento:** único identificador visível, com sequência independente por empresa e tipo. O servidor confirma o número ao aceitar o primeiro salvamento.
- **Chave técnica:** oculta e permanente; mantém os vínculos entre documentos, imagens, pagamentos e versões.
- **Numeração dos documentos:** mostra último número atribuído e próximo previsto. Avançar a sequência cria um salto intencional. Rascunhos podem receber correções validadas; números emitidos ficam protegidos.
- Documentos novos offline ficam **Aguardando numeração**. Podem ser editados e salvos como rascunhos; a emissão oficial aguarda a sincronização.
- A migração para protocolo 3 organiza os documentos atuais de 1 em diante por tipo, cria novas versões e conserva as versões anteriores com os números originais. Depois da migração, exclusões não renumeram os demais documentos.

O protocolo 3 não distribui novas faixas antecipadas. Números utilizados ou abandonados não são reutilizados. Alterar a sequência futura não modifica documentos existentes; excluir um documento não renumera os demais.

## Atualizações e edição

Ao salvar, a operação entra na fila local e é enviada imediatamente. Após confirmação do banco, um aviso pequeno no canal privado dispara consultas nos demais computadores. Texto ainda sendo digitado não é transmitido. A meta é aparecer em até dois segundos com conexão estável; a latência depende da rede e do serviço.

Históricos/cadastros atualizam preservando preferências. Documento aberto sem alterações locais atualiza automaticamente; com alterações não salvas, mostra aviso e preserva o formulário. Reconexão, reinício e renovação da sessão recuperam mudanças. Há consulta incremental de segurança a cada cinco minutos e retentativas breves após falha transitória.

O bloqueio online dura 120 segundos e renova a cada 30 enquanto o editor está aberto. Use **solicitar edição**, **liberar**, **transferir** ou **recuperar controle**. Outra pessoa pode guardar uma cópia de trabalho sem sobrescrever o documento da empresa.

Antes de perder a internet, use **Preparar offline**. Sincroniza conteúdo, fotos e dependências, guarda a revisão de partida e reserva autorização exclusiva de usuário/computador para emissão e operações financeiras. Relatório e recibos relacionados são protegidos em conjunto. A autorização offline continua exclusiva; documentos novos recebem o número definitivo somente ao sincronizar.

Recuperar controle revoga a geração anterior no servidor. Um computador desconectado descobre a revogação ao reconectar; seu trabalho fica como rascunho para comparar ou copiar. A recuperação não libera números já utilizados para reutilização.

## Conflitos e pagamentos

Compare o rascunho com a base e com a versão atual. Mudanças independentes de conteúdo são combinadas; disputas no mesmo campo exigem escolha. Alterações de preço são comparadas em conjunto para manter quantidade, valor e cálculo coerentes. Retomar versão antiga cria nova revisão, preservando as posteriores.

Pagamentos, estornos e quitação não são restaurados por uma versão textual. Use **Revisar recebimentos** no editor para conferir operações e escolher reaplicar o que continua pendente ou arquivar a intenção local. Valores/vínculos divergentes bloqueiam reaplicação; operações já confirmadas não são contabilizadas novamente. Backup, rascunho e auditoria preservam o trabalho anterior.

## Capacidade e backups

O plano Free oferece 500 MB de banco; pouca atividade pode pausar projetos. Limites podem mudar: consulte [capacidade](https://supabase.com/docs/guides/platform/billing-on-supabase) e [pausa](https://supabase.com/docs/guides/platform/free-project-pausing).

Base64 acrescenta cerca de um terço aos bytes originais. Fotos novas são comprimidas/deduplicadas. O app alerta em 80% e 90% e não apaga versões automaticamente.

Backups incluem documentos, imagens, versões, recebimentos, rascunhos, chaves técnicas e preferências locais. Não transportam sessão, dispositivo, bloqueios ou autorização offline. Operações não confirmadas são preservadas na auditoria do backup, sem republicação automática ao restaurar ou mesclar. Restaurar não publica nem substitui automaticamente a nuvem. Guarde a cópia anterior à migração e teste restauração em perfil separado.

## Conferência entre computadores

Use dois logins vinculados e dois computadores atualizados. Salve uma alteração e confira o outro histórico; teste documento limpo e formulário alterado. Teste solicitação, transferência, preparação offline, reconexão e conciliação. Faça pagamentos de teste em base separada para evitar consumo de números e registros financeiros na empresa.

Se o canal estiver indisponível, fila e recuperação periódica continuam. Se o projeto estiver pausado, reative-o no painel. Para confirmar toda a base na nuvem, confira zero pendências, ausência de erros/conflitos e comparação de documentos, valores, versões, imagens e recebimentos.

# Atualização do candidato 1.5.0-rc.9

Antes de instalar o rc.9 nos computadores, abra uma consulta no SQL Editor do
projeto e execute `migrations/004_codigos_cadastros.sql`. Essa etapa adiciona os
códigos de clientes e serviços e mantém o protocolo de sincronização atual. O
arquivo está junto do instalador em `supabase/migrations`.

Depois de confirmar que o backup da empresa está restaurável, execute
`migrations/005_reconciliar_numero_recibos_teste.sql` uma única vez. A operação
procura somente o recibo identificado como `TESTE-RELEASE-20261014`, exige que
ele esteja excluído, sem recebimento e sem emissão. Antes de liberar o número,
verifica se há outros números atribuídos ou reservas que impeçam o próximo
recibo 000002. Em caso de dúvida, o SQL falha e a transação não altera a sequência.
Confira a linha de auditoria retornada pelo SQL Editor antes de instalar o
candidato. Os próximos números esperados são orçamento 000018, relatório 000005
e recibo 000002, desde que a auditoria da nuvem confirme esses estados.

## Reparar a sincronização de clientes e serviços após a migração central

Depois de corrigir a chave com 006, a migração incremental
`migrations/007_padroes_empresa_e_codigo_servico.sql` atualiza o delta para entregar
os códigos canônicos de clientes e serviços, inclusive cadastros antigos, e cria
os padrões somente quando uma empresa nova é criada. Exige backup recuperável e
ensaio isolado. Não recria padrões excluídos nem altera registros existentes.
O aplicativo reconfere códigos antigos sem sobrescrever operações locais pendentes.
Evidências da aplicação e procedimento de reversão: `docs/historico/VALIDACAO-RC11-CORRECOES.md`.

Em projetos que executaram a versão anterior de `004_codigos_cadastros.sql`, a
chave `codigos_cadastros_empresa_id_fkey` pode apontar para `auth.users(id)`.
O serviço central grava o UUID de `empresas(id)`, que pode ser diferente do UUID
do usuário. Isso provoca erro `23503` e mantém clientes e serviços na fila local.

Antes de qualquer SQL, gere um dump completo do PostgreSQL com `pg_dump`,
confira o arquivo com `pg_restore --list` e faça uma restauração de ensaio em
PostgreSQL isolado. Compare a contagem de códigos, clientes, serviços,
documentos, operações e revisões. O plano Free do Supabase não oferece backup
agendado no painel; a exportação local do aplicativo não substitui o dump
remoto. Feche os aplicativos durante a mudança. Confira no catálogo do banco
que a chave ainda aponta para `auth.users`, examine códigos órfãos e então
execute `migrations/006_corrigir_fk_codigos_cadastros.sql` em transação.
Confirme depois que a chave aponta para `empresas`, que as contagens não
mudaram e que um cliente e serviço novos na empresa de teste chegam ao outro
computador. Reenvie pela tela de Sincronização as operações que ficaram em
falha, sem apagá-las. Em caso de problema, pare os clientes e restaure o dump
isolado para análise antes de qualquer reversão na base ativa.

## Retorno dos links de troca de e-mail

Em Authentication → Providers → Email, desative **Secure email change**. No
modelo de e-mail de troca, inclua `{{ .Token }}`. O aplicativo exige a senha
atual, envia o código somente ao novo endereço e confirma o código dentro de
**Minha conta**. Mantenha habilitada a notificação de segurança para o endereço
anterior. O protocolo `geradororcamento://auth/email-change` continua apenas
para concluir links antigos que já tenham sido emitidos; novas trocas não usam
link nem expõem token à interface.

## Acesso global do Operador do Sistema

`migrations/009_operador_acesso_global.sql` permite que a conta registrada em
`central.operadores` liste e administre todas as empresas, inclusive sem vínculo
em `membros_empresa`. A função `sincronizacao.membro` continua limitando os
demais usuários aos vínculos ativos. A criação de empresa permanece autorizada
somente pela RPC de convite, que exige a conta de operador.

`migrations/010_operador_protegido_e_excluir_empresa.sql` restringe a tabela a
um único operador, impede que ele seja tratado como membro comum ou tenha o
papel global rebaixado, e cria a exclusão transacional de empresas. A operação
é exposta somente pela Edge Function autenticada `central-contas`; o marcador
`central.empresas_excluidas` bloqueia o reenvio de dados por perfis offline.
Publique a função atualizada junto com a migração. Antes de usar a exclusão numa
empresa com dados, confirme a identidade da empresa e faça a cópia recuperável
prevista para esse ambiente.

Antes de aplicar 009 em um projeto existente, crie um dump PostgreSQL novo,
valide-o com `pg_restore --list` e faça uma restauração isolada. Confira as
políticas RLS e a política de mensagens realtime efetivas. Teste em PostgreSQL
isolado que o operador lista e acessa empresas sem vínculo, que um usuário comum
vê somente sua empresa e que a criação continua restrita ao operador. A migração
não altera os registros de empresas nem de membros.

## Atualização rc.16

Após as migrações 009 e 010, aplicar `011_sessao_edicao_e_isolamento.sql`. A migração mantém as contas Auth e não exclui empresas. Publicar também a versão correspondente de `central-contas`. Validar o backup e o ensaio isolado antes da aplicação remota.

Depois de 011, aplicar `012_geracao_manutencao_empresa.sql`. A geração inicia em zero sem reorganizar dados. Para manutenção autorizada, adquirir `pg_advisory_xact_lock(hashtextextended(empresa_id::text,0))`, incrementar a geração e marcar `em_manutencao=true` antes da transação de reorganização; liberar a manutenção apenas depois das conferências. As cópias antigas precisarão de restauração com backup escolhido pelo usuário. Reverter o código do aplicativo sem essa proteção após reorganizar dados não é permitido: mantenha o bloqueio de gravações até atualizar todas as cópias.
