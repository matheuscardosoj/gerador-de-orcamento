# Organização do aplicativo

O projeto mantém as fronteiras do Electron e módulos por responsabilidade. Não
introduz uma camada MVC artificial entre React e os serviços locais.

| Diretório                     | Responsabilidade                                                  |
| ----------------------------- | ----------------------------------------------------------------- |
| `src/shared`                  | Contratos, validação e regras puras compartilhadas                |
| `src/renderer/src/ui`         | Componentes visuais, tabelas, campos e modais padrão              |
| `src/renderer/src/pages`      | Telas e composição de fluxos de usuário                           |
| `src/renderer/src/components` | Componentes reutilizados entre telas                              |
| `src/main/contas`             | Autenticação, perfis locais e autorização de acesso               |
| `src/main/repositories`       | Persistência por domínio (orçamentos, relatórios, clientes…)      |
| `src/main/db`                 | SQLite, migrações e testes de integração com bases isoladas       |
| `src/main`                    | Serviços de documentos, sincronização, IA e operações financeiras |
| `src/preload`                 | Ponte tipada; não expõe acesso genérico ao Electron               |
| `supabase/central`            | Migração e configuração do serviço de várias empresas             |
| `supabase/functions`          | Operações que exigem credenciais administrativas no servidor      |
| `scripts`                     | Build e ferramentas de validação, sem dados de produção           |

## Regras para mudanças

- Preferir os componentes existentes a novos estilos específicos de uma página.
- Repositórios cuidam de persistência; renderer não acessa SQL, tokens ou senhas SMTP.
- Autorizações precisam existir no servidor; esconder botões não basta.
- Perfis são separados por projeto, empresa e usuário. Antes de trocar a base,
  bloquear novas operações e aguardar as tarefas da conta anterior.
- Manter comentários que expliquem restrições, invariantes ou decisões. Remover
  comentários obsoletos e descrições que apenas repetem a linha seguinte.
- Extrair módulos ao alterar um domínio, preservando contratos e testes. Evitar
  reorganização ampla de arquivos junto de uma migração de dados.
- Backup, imagens e credenciais não pertencem ao Git. Artefatos destinados ao
  usuário ficam em Downloads/Gerador de Orcamentos.

## Contrato de IPC

`src/shared/api.ts` (`AppApi`) é a única definição da API entre renderer e main.
`src/shared/canais.ts` deriva dela o nome, os argumentos e o retorno de cada canal:
o preload chama `invoke` tipado (sem conversões), e os tratadores de `src/main/ipc.ts`
precisam cobrir exatamente os canais do contrato, senão o projeto não compila.
`src/main/ipc-validacao.ts` confere a forma dos argumentos de cada canal antes de
executar (as regras de negócio continuam nos repositórios). Um canal novo exige: método
em `AppApi`, `invoke` no preload, tratador em `ipc.ts` e regra em `ipc-validacao.ts`.

## Fontes do SQL da nuvem (Supabase)

| Arquivo                                                                       | Papel                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `supabase/relacional-base.sql`, `colaboracao.sql`, `numeracao-sequencial.sql` | **Fontes** editadas à mão                                               |
| `scripts/gerar-schema-nuvem.mjs`                                              | Contrato das tabelas; gera os arquivos abaixo em `pretest` e `prebuild` |
| `supabase/schema.sql`, `schema-colaboracao.sql`, `migrations/002_*.sql`       | **Gerados**: não editar; o CI falha se estiverem desatualizados         |
| `supabase/migrations/NNN_*.sql`                                               | Migrações incrementais aplicadas ao projeto (a partir da 004, à mão)    |
| `supabase/rollbacks/`                                                         | Como desfazer a migração correspondente                                 |
| `supabase/central/`                                                           | Serviço de várias empresas                                              |

Migrações novas entram no instalador automaticamente (`electron-builder.yml`, por glob).

## Divisão dos módulos grandes

- `src/main/repositories.ts` é um índice sobre `repositories/{base,clientes,orcamentos,relatorios,textos-padrao}`.
- `src/main/nuvem.ts` concentra o estado da sincronização; a configuração, a aplicação de
  pacotes remotos e a captura de cadastros estão em `nuvem-config`, `nuvem-aplicar` e
  `nuvem-cadastros`. `executarSincronizacao` apenas encadeia etapas nomeadas.
- `src/main/dados.ts` (backup e importação) usa `dados-auxiliares`, `dados-comuns` e
  `dados-mesclagem` (uma função por etapa da mesclagem, sobre um contexto compartilhado).
- `src/main/contas/servico.ts` guarda o estado da conta; configuração do serviço,
  requisições, lista de empresas, convites e erro de exclusão têm módulos próprios.
- No renderer, `ui/primitives.tsx` reexporta `botoes`, `campos`, `cartoes` e `modal`;
  páginas grandes têm subpastas (`pages/orcamento`, `pages/cadastros`, `pages/configuracoes`).

## Testes e diagnóstico

- `npm run check` roda lint, formatação, tipos, testes com cobertura (piso mínimo em
  `vitest.config.ts`) e build. `npm run test:rapido` pula os testes que sobem o banco em WebAssembly.
- Falhas relevantes vão para `logs/app.jsonl` (pasta de dados do aplicativo), com um código curto
  na mensagem da tela; "Exportar diagnóstico" reúne o estado para o suporte.
- Scripts de validação de versões antigas ficam em `scripts/legado` e os documentos em `docs/historico`.

## Situação da refatoração

Ainda são grandes, por dependerem de estado do módulo: `nuvem.ts` (sincronização),
`dados.ts` (importação) e `contas/servico.ts`. Dividir mais exige primeiro isolar esse estado.
