# Validação da 1.6.4

Versão: **1.6.4** (correção). SQLite esquema 14 e protocolo de nuvem 4. Migração do Supabase: `014_computadores_unicos.sql`
(função de leitura; aplicada ao projeto em 24/10/2026).

Instalador: `release/1.6.4/Gerador-de-Orcamentos-Setup-1.6.4.exe`, 1.174 MiB (1.231.053.012 bytes), SHA-256
`3956ad0294e5fb0f511a43fdc4b0380e5bdc000724657a8eedd2da9aa66b6c24`, publicado nos GitHub Releases (primeira
versão a chegar pela atualização automática da 1.6.3).

## O problema

Na tela de transferência de edição, o mesmo computador aparecia várias vezes (N-MATHEUS ×3, D-MATHEUS ×2). Causa
confirmada nos dados: cada perfil local gera um identificador próprio e a tabela `computadores` guarda todos.
Na empresa real havia 5 linhas para 2 computadores físicos, as mais antigas sem uso há 10 a 12 dias.

## Ensaios e resultados

| Ensaio                                              | Resultado                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                     | Ver o PR                                                                                                                                         |
| `computadores-unicos.test.ts` (PostgreSQL embutido) | Um identificador por computador e pessoa (o mais recente), nomes comparados sem maiúsculas e espaços; outra empresa excluída; migração repetível |
| Migração 014 no Supabase real                       | Executada com sucesso (função criada, sem alterar dados)                                                                                         |
| Consulta equivalente nos dados reais                | Não conferida: o editor do navegador não devolveu o resultado                                                                                    |

## Limites

- A lista só muda nos computadores com a 1.6.4. Identificadores antigos continuam na tabela do servidor (inofensivos).
- Nomes iguais de computadores diferentes da mesma pessoa seriam mostrados como um só; nomes de Windows costumam ser únicos.
