# Validação da 1.6.0

Versão: **1.6.0** (minor). SQLite esquema 14 (sem migração local nova) e protocolo de nuvem 4.
Instalador: `release/1.6.0/Gerador de Orçamentos Setup 1.6.0.exe`, 1.166 MiB, SHA-256
`866ab4b454e77468e76a55f32ba7ed8c2461ab13a19948d76f6feba1b9f290fa`. A pasta `release/` fica fora do
Git; o instalador não é assinado (`signAndEditExecutable: false`).

## O que mudou

Tema escuro; revisão de textos com IA mais segura; menos tráfego com o Supabase (migração 013);
endurecimento da janela e do IPC; validação de imagens da nuvem; correções de arredondamento, valor
por extenso, total do orçamento e paginação de blocos longos no PDF; CI. Detalhes no `CHANGELOG.md`.

## Ensaios e resultados

| Ensaio                                                           | Resultado                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check` (lint, formatação, tipos, testes e build)        | 558 testes em 79 arquivos aprovados                                                                                                                          |
| CI no GitHub Actions (Windows, Node 24)                          | Verde em todos os commits da branch `claude`                                                                                                                 |
| `scripts/verificar-1-6-0-pacote.mjs` (executável final)          | Abre na versão 1.6.0 sem erros de página; IA, `servico.json`, migração 013 e rollback empacotados; navegação externa bloqueada; tema escuro salvo ao reabrir |
| `scripts/verificar-paginacao-longa.mjs` (layout real)            | 0 folhas estouradas, texto preservado, PDF com o mesmo nº de folhas                                                                                          |
| Dois computadores, app empacotado, Supabase real (empresa TESTE) | Criar/salvar chega ao outro em 1,1 a 2,2 s (mediana 1,4 s); excluir em 2,7 s e some do outro                                                                 |
| Revisão de IA no app empacotado                                  | Texto com erros voltou corrigido; modelo embutido carregou do pacote                                                                                         |
| Tráfego ocioso com 1 documento em edição (Supabase real)         | ~25 requisições/min, contra ~35/min antes; sincronização completa a cada 30 s                                                                                |
| Contraste WCAG AA dos pares de cor do tema escuro                | Testes automatizados aprovados                                                                                                                               |

## Revisão de IA: comparação de modelos

Mesmos 10 a 24 textos, 3 execuções cada, pipeline completo, mesma máquina (16 núcleos):

| Modelo                   | Arquivo       | RAM          | Velocidade     | Conclusão                                        |
| ------------------------ | ------------- | ------------ | -------------- | ------------------------------------------------ |
| **Qwen2.5 1,5B (usado)** | 1.066 MiB     | 1,7 GB       | 56 tok/s       | Melhor equilíbrio; mantido                       |
| Qwen2.5 3B               | 2.007 MiB     | 3,3 GB       | 30 tok/s       | Mais fiel, mas estoura o limite de ~2 GB do NSIS |
| Qwen3 1,7B               | 1.223 MiB     | 2,2 GB       | 50 tok/s       | Conservador demais                               |
| Qwen3.5 2B               | 1.222 MiB     | 1,9 GB       | 45 tok/s       | Errático; trocou o sentido de frases             |
| Gemma 3 1B               | 769 MiB       | 1,0 GB       | 69 tok/s       | Mais rápido, o que mais inventa                  |
| Amadeus-Verbo 1,5B       | 940 MiB       | 1,7 GB       | 54 tok/s       | Empatado com o atual, mais irregular             |
| Tucano2 1,5B / 0,5B      | 887 / 291 MiB | 2,0 / 1,0 GB | 55 / 123 tok/s | Sem vantagem; o 0,5B inventa                     |

A camada determinística (`src/shared/revisao-ia-texto.ts`) recusa troca de papéis e de forma de
pagamento, troca ou invenção de palavras de conteúdo, números alterados e respostas em maiúsculas.
Limite conhecido: em textos longos, trocar uma única palavra ainda passa (a tolerância é de um terço).

## Migração do Supabase

A migração `013_realtime_sem_renovacao.sql` foi aplicada ao projeto `gerador-orcamento` em
23/10/2026, com a função anterior guardada em `supabase/rollbacks/013_desfazer_realtime_sem_renovacao.sql`.
Teste em Postgres confirma que só a renovação do prazo deixa de avisar; posse, geração, modo offline,
revisão e dados continuam em tempo real. É recomendada, não obrigatória.

## Limites desta validação

- O instalador não foi **executado**: instalar em outro diretório atualizaria o registro da instalação
  atual do usuário. O conteúdo foi validado pelo executável desempacotado (`win-unpacked`), que é o
  mesmo que o instalador grava.
- A medição de rede e de IA foi feita em um computador com 16 núcleos; em PCs mais fracos os tempos de
  IA sobem proporcionalmente.
- Não houve confirmação física de desconectar e reconectar a rede nesta versão.
- A barra de título no tema escuro (`nativeTheme`) não foi conferida visualmente.
- Os textos de comparação de modelos são sintéticos (24 casos): indício, não estatística.
- Não alterado de propósito: quem pode exportar o backup, divisão dos arquivos grandes, majors de
  dependências e índice novo em `fila_nuvem` (exigiria migração local).
