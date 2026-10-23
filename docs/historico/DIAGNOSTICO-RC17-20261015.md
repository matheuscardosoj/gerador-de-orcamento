# Diagnóstico da rc.17 — 15/10/2026

## Evidência anterior à correção remota

- O projeto conectado pelo Supabase MCP é `ibqskynfmrbxknwqjnon`.
- A Edge Function `central-contas` publicada está na versão 2 e não implementa `capacidades` nem `excluirEmpresa`. Requisições a essa função receberam HTTP 400 no período da falha mostrada pelo usuário. A rotina SQL `public.gdo_excluir_empresa(uuid,uuid)` e a tabela `central.empresas_excluidas` também não existem no banco remoto. Portanto, a exclusão não pode funcionar na implantação atual. O código local da função e as migrações 010/011/012 ainda precisam de publicação/aplicação.
- A empresa de teste `TESTE` tem ID `5defbb10-5e51-4a7a-b4cb-10662a0e5680`, dois dispositivos registrados e zero membros ativos. D-MATHEUS usa `dc524ba1-80d4-4968-bcc2-1342c5fd8e09` e N-MATHEUS usa `47300b88-c290-481b-8634-00e1e4eaa25e`. Os UUIDs são diferentes.
- A função remota `gdo_edicao_v2` só transfere o controle a um destino que esteja em `membros_empresa` como ativo. Ela também monta a lista de solicitações com `JOIN membros_empresa`, descartando pedidos do Operador do Sistema. A migração local 011 corrige ambos os pontos, mas não está aplicada remotamente.
- A visão `gdo_devices` inclui dispositivos de todas as empresas acessíveis ao operador. Existem sete registros no banco, dos quais apenas dois pertencem à TESTE. A consulta local foi restringida à empresa ativa para eliminar destinos ambíguos.
- As consultas frequentes `gdo_contexto_v4`, `gdo_edicao_v3` e `gdo_alteracoes_v3` tiveram média de execução no banco de aproximadamente 3,5 ms, 6 ms e 6,2 ms no `pg_stat_statements`. Isso não mede rede nem tempo da aplicação. A inicialização espera a nuvem antes de criar a janela; o encerramento liberava sequencialmente controles locais já vencidos. O último ponto foi corrigido localmente.

## Alterações locais desta investigação

- `encerrarEdicoesConta` só tenta liberar controles online ainda válidos.
- `dispositivosNuvem` filtra `gdo_devices` pelo ID da empresa ativa.
- Falhas da exclusão registram status e código em log técnico local; o usuário recebe mensagem segura.
- `npm run check` passou: lint, Prettier, TypeScript, 319 testes em 58 arquivos e build.

## Backup e atualização remota

O dump novo e o ensaio isolado foram concluídos antes da atualização remota. A execução padrão continuou falhando com `CreateProcessSecurityEnvironment 0x80070020`; a execução com `require_escalated` funcionou. A credencial foi lida diretamente do pgpass do Windows, sem exibir ou gravar seu valor em outro arquivo.

As migrações 010/011/012 foram aplicadas primeiro no banco restaurado e ensaiadas contra a estrutura real. Depois foram aplicadas no projeto remoto pelo MCP, na mesma ordem. A função `central-contas` foi publicada na versão 3, ativa, com `verify_jwt=true`. A exclusão está disponível somente ao `service_role`; `anon` e `authenticated` não podem executar a RPC diretamente. As duas empresas e os dois usuários permanecem no banco remoto; TESTE não foi excluída.

## Retomada do backup — 15/10/2026

- Credencial localizada no pgpass do Windows: `%APPDATA%\postgresql\pgpass.conf`; não registrar seu valor.
- Execução padrão bloqueada por `CreateProcessSecurityEnvironment 0x80070020`; execução com `require_escalated` funcionou.
- Dump completo concluído com exit 0: `output/backups/supabase-rc17-20261015-205532.dump`, 9.463.864 bytes, SHA-256 `BF23BFC8A97EC74392329C025CB47E02ADB8CC9DAA5431C18A8FD5A72DDB2C04`.
- `pg_restore --list` leu o arquivo; log e TOC foram preservados ao lado dele.
- Restauração concluída com exit 0 no PostgreSQL 18 local, banco `rc17_restore_complete`, em `127.0.0.1:55437`. Foram restaurados os dados, os papéis necessários, as funções, as permissões e os vínculos entre tabelas. Foram recuperados 54 documentos, 15 imagens, duas empresas e dois usuários.
- Adaptação do ensaio: o PostgreSQL Windows não possui `supabase_vault`. A extensão e suas ACLs foram omitidas apenas da restauração local, e a tabela `vault.secrets` foi recriada para receber seu conteúdo vazio. O dump original não foi filtrado. `vault.secrets` e `storage.objects` têm zero registros no remoto. Isso não ensaia a operação do serviço Vault; os schemas do aplicativo e de autenticação foram restaurados.
- `scripts/ensaio-rc17-restaurado.sql` passou no banco restaurado: solicitação do operador sem membro ativo, transferência entre os UUIDs reais de D/N, rejeição de usuário comum, rollback integral com falha intermediária, exclusão em cascata preservando Auth e a outra empresa, e repetição segura. O script usa rollback e bloqueia execução fora do banco local isolado.

## Correções adicionais de abertura e lentidão

- A janela agora é criada antes de aguardar a recuperação da conta. `conta.status()` aguarda essa recuperação, permitindo mostrar o carregamento sem expor um perfil parcialmente aberto.
- O logout deixa de sincronizar toda a base uma vez para cada controle de edição. Controles online válidos e sem pendências são liberados em paralelo, com prazo de dois segundos por pedido, incluindo a espera por renovação compartilhada. Na falha de rede, o lease expira normalmente; as alterações locais continuam preservadas.
- O receptor global agrupa eventos enquanto uma consulta está em andamento e descarta respostas de uma tela/empresa já encerrada. As dependências do efeito usam o ID da empresa, evitando reiniciar o receptor a cada clone do status.
- Ao abrir o painel pelo aviso, o status da nuvem é consultado novamente antes de carregar computadores. Isso corrige a lista de destinos vazia quando o painel abre antes da primeira consulta do editor.
- O perfil descartável de diagnóstico não registra o protocolo de abertura no Windows, preservando o aplicativo instalado durante o teste do binário.

## Verificações finais desta etapa

- Verificação completa: lint, formatação, TypeScript, **324 testes em 60 arquivos** e build aprovados. A última proteção do perfil de diagnóstico também passou em lint/formatação e novo build.
- `scripts/legado/verificar-rc17-interface.mjs`: aviso recebido enquanto o responsável está em Configurações, persistência além do toast comum, deduplicação, navegação ao documento/painel e transferência ao computador selecionado. Uma rajada de 20 eventos gerou duas consultas. Capturas verificadas em 1024 e 1600 px, sem overflow horizontal ou erro JavaScript. Este é um ensaio com API de demonstração, não um teste real entre D/N.
- O binário empacotado abriu a tela de acesso com perfil isolado e retornou `1.5.0-rc.17` pela API. Os hashes de main, preload e renderer dentro do asar coincidem com o build; as três migrações empacotadas coincidem com os arquivos ensaiados.
- O teste HTTP autenticado de `capacidades` não foi executado: o perfil local atual não tem sessão persistida. Nenhum token foi renovado ou exibido. A função está ativa e a estrutura/permissões foram conferidas pelo MCP.
- Instalador em `output/instalacao-teste-1.5.0-rc.17/`. Tamanho e SHA-256, incluindo a cópia para N-MATHEUS, ficam em `output/backups/rc17-instalador.json`.

## Ainda falta para validação de ponta a ponta

Instalar a rc.17 em D e N, conferir preservação dos dados, medir abertura/logout com a conta real e testar pedido de edição recebido pelo responsável em outra tela, transferência ao UUID selecionado e reconexão. A exclusão permanente da TESTE continua sendo o último teste e exige confirmação imediata do usuário. Não declarar a rc.17 validada até concluir essas verificações reais.

## Retorno do teste real — 15/10/2026

O usuário confirmou que os testes da rc.17 passaram em D/N: instalação, preservação dos dados, abertura/logout, aviso global, transferência nos dois sentidos, salvamentos/toasts e reabertura. Durante alternâncias repetidas de posse, relatou um aviso aparentemente atrasado ou associado ao lado incorreto. A causa dessa ocorrência não foi confirmada; fica registrada como pendência de avisos, sem tratar o cenário como encerrado.

O próximo teste solicitado é a exclusão da empresa TESTE/SLA pelo aplicativo. O alvo remoto confirmado é TESTE, UUID 5defbb10-5e51-4a7a-b4cb-10662a0e5680, com dez documentos e dois computadores. A VS PRESTADORA DE SERVIÇOS tem outro UUID e 44 documentos e será somente conferida em leitura. Um novo dump completo está sendo gerado após os testes. A exclusão permanente depende da confirmação imediatamente anterior do usuário e deve ser exercitada pela interface do Administrador do Sistema.

### Backup imediatamente anterior à exclusão

- Arquivo: `output/backups/supabase-antes-exclusao-teste-20261015-214307.dump`.
- Tamanho: 9.477.959 bytes. SHA-256: `C244856E3837ED0B623B85D8C50D6A8770B62F7DC25CBDDDB5F28E67B5EDB76A`.
- TOC lida; restauração concluída com exit 0 em `rc17_pre_exclusao_20261015`, isolado em localhost. Mesma adaptação documentada para Vault vazio, preservando o dump original integral.
- Ensaio novamente aprovado com os dados atuais: pedidos/transferência, rejeição de usuário comum, falha intermediária com rollback, cascata e repetição segura. Após rollback, TESTE permaneceu com dez documentos e VS com 44. O PostgreSQL isolado foi encerrado.
- Manifesto de conferência em leitura: `output/backups/vs-antes-exclusao-teste.json`; 43 tabelas da empresa VS e identidade dos dois usuários Auth. Consulta reaplicável em `output/backups/verificar-vs-somente-leitura.sql`.
- Nenhuma empresa foi excluída no remoto. Aguardando confirmação imediata do usuário para a exclusão permanente somente de TESTE, a ser exercitada pelo botão do aplicativo, seguida da verificação remota e da reconexão em D/N.
