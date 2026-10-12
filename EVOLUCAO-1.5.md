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
