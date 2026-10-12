# Migração da nuvem para tabelas de domínio

Solicitada em 12/10/2026, após a publicação conferida da base correta: 10 clientes,
17 propostas, 4 relatórios, 15 imagens, 38 versões e um recebimento estornado.

## Escopo

- Tabelas de domínio em `public`, com campos consultáveis, chaves compostas por
  empresa e relações protegidas contra vínculos entre empresas.
- Dados técnicos de sincronização em `sincronizacao`; a consulta compatível
  `gdo_entities` será reconstruída a partir das tabelas. Sem segunda cópia das fotos
  ou de todos os documentos em pacotes JSON.
- JSON reservado a configurações, cálculos e snapshots históricos. Campos principais
  de clientes e recibos serão consultáveis; preservação dos campos opcionais antigos.
- Compatibilidade com IPC, SQLite, operações idempotentes, conflitos, reservas,
  transferência e pagamentos transacionais da versão 1.4.0 instalada.
- Migração transacional das entidades existentes, com verificação do conteúdo
  antes da retirada do armazenamento genérico e reexecução segura.
- RLS nas tabelas e consulta compatível, escrita exclusivamente pelas funções
  autorizadas. Histórico e pagamentos de documentos excluídos preservados.

## Entrega e validação

1. Implementar e testar o esquema/migração em PostgreSQL isolado.
2. Exercitar migração da cópia da base real, isolamento, sincronização entre perfis,
   interrupções/reenvios, pagamento/estorno, exclusão e transferência.
3. Atualizar guia e pacote, commitar na `claude`.
4. Preservar backup local e remoto atualizado e disponibilizar script validado para
   execução pelo proprietário no SQL Editor. Nenhuma credencial administrativa.
5. Conferir a nuvem real e reinício da versão instalada após a migração.

Implementação e migração em cópia concluídas. A verificação completa passou com
151 testes, verificações estáticas e compilação; o teste adicional de gravação com
o papel autenticado também passou, com tipos, formatação e análise estática,
totalizando 152 testes validados. A cópia real com 69 entidades foi migrada e
comparada integralmente, incluindo 71 vínculos de imagens históricas.

## Conferência da nuvem real

O proprietário executou o script no SQL Editor. Em **12/10/2026 às 01:58:52
(America/Sao_Paulo)**, a comparação remota autenticada confirmou:

- 10 clientes, 17 propostas, 4 relatórios, 15 imagens, 38 versões e um recebimento
  estornado, sem diferenças nos conteúdos, valores, números ou referências.
- 71 vínculos de imagens históricas, um computador e 78 números reservados/utilizados.
- Metadados e histórico de seis propostas, um relatório e três recibos excluídos
  preservados; nenhum recibo ativo.
- Zero alterações pendentes e zero conflitos após reabrir e sincronizar a versão
  1.4.0 instalada. As tabelas de domínio foram consultadas diretamente pela API
  autenticada, além da consulta compatível usada pelo aplicativo.

O guia e o script de configuração da instalação foram atualizados e conferidos
por hash, preservando cópia dos recursos anteriores. Os backups local e remoto
anteriores à migração continuam guardados. A conferência utilizou uma cópia local
e consultas remotas de leitura; a sessão foi decifrada somente em memória.

Não foi registrado outro computador real nesta etapa. A sincronização entre dois
perfis, reenvios, pagamentos e transferência foram validados nos testes integrados
com PostgreSQL isolado. O proprietário autorizou o merge para `main` e a geração
do instalador 1.4.1. A verificação completa desta versão passou com 152 testes,
análise estática, formatação, tipos e compilação.
