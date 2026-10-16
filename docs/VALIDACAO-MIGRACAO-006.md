# Validação da migração 006 — 14/10/2026

## Escopo

Projeto Supabase `ibqskynfmrbxknwqjnon` (branch remota `main`, que também contém empresas reais). Migração exata: [`supabase/migrations/006_corrigir_fk_codigos_cadastros.sql`](../supabase/migrations/006_corrigir_fk_codigos_cadastros.sql).

## Backup anterior à mudança

- Cópia de entrega: `output/backup-privado-supabase-20261014/supabase-pre-006-20261014-083918.dump` (dentro do projeto, ignorada pelo Git). O manifesto JSON está na mesma pasta.
- A cópia original criada pelo terminal em `%LOCALAPPDATA%\GeradorOrcamentos\backups` ficou na área isolada do Codex e não aparece no Explorador do usuário. Não use esse caminho como endereço de recuperação.
- Tamanho: 9.278.711 bytes; arquivo customizado do `pg_dump` 18.6, origem PostgreSQL 17.11.
- SHA-256: `71D22A29BB92DC79C923793ACBA62BBF7F744A62C856D7AC5E2C45E0F3BB8A90`.
- A cópia de entrega foi comparada com o original por SHA-256 e seu catálogo foi lido novamente com `pg_restore --list`. O arquivo contém dados reais: mantenha-o protegido e fora de commits, compartilhamentos e instaladores.
- Uma restauração isolada dos esquemas `auth`, `public` e `sincronizacao` (estrutura anterior aos índices/políticas e dados) em PostgreSQL 18 UTF-8 terminou sem erro. As contagens restauradas coincidiram com a origem: 15 códigos, 11 clientes, 4 serviços, 2 empresas, 374 operações, 88 entidades, 4 usuários e nenhum código órfão.
- A restauração **integral** do dump em PostgreSQL puro não foi possível porque a extensão gerenciada `supabase_vault` não está instalada fora do Supabase. Portanto, este ensaio comprova a recuperação dos dados usados pelo aplicativo, mas não a reprodução completa da plataforma Supabase.

## Migração e verificação

Antes da mudança, `codigos_cadastros_empresa_id_fkey` referenciava `auth.users(id)`. `empresas(id)` tinha chave primária e não havia códigos órfãos. A migração 006 foi executada em transação e confirmou `COMMIT`. Depois, a chave referenciou `empresas(id)` com `DEFERRABLE INITIALLY DEFERRED`; as contagens de códigos, clientes e serviços permaneceram em 15, 11 e 4.

No banco restaurado isolado, a migração preservou os 15 códigos e criou a mesma referência. No projeto remoto, um cliente e um serviço foram inseridos **somente dentro de uma transação na empresa descartável**, os gatilhos geraram seus códigos e a transação terminou com `ROLLBACK`. A conferência posterior encontrou zero IDs de auditoria persistentes e as mesmas contagens iniciais.

## Recuperação se surgir problema

1. Pare a sincronização nos computadores e preserve filas e bancos locais; não repita o esquema inicial nem descarte operações pendentes.
2. Leia o erro e compare a chave e as contagens com os valores acima. A transação 006 não altera os registros de códigos; voltar a chave para `auth.users` recria a falha de empresas com IDs diferentes.
3. Para recuperar dados, restaure o dump **primeiro em um ambiente Supabase isolado**, compare os registros e funções envolvidos e prepare um plano de restauração seletiva. Não execute `pg_restore --clean` contra o projeto ativo.
4. Como o projeto está no plano Free, sem backup gerenciado no painel, uma reversão integral na base ativa exige ensaio específico e janela de manutenção. Use a cópia de entrega em `output/backup-privado-supabase-20261014` e confira seu SHA-256 antes desse procedimento. A visibilidade dessa pasta no Explorador do usuário ainda precisa ser confirmada fora do terminal do Codex.

## Validações ainda pendentes

O teste entre dois computadores com o aplicativo instalado, o reenvio das operações antigas da fila e o retorno real de dois links de troca de e-mail dependem da versão atualizada nos computadores e de uma conta descartável. O teste de transação confirmou o bloqueio de chave estrangeira, mas não substitui esses fluxos de ponta a ponta.

## Candidato instalável

O instalador de teste `release/Gerador de Orçamentos Setup 1.5.0-rc.11.exe` foi gerado em 14/10/2026 após aprovação específica. O comando `npm run check` passou com 50 arquivos de teste e 287 testes; `npm run dist` terminou com código 0. O instalador tem 1.222.594.155 bytes e SHA-256 `6B685FAE85DB1AB818211E76A595AAE20F29B39D1B5BD713A640E08DCC8B7021`. O pacote inclui `006_corrigir_fk_codigos_cadastros.sql` e o runtime de IA; a pasta `output/` com o dump privado ficou fora. O executável não tem assinatura Authenticode. A geração e a inspeção estática do pacote não substituem instalação e teste dos fluxos em dois computadores.

## Área isolada do terminal

A instância PostgreSQL de ensaio foi parada. O diretório `restore-test-20261014-084142` contém uma cópia dos dados restaurados e uma senha apenas da instância local de ensaio. O terminal do Codex consegue vê-lo em `%LOCALAPPDATA%\GeradorOrcamentos`, mas o Explorador do usuário confirmou que **não** consegue acessar esse caminho. A revisão automática de comandos bloqueou a exclusão do diretório e a remoção isolada do arquivo de senha. Não peça ao usuário para apagar essa pasta pelo Explorador; a limpeza depende de um meio autorizado que alcance a área isolada.
