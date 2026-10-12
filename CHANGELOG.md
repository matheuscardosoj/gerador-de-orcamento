# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

## 1.4.1 — 2026-10-12

- Cadastros de clientes e catálogo usando a largura, cabeçalho, tabelas, ações e espaçamentos dos históricos. Busca, filtros de clientes e arraste de serviços preservado por mouse/teclado, com rolagem horizontal em janelas menores.
- Painel de numeração dos recibos nas configurações, com próximo número persistido no backup e bloqueio de números utilizados/excluídos. Os três painéis mostram as reservas reais e explicam a numeração protegida quando conectados à nuvem.
- Validação com 158 testes e interface real entre 1.024 e 2.560 pixels, incluindo cadastro somente com nome, reordenação/cancelamento e numeração de recibos.
- Nuvem organizada em tabelas de clientes, serviços, propostas e itens, relatórios e lançamentos, recibos, recebimentos, imagens e versões, com campos nativos e vínculos por empresa.
- Migração transacional e reexecutável da estrutura genérica, conferindo todos os conteúdos antes de retirar o armazenamento anterior. A rota compatível de sincronização passa a reconstruir os pacotes a partir das tabelas, sem uma segunda cópia de imagens/documentos.
- Proteções de integridade financeira, versões imutáveis, imagens por hash, referências históricas e isolamento por empresa. Preserva revisões, operações, reservas e identificadores amplos dos rascunhos offline.
- Contrato declarativo para gerar o esquema e testes de migração, reversão integral, campos futuros, permissões e compatibilidade com a 1.4.0 instalada.
- Guia de atualização da nuvem existente e consulta das tabelas incluído no instalador. Migração real conferida com 10 clientes, 17 propostas, 4 relatórios, 15 imagens e 38 versões, sem divergências ou pendências.

## 1.4.0 — 2026-10-11

- Consolida os recursos e correções dos candidatos rc.1 e rc.2: nuvem, versões, recibos, máscaras numéricas, históricos configuráveis, listas por arraste e revisão com IA local.
- Composição do preço em sequência: custos com lucro, acréscimo de lucro, custos sem lucro, subtotal antes do imposto e preço final. Identifica os itens sem lucro e explica a incidência da nota.
- Tela de cálculo mais ampla e responsiva, com campos rotulados, descrição em linha própria e opção de lucro sem texto apertado. Explicações genéricas para os diferentes tipos de serviço.
- A primeira publicação inclui versões e estornos de documentos excluídos, preservando o histórico e os números utilizados.
- Verificações de código, 141 testes e validação no Electron real de cálculos, espaçamentos, reordenação e exportações. A conexão real depende da configuração SQL e do usuário da empresa no Supabase.

## 1.4.0-rc.2 — 2026-10-11

- Lixeira no histórico e editor de recibos, com confirmação de exclusão/estorno atômico para pagamentos recebidos. Preserva número, versões e lançamentos; atualiza a lista e sincroniza exclusões sem reutilizar números.
- Confirmação de recibos identifica campos faltantes antes de salvar/registrar pagamento, sugere cidade/UF cadastrada e apresenta mensagens claras. Recibos avulsos/de propostas funcionam sem relatório; confirmação mostra cliente, valor e local.
- Todos os campos numéricos usam texto com máscara brasileira, vírgula decimal, agrupamento de milhares, bloqueio de letras e preservação do cursor. Valores monetários, quantidades, percentuais, inteiros e filtros vazios mantêm seus contratos e cálculos.
- Ícones padronizados por significado: recibos distintos dos demais documentos, edição/consulta, duplicação, cálculo, fotos, versões, recebimentos/estornos, backup e sincronização. Botões mantêm textos/dicas e usam traço e tamanhos consistentes.
- Atalhos de recibo/cobrança nos históricos de propostas e relatórios, sem salvar ou registrar pagamentos ao abrir.
- Históricos compartilhando busca por múltiplos termos, filtros, colunas selecionáveis/reordenáveis e preferências persistentes por computador.
- Históricos aproveitam a largura disponível, com rolagem horizontal quando necessária, número/ações fixos e textos limitados a duas linhas. Todas as colunas verificadas entre 1.024 e 2.560 pixels.
- Dicas dos botões isoladas do destaque das linhas: passar o mouse sobre um documento não exibe todas as ações ao mesmo tempo.
- Dicas das ações aparecem acima dos cabeçalhos/colunas fixas sem serem cortadas pela tabela, com ajuste às bordas da janela e fechamento por Escape.
- Reordenação por mouse e teclado nas listas de documentos, custos, catálogo e padrões, preservando vínculos e valores.
- Revisão e sugestões da IA local com comparação/aprovação, preservação de números, cancelamento durante geração/inicialização, tempo limite e proteção de edição concorrente.
- Clientes com apenas PF/PJ, PF como padrão e somente nome obrigatório.
- Proteção de recibos novos não salvos, foco estável, associação de rótulos a campos com botões e suporte a diálogos sobrepostos.
- Esquema 8, backup verificado anterior à migração e preservação da identidade do perfil de destino na restauração.
- Validação com 140 testes, executável real e cópia do backup do usuário. Merge e versão final continuam aguardando autorização; Supabase real será configurado depois da revisão.

## 1.4.0-rc.1 — 2026-10-11

Candidato para teste; versão final e merge aguardam autorização.

### Adicionado

- Sincronização Supabase por empresa, sessão protegida, permissões por usuário e fila SQLite persistente com operações idempotentes e revisões de origem.
- Reservas de números por tipo/computador e transferência da responsabilidade pela edição/emissão.
- Clientes PF/PJ com dados opcionais e CPF/CNPJ numérico ou alfanumérico; somente nome obrigatório.
- Recibos/cobranças com recebimentos transacionais, quitação parcial/total e cancelamento/estorno.
- Linha do tempo imutável, comparação completa de campos, exportação histórica, retomada e novos documentos a partir de versões antigas.
- Imagens Base64 deduplicadas, compressão em bytes e alertas de consumo.
- Tutorial para migrar a base local da versão antiga e configuração SQL incluída no pacote.

### Alterado e corrigido

- Dados da empresa/cliente e apresentação preservados por versão.
- Recibo A5 horizontal com logo, valor sem recuo desnecessário, espaço de assinatura e mesma paginação/linhas no PDF e Word.
- Prévia dos três tipos com o mesmo componente e estilo; demais elementos seguem os componentes existentes.
- Custos avulsos com opção de repasse sem acréscimo de lucro, mantendo aplicação do imposto.
- Nomes de PDF/DOCX com tipo, número, cliente, data e versão; confirmação de substituição.
- Tabelas extensas distribuídas entre páginas, repetindo cabeçalho; linhas do Word preservadas inteiras.
- Cidade congelada da empresa usada no DOCX; sem cidade informada, somente a data.
- Backup verificado e estimativa de espaço antes de migrar. Restauração/mesclagem incluem recibos, pagamentos, versões e imagens, sem sessões e autorizações offline.
- Conciliação financeira restaura juntos relatório e recibos/pagamentos, guardando alterações locais em backup.

### Validação

- Testes automatizados e conferência visual em perfis separados, incluindo migração de uma cópia do banco antigo instalado.
- Conexão real Supabase depende da criação do projeto e será conferida após a revisão do candidato.

## 1.3.1 — 2026-08-29

### Corrigido

- Erros de validação final agora aparecem junto aos campos de data, destinatário, título, materiais, serviços e lançamentos.
- Mensagens de validação são limpas por campo quando o usuário corrige o valor, sem esconder os demais problemas.
- Salvamentos de empresa, numeração, observações, pagamentos e IA agora tratam falhas do IPC, liberam os controles e impedem operações concorrentes.
- Configurações de IA validam o endereço local também antes do teste de conexão.

## 1.3.0 — 2026-08-29

### Adicionado

- Proteção contra perda de alterações ao navegar ou fechar a janela.
- Validação compartilhada de documentos finais, parâmetros financeiros e URL local do Ollama.
- Estados explícitos de salvamento, erro de carga e operações concorrentes.
- Resumos compactos para os históricos de orçamentos e relatórios.
- ESLint, Prettier, EditorConfig e comando único `npm run check`.

### Alterado

- “Margem de lucro” passou a “acréscimo sobre o custo”, preservando a fórmula e os dados antigos.
- “Multa/rescisão” passou a “provisão rescisória estimada”, com aviso de conferência contábil.
- Modais, abas, campos, cabeçalhos e tabelas receberam melhorias de acessibilidade e responsividade.
- Listagens e mesclagem de backups deixaram de repetir consultas por registro.
- Electron, electron-builder, electron-vite, Vite, plugin React e Vitest foram atualizados.
- Runtime da IA fixado no llama.cpp build 10087 (`1f66c3ce1`) e modelo validado por SHA-256.

### Segurança

- URL do Ollama restrita a `localhost`, `127.0.0.1` ou `::1` via HTTP.
- Auditorias de dependências de produção e desenvolvimento sem vulnerabilidades conhecidas.

## 1.2.2 — 2026-08-29

- Backup SQLite completo com restauração e mesclagem.
- Histórico, ícones, datas, anexos e tabelas responsivas padronizados.
- Proteção de BLOBs e testes adicionais de persistência.
