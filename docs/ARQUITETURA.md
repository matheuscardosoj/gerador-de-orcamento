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
| `src/main/repositories`       | Persistência por domínio, extraída gradualmente                   |
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

## Situação da refatoração

Clientes foram extraídos de `repositories.ts`; demais repositórios permanecem na
fachada existente para reduzir risco. A identidade da empresa deixou de ser
semeada em novas instalações e no modo demonstrativo. Autenticação e controle de
acesso têm módulos próprios. A extração restante pode ser incremental após a
validação desta entrega, sem mudar os formatos de dados.
