# Validação do candidato 1.4.0-rc.2

Conferido em 11 de outubro de 2026, na branch `claude`.

- 125 testes, análise estática, formatação, tipos e compilação passaram.
- 46 verificações de estilo/tamanho de janela passaram, mantendo os componentes de prévia e o padrão visual existente.
- O executável empacotado passou nos testes de recibos derivados, descarte sem gravar documentos, busca, colunas e preferências após reinício.
- Arraste real por mouse/teclado, cancelamento, vínculos de fotos e as seis listas de custo foram conferidos. A ordem de serviços, materiais, textos e fotos foi verificada dentro de PDF e DOCX; o preço não mudou ao reordenar custos.
- Revisão por IA foi testada com modelo local real e em cenários de indisponibilidade, cancelamento, limite de tempo, alteração de números e edição concorrente. A sugestão exige aprovação antes de alterar o campo.
- Exportações dos quatro tipos e tabela com 70 serviços foram conferidas, incluindo cópias e cancelamento de substituição. Documentos foram renderizados no Word para revisão visual.
- O backup fornecido foi migrado em cópia para o esquema 8 e restaurado: 10 clientes, 17 orçamentos, 4 relatórios, 15 imagens únicas e 33 versões. Números 1–17 e próximo número 18 foram preservados. Dados, fotos, versões e valores foram comparados com o original.
- O backup de origem permaneceu intacto. A cópia entregue não contém identidade, sessão ou reservas de outro computador. Restauração completa mantém a identidade do perfil de destino e suas permissões existentes; mesclagem preserva preferências locais.

As evidências estão nas pastas ignoradas `output/playwright/`,
`output/document-qa-rc2/` e `output/backups-corrigidos/`. O candidato está em
`release/candidato-1.4.0-rc.2/`, com perfil separado para revisão.

A conexão real Supabase depende da criação do projeto da empresa e será validada
após a revisão, conforme combinado. Merge em `main` e instalador da versão final
não foram realizados e dependem de autorização.
