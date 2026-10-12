# Candidato 1.5.0-rc.1 — execução

Plano aprovado em 12/10/2026. Implementar na claude; base real protegida, sem
migração remota, merge ou instalação final antes da revisão e autorização.

## Requisitos confirmados

- Chave técnica preservada; ID interno permanente por empresa/tipo atribuído pelo
  servidor; Ordem calculada conforme filtros, ordenação e paginação. Ambos visíveis
  por padrão. Não alterar números oficiais, valores, descrições ou versões antigas.
- Supabase Broadcast privado após salvar, meta de dois segundos com rede estável.
  SQLite e fila idempotente duráveis, recuperação incremental, reconexão, sessão
  protegida, consulta de segurança a cada cinco minutos. Telas atualizadas por IPC,
  sem sobrescrever formulários com alterações locais.
- Empresa separada do login; membros individuais com acesso completo; não remover
  último membro. Contas criadas em Authentication, vinculadas pelo aplicativo.
- Edição online com bloqueio de 120 segundos renovado a cada 30; preparação offline
  explícita; autorização de emissão/financeiro exclusiva por usuário e computador;
  rascunhos derivados para demais membros; comparação de três versões e conciliação
  sem sobrescrever pagamentos. Solicitar/liberar/transferir/recuperar com geração de
  autorização validada pelo servidor e registro do ator.
- Configuração de números oficiais futuros e rascunhos segura, sem reutilização.
- Configurações com largura/alinhamento e componentes iguais a históricos e Cadastros;
  manter padrão em todas as áreas novas, inclusive carregamento, erros e botões.
- Backup verificado pré-migração, ensaio em cópia atualizada, contratos tipados,
  protocolo novo obrigatório para escrita, testes multiusuário/multicomputador,
  pacote candidato em perfil separado. Commitar cada etapa validada na claude.

## Etapas

1. Migração SQLite, tipos, eventos e identificação dos históricos.
2. Empresa/membros, protocolo e SQL transacional, permissões e controles de edição.
3. Serviço de tempo real e atualização das telas sem perda de edições.
4. Preparação offline, rascunhos, comparação/conciliação e controles de numeração.
5. Interface padronizada, teste real do candidato, documentação e pacote.

## Estado inicial

Versão 1.4.1, branches claude/main em 6ad6803; 158 testes previamente aprovados.
SQLite esquema 8. Sincronização por consulta a cada 30 segundos, conta = empresa,
responsabilidade permanente por computador, sem eventos de atualização da interface.
Nuvem já relacional, preserva documentos excluídos, versões e imagens deduplicadas.

Base real foi conferida somente por leitura no planejamento: 17 propostas (1–17),
4 relatórios (1–4), 3 recibos ativos (4,5,6; recebido/cancelado/recebido), 54 versões,
zero pendências/conflitos. Ela mudou desde o backup da 1.4.1: capturar nova cópia antes
da validação final, sem usar o backup anterior como se fosse a base atual.

## Progresso

- 34b7bdc: etapa 1. Esquema 9, cache dos IDs internos, rascunhos/autorizações/auditoria,
  Ordem e ID interno nos históricos, IPC de eventos e largura full de Configurações.
  Verificação completa passou com 158 testes; três testes adicionais de migração
  passaram (161 no total). IDs locais aguardam atribuição pela nuvem.
- Camada SQL de colaboração implementada separadamente em `supabase/colaboracao.sql`;
  gerador produz `schema-colaboracao.sql` transacional, incluindo esquema relacional.
  `schema.sql` permanece como referência do protocolo antigo para os testes existentes.
  Seis testes PostgreSQL v2 passaram: migração de IDs sem alterar valores/números,
  dois logins na mesma empresa, usuário externo isolado, bloqueio/offline/recuperação,
  idempotência, rejeição de escrita antiga/direta, último membro e sequência protegida.
- Não foi executado SQL remoto. O app ainda não usa as rotas v2 nem WebSocket.
  Restam integração do cliente, SDK, bloqueios/rascunhos/conciliador, UI de usuários,
  atualizações de editores, backup de autorizações/rascunhos, testes reais e candidato.

## Integração v2 a completar

- Contexto via `gdo_contexto_v2(p_criar)`; resolve empresa pelo membro ativo, nunca
  pela conta como empresa. `gdo_dispositivo_v2` associa dispositivo a usuário.
- Leituras via `gdo_alteracoes_v2(p_cursor,p_limite)` retornam envelopes antigos mais
  `identificador`. Aplicar cache de IDs mesmo se a revisão do conteúdo já for conhecida.
- Escrita `gdo_batch_v2(p_operacoes,p_dispositivo)` requer `geracao` em cada operação
  de documento existente. Novos documentos ganham ID e bloqueio automaticamente.
- Endpoints de membros/edição/numeração/reservas/bootstrap já existem no SQL v2.
  Renovação 30s, validade 120s, autorização offline não expira por falta de conexão.
  Reaquisição própria é idempotente. Geração velha rejeitada após recuperação.
- Reservas numéricas de documentos já atribuídos podem ser usadas por outro membro
  autorizado; reservas ainda não utilizadas continuam exclusivas do dispositivo.
- Canal privado `empresa:<empresaId>`, evento `alteracao`, payload só `{alterado:true}`.
  RLS para membros ativos; fonte é trigger transacional. PGlite simula `realtime.send`.
- Pacote deve incluir e copiar `schema-colaboracao.sql`, não o schema antigo. Protocolos
  antigos ficam sem escrita após migração. Adaptar simulador REST dos testes ao v2,
  mantendo testes antigos de domínio como regressão da migração v1.

### Integração em andamento (após 1d2700c)

- Serviço SDK `tempo-real.ts` criado, canal privado, reconexão pela biblioteca,
  consulta de segurança 5 min e agendador serial que não perde avisos durante a consulta.
  Dois testes próprios passaram. `index.ts` inicia negociação e encerra o canal no quit.
- `nuvem.ts` negocia `gdo_contexto_v2`, guarda empresa/login separados, aceita outros
  logins da mesma empresa e associa computador por usuário; mantém transição v1 apenas
  quando servidor responde PGRST202 (servidor v2 revoga as escritas v1). Teste legado
  simula corretamente esse erro; não usa o v2 novo ainda.
- Rotas v2 de envio, leitura, dispositivo, reserva e bootstrap ligadas ao cliente.
  Cache de IDs aplicado mesmo para revisões já conhecidas. `geracao` e `grupo` capturados
  na fila no salvamento, não obtidos da autorização atual no envio.
- `colaboracao.ts` expõe membros e controle de edição, guarda controles/auditoria no
  SQLite. IPC autoriza antes de update/remove/número/confirmar/cancelar, incluindo relatório
  relacionado. Renovação cada 30s. `exigirResponsavel` usa controles v2 quando negociados.
- Configuração de outra empresa continua recusada; troca de usuário com fila pendente
  recusada. Falha de login restaura configuração anterior. Backup retira controles de edição
  e contexto/sessão/identidade novos, preserva rascunhos e IDs.
- Históricos de propostas/relatórios e cadastros inscritos nos eventos; faltam recibos,
  editores com proteção de formulários e status da nuvem/usuários/edição na interface.
- Verificação completa passou com 169 testes antes dos últimos ajustes de autoria/backup;
  depois passaram 31 testes direcionados e tipos. Novas versões carregam ator/nome; comparação
  de conteúdo ignora metadados de autoria/ID/PC para não gerar versões idênticas.

Pontos críticos restantes: testar cliente v2 com dois usuários/perfis usando as rotas reais;
separar envio por grupo (hoje batch único, embora grupo já esteja na fila), manter recuperação
de outros documentos quando existe conflito (hoje trava global ainda antiga); manter gerações
novas retornadas após primeiro save; reservas por usuário/PC não podem herdar blocos da conta
anterior no mesmo perfil; edição offline e rascunhos/merge de três versões ainda incompletos;
autorizar exportação e proteger números já exportados no servidor; SDK não foi testado com
WebSocket real. UI Configurações precisa padronizar as seções e incluir usuários/controle.
Pacote ainda 1.4.1, não foi gerado candidato novo nem tocada base real. Atualizar para rc.1
somente quando componentes estiverem integrados. Guia/extraResources/cópiaSQL devem usar v2.

### Cliente v2 integrado e ensaiado (após b1db37a)

- Fila enviada por grupo transacional; conflito v2 não paralisa grupos independentes.
  Download não sobrescreve documentos com operações pendentes; versões locais ficam
  preservadas. Gerações fixadas por operação continuam válidas após renovação e rejeitadas
  após revogação. Lease e ID chegam no envelope v2; controles também consultados por
  endpoint próprio a cada passagem, pois mudanças de lease não alteram revisão do conteúdo.
- Autorizar gravação aguarda a primeira publicação quando necessário. Startup negocia
  contexto antes de ativar canal. Authoriza edição por usuário/PC e gerações no servidor.
- Teste `colaboracao-integracao.test.ts` usa dois perfis SQLite, dois logins, funções v2
  reais PostgreSQL com papel authenticated e transporte HTTP simulado. Três cenários
  passaram: publicação/download/ID igual; troca de edição e autoria B; offline com fila
  presa à geração antiga, recuperação por A e conflito preservando conteúdo B.
- Não comprova WebSocket nem meta de dois segundos: SDK é mockado neste teste para não
  contactar serviço externo. Restam teste local com socket real e validação Supabase
  real após revisão/configuração SQL; não afirmar essas etapas concluídas.

### Rascunhos e conciliação (trabalho posterior a 780ae15)

- `shared/conciliacao.ts`: merge de base/local/remoto, listas por ID e ordem separada,
  escolhas explícitas para disputas, metadados técnicos sempre da versão atual. Cinco
  testes passaram. Snapshots não repetem Base64, preservam hashes de imagens/logos.
- `main/rascunhos.ts`: create/list/get/save/comparar/aplicar/copiar/remove e IPC/preload/
  mocks ligados. Comparação consulta `gdo_documento_v2` diretamente e exige revisão
  esperada na aplicação. Recibos confirmados e mudanças financeiras não podem ser
  aplicados como texto; transações relacionadas pendentes também bloqueiam aplicação.
- Antes de adotar remoto, aplicação exporta backup, preserva rascunho, limpa somente
  fila/conflito do documento isolado, repõe versões canônicas e cria nova revisão.
  Marca aplicado só depois de confirmação do envio; falha preserva o rascunho.
- SQLite v9 agora também tem `bases_documento` com snapshot canônico aceito. Cache não
  muda enquanto há fila do documento. Rascunho usa essa base (não o formulário pendente);
  documentos inéditos usam primeira versão como base. Autorização permite continuar um
  documento novo ainda não publicado; SQL aceita geração nula só na geração inicial,
  para criador/PC iguais. Recuperação sempre invalida essas operações.
- Novo teste integrado aplica rascunho de B após A liberar a edição, sem alterar número,
  ID, valor, descrição nem criar recebimento. Quatro casos de integração passaram.
- Reservas v2 agora são recuperadas do servidor por dispositivo; troca de login limpa
  cache local para não usar reservas do usuário anterior. Teste REST adapta esse endpoint.
- Tipos e lint passaram. Faltam interface de rascunhos e três editores, recuperação
  automática do rascunho de operações em conflito e garantia do conjunto financeiro
  offline no servidor (controle atual ainda tem verificação parcial de relacionados).

Riscos/pontos seguintes: `financeiroAlterado` hoje bloqueia qualquer status em rascunho,
inclusive propostas, deve limitar aos estados/operações financeiros apropriados; preparar
offline deve verificar/deixar local imagens necessárias; proteger exportações e números
emitidos e implementar controles de números futuros/drafts na UI; usuário solicita edição
mas ainda falta mostrar pedido ao possuidor. Usuários e UI colaborativa não implementadas.
Configurações só está com largura full e título Numeração dos documentos; restante das
seções precisa conferência/padronização visual. UI antiga de transferir continua no LinhaTempo
e precisa trocar pelo controle v2. Nenhum pacote novo, base real e SQL remoto intactos.

### Interfaces e garantias integradas (etapa posterior a fc33e47)

- Usuários com tabela, busca e vínculo de contas existentes; controles de editor,
  rascunhos locais, comparação de três versões e alternativas como novo documento.
  Retomar uma versão v2 abre rascunho. Operações financeiras ficam fora desse fluxo.
- Editores limpos recebem atualizações; formulários alterados mostram aviso sem perder
  conteúdo. Respostas assíncronas de documento anterior são descartadas. Históricos de
  recibos, status e membros observam eventos. Bloqueio renova apenas com editor aberto;
  encerramento tenta liberar, com expiração automática se não houver conexão.
- Preparação offline reserva o conjunto relatório/recibos; aquisição/recebimento respeita
  essa exclusividade. Recuperação revoga todas as gerações relacionadas. Verificação local
  de dependências e hashes antes de preparar; cache dos controles relacionado é baixado.
- Conflitos de operações geram rascunhos automaticamente. A conciliação legada por
  sobrescrita de conjunto financeiro fica bloqueada no protocolo v2. Ainda falta a
  revisão explícita de operações financeiras pendentes após conflito de geração.
- Números emitidos protegidos em SQLite/PostgreSQL, inclusive após voltar ao rascunho.
  Correção de rascunhos usa reservas próprias; recibos agora têm API e campo de número.
  Configurações ajustam faixas futuras transacionalmente, mantendo reservas anteriores.
- Pedidos de edição são persistidos e mostrados ao possuidor. Auditoria não cresce a
  cada renovação de 30s. Estado do cliente é separado de posse permanente antiga.
- Configurações: largura full; salvar no cabeçalho de Empresa/Parâmetros/IA; selects e
  espaçamentos compartilhados; observações/pagamentos com tabela, filtros, alça e modal,
  mesmo padrão de Cadastros. Conferência visual do executável ainda pendente.
- Verificação completa passou: 181 testes/31 arquivos, lint, formato, tipos e build.
  Nenhuma modificação no banco de uso nem no Supabase real; ainda não há pacote 1.5.

Novo pedido: publicar no GitHub **depois de concluir/validar**, repositório privado
`gerador-de-orcamento`, autorizado explicitamente. Git usa credential manager, não há
remote e `gh` não está instalado. Validar credencial sem imprimir tokens, instalar CLI
se necessário, auditar arquivos/histórico e ignorar bancos/backups antes de publicar.

Próximos pontos: WebSocket real com SDK (meta 2s), testes financeiros de confirmação/
estorno após revogação, auditoria UI/responsividade e bloqueio de alterações não salvas,
backup/mesclagem de tabelas v9, cópia atualizada da base (17/4/3 ativos e 54 versões na
última leitura), pacote/guia v2 e candidato 1.5.0-rc.1. Não fazer migração real nem merge
main nem versão final antes da revisão e autorização desta nova entrega.
