# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

## 1.6.2 — banco travado por um processo que não é mais o aplicativo

- Correção: o `banco.lock` deixado por uma execução encerrada à força (por exemplo, o instalador
  fechando o aplicativo para atualizar) guardava só o PID; quando o Windows entregava esse PID a
  outro processo, o aplicativo recusava abrir ("O banco de dados já está aberto por outra
  instância") e nenhuma empresa daquele perfil abria. A trava agora guarda também a hora de
  início do processo; se o PID está vivo mas o processo começou depois da trava, ela é
  considerada velha, substituída e registrada em `logs/app.jsonl` como `trava-obsoleta`. Sem
  conseguir consultar o processo, a trava continua valendo.
- Diagnosticado com o "Exportar diagnóstico" da 1.6.1, que mostrou o `banco.lock` com PID de dois
  dias antes.
- Engenharia (sem mudança visível para quem usa):
  - IPC: os canais agora derivam de um contrato tipado único (`src/shared/canais.ts`), o que
    eliminou 113 conversões `as never` do preload e faz um canal sem tratador (ou o contrário) deixar
    de compilar; o processo principal confere a forma dos argumentos de cada canal antes de executar
    (`src/main/ipc-validacao.ts`: id é texto, patch é objeto, formato é `pdf` ou `docx`…).
  - Testes: `App.fumaca.test.tsx` (jsdom e Testing Library) monta o aplicativo contra a API de
    demonstração, percorre as telas e abre os editores falhando em qualquer `console.error`;
    `npm run test:rapido` roda só os testes que não sobem o banco em WebAssembly.
  - Código: `nuvem.ts` (1981 → 1671 linhas) perdeu configuração, aplicação de pacotes remotos e
    captura de cadastros; `repositories.ts` (1359 → 143) virou um índice sobre
    `repositories/{base,orcamentos,relatorios,textos-padrao,clientes}`; `dados.ts` ganhou
    `dados-auxiliares`; o editor de orçamento, os cadastros e o modal de cálculo foram divididos em
    cartões, seções e blocos. Nenhuma assinatura pública mudou.
  - O pacote de produção não inclui mais a API de demonstração (o bundle caiu de 975 para 954 kB).
  - O instalador inclui toda migração do Supabase automaticamente (antes cada arquivo era listado à
    mão e uma migração nova esquecida só falharia em produção); o CI audita as dependências de
    produção (`npm audit --audit-level=high`); a regra `no-explicit-any` do lint passou a ser erro.
  - Scripts e documentos de versões anteriores foram para `scripts/legado/` e `docs/historico/`.

## 1.6.1 — acesso que não travava mais e diagnóstico para o suporte

- Correção: quando o banco local do perfil salvo não abria (por exemplo em um computador com
  perfil antigo ou danificado), o aplicativo mostrava "Não foi possível recuperar seu acesso" e
  continuava preso a esse perfil: escolher qualquer empresa, até uma recém-criada, falhava com
  "Não foi possível concluir". Agora o aplicativo volta ao banco padrão, permite escolher outra
  empresa e mostra o motivo.
- Um `contas.json` truncado ou ilegível é guardado ao lado (`contas.json.corrompido-<data>`) e o
  aplicativo segue sem perfis salvos; antes, travava na abertura.
- Registro de falhas em `logs/app.jsonl` (pasta de dados do aplicativo), com rotação em 1 MB, sem
  senhas, tokens nem e-mails. Falhas ao abrir o banco, ao reservá-lo e as exceções não tratadas
  são gravadas com um código de 6 caracteres que aparece na mensagem da tela.
- "Exportar diagnóstico" no aviso de falha da abertura e na tela de escolha de empresa: grava um
  JSON com versões, espaço livre, estado dos perfis, travas, backups e os últimos registros,
  para enviar ao suporte.
- Mensagens de erro de abertura do banco deixam de virar o texto genérico.

## 1.6.0 — tema escuro, revisão de textos com IA mais segura e menos tráfego

- Tema escuro (preto e cinza neutros) com três opções em Configurações → Minha conta →
  Aparência: Claro, Escuro e Automático (segue o Windows). Um botão na barra lateral alterna
  entre claro e escuro. A escolha fica salva neste computador e volta ao abrir o aplicativo;
  quem não escolher continua com o tema claro. PDF, Word e a prévia dos documentos mantêm o
  fundo branco. As cores dos dois temas vêm de `tailwind.tema.mjs`, com testes de contraste
  WCAG AA para o tema escuro.
- Desempenho: salvar não relê mais todos os cadastros e imagens; a abertura do app faz uma
  verificação de integridade em vez de três e não monta cada documento só para conferir a
  versão; o servidor deixa de avisar todos os computadores a cada renovação de prazo da
  sessão de edição (migração `013_realtime_sem_renovacao.sql`, já aplicada ao projeto em 23/10/2026; o script `supabase/rollbacks/013_desfazer_realtime_sem_renovacao.sql` a desfaz); controles de documentos excluídos deixam de ser renovados e a verificação de pedidos de edição não repete a cada resposta da nuvem.
  Alterações reais continuam chegando em tempo real aos outros computadores.
- Segurança: a janela principal usa sandbox e não navega para fora do aplicativo; o IPC só
  aceita chamadas do próprio aplicativo; documentos gerados têm política de conteúdo
  restritiva; imagens recebidas da nuvem ou de backups são validadas antes de gravar.
- Correções: arredondamento de valores negativos e "-R$ 0,00"; valor por extenso de milhões;
  total do orçamento calculado a partir dos itens; textos longos e listas passam a ser
  divididos entre páginas no PDF.
- Revisão de texto com IA: a resposta do modelo passa por uma camada determinística
  (`src/shared/revisao-ia-texto.ts`) que remove rótulos e a instrução do prompt repetidos,
  recusa trocar quem é a contratante, o cliente ou a empresa (e passar o texto para a primeira
  pessoa), e corrige espaços, acentos de palavras comuns, maiúsculas e ponto final. Se o modelo
  devolver o mesmo texto, há uma segunda tentativa com mais variação; se ainda não houver nada
  a mudar, a tela avisa "Nenhuma alteração sugerida". O prompt descreve o campo em linguagem
  natural (o nome interno vazava para a resposta).
  A sugestão também é recusada quando troca ou apaga mais de um terço das palavras de conteúdo
  do original ("roçada" virando "Remoção"), acrescenta informações novas ou altera a forma de
  pagamento (dinheiro, Pix, cartão…).
- CI no GitHub Actions (`npm run check`).

## 1.5.4 — conclusão da recuperação sem avisos reaparecendo

- Revisão após auditoria: uma confirmação por recuperação, Retry-After sem prorrogação
  por eventos repetidos, bloqueio de falhas permanentes e backoff preservado enquanto
  os envios falham. A vigilância usa um único temporizador periódico.
- Leitura paginada exige avanço; respostas antigas não recriam falta de conexão;
  ações de cartões antigos não publicam avisos depois de trocar de contexto.
- Identidades dos cartões são únicas por processo, e persistência participa da atualização.
- Pacote revisado em `candidato-1.5.4-revisado`; substitui o primeiro candidato 1.5.4.

- Encerra o ciclo do aviso ao confirmar a recuperação. Sincronizações posteriores
  não substituem a conclusão pelo cartão de retomada.
- O cartão de retomada é publicado apenas na transição de estado: fechá-lo não provoca
  seu reaparecimento a cada atualização. Outra indisponibilidade permite um novo ciclo.
- Regressão automatizada reproduz a sequência informada no teste real da 1.5.3.

## 1.5.3 — recuperação rápida e aviso único de conexão

- Eventos de rede, foco, desbloqueio e suspensão antecipam uma consulta de disponibilidade
  independente da fila e dos controles de edição, com prazo total de três segundos.
- Durante interrupções, a consulta usa intervalos de 1, 2 e até 5 segundos com variação,
  respeitando Retry-After. Respostas antigas não desfazem evidências mais recentes.
- Salvar, abrir rascunhos e o monitor compartilham um aviso de conexão por contexto.
  O botão de tentativa é preservado e o fechamento manual silencia repetições automáticas.
- A recuperação do acesso e a confirmação dos envios têm mensagens distintas.
- Preservados a fila idempotente, os rascunhos e os bancos existentes, sem migração.
- Candidato para confirmação de velocidade no computador real.

## 1.5.2 — recuperação da conexão e avisos flutuantes

- A sincronização continua tentando recuperar o serviço após interrupções prolongadas,
  inclusive quando o aplicativo abre offline. Retorno da rede, foco e saída da suspensão
  antecipam a verificação, com tentativas serializadas e intervalos variáveis limitados.
- Disponibilidade HTTP e canal em tempo real têm estados separados. Falhas de transporte,
  sessão, permissão, manutenção e conflitos recebem tratamento próprio.
- Aplicações de rascunhos aguardam a confirmação das operações originais. Respostas
  perdidas e reinício preservam a identidade do envio, sem duplicar versões. A aplicação
  continua exigindo confirmação e autorização de edição.
- Erros operacionais usam notificações flutuantes no padrão visual do aplicativo,
  inclusive em modais. Erros e ações pendentes persistem; a fila limita a altura,
  permite rolagem e atualiza avisos existentes em vez de duplicá-los.
- Migração local SQLite v14 conserva os dados e registra as confirmações de rascunhos.
  Nenhuma alteração remota de schema é necessária.
- Candidato para teste real entre computadores; não representa validação em produção.

## 1.5.1 — cadastros e avisos do cálculo

- Históricos de clientes e serviços usam paginação compartilhada de 12 registros,
  com busca, filtros e ordenação retornando à primeira página.
- Falhas ao excluir serviços aparecem na tela e impedem confirmação repetida enquanto
  a operação está em andamento.
- Erros e avisos do cálculo de preço passam a aparecer como notificações flutuantes
  no mesmo componente usado por orçamentos e relatórios.
- Validado com interface Electron sintética, fluxos de orçamento e relatório, suíte
  completa, instalador isolado e conferência do artefato distribuído.

## 1.5.0-rc.9 — exclusões remotas e códigos de cadastro

- Editores abertos avisam quando o documento foi excluído em outro computador,
  bloqueiam o salvamento da cópia antiga e permitem guardar alterações como rascunho.
- Clientes e serviços ganham códigos permanentes, únicos e atribuídos pela nuvem;
  os cadastros existentes recebem códigos determinísticos na migração local e remota.
- A reconciliação de número de recibo só libera o registro de teste confirmado como
  excluído e sem pagamento; se encontrar outro uso, interrompe a operação sem alterar a sequência.
- Inclui as migrações SQL necessárias para atualizar a nuvem antes de conectar este candidato.

## 1.5.0-rc.8 — visualização de senha

- Campos de senha permitem mostrar e ocultar o texto com um ícone animado,
  inclusive no acesso, recuperação, Minha conta e conexão da nuvem.

## 1.5.0-rc.7 — ajuste da tabela de usuários

- A tabela da empresa mantém colunas alinhadas em janelas estreitas e quebra
  nomes e e-mails longos sem sobrepor o perfil de acesso.

## 1.5.0-rc.6 — correção do convite

- Convites novos usam o envio administrativo do Supabase; o cadastro público
  continua fechado. Convites para contas confirmadas notificam pelo fluxo de
  recuperação, e a pessoa também pode entrar com sua senha atual.
- O aplicativo aceita códigos de convite e de recuperação, e a falha de envio
  informa que o convite pendente foi preservado.
- A mensagem de erro da janela de convite aparece uma vez, junto ao formulário.

## 1.5.0-rc.5 — candidato para validação

- Acesso central por convite, com perfis locais separados por empresa e usuário,
  tela de entrada, troca de conta, recuperação e alteração de senha.
- Primeiros passos da empresa, área Minha conta e gestão de membros com controles
  conferidos no servidor. A migração central foi aplicada ao projeto atual após
  backup verificado; o cadastro público foi desativado.
- A tela de código orienta a procurar o e-mail no spam, permite corrigir o endereço
  e mostra a espera antes de reenviar.
- Validação real de convites, entrega dos e-mails e uso nos dois computadores ainda
  necessária antes de recomendar esta versão para outras empresas.

## 1.5.0-rc.1 — 2026-10-12

- Empresas com vários logins, autoria por usuário/computador e canal privado Supabase Broadcast após salvar; recuperação incremental e fila persistente.
- Ordem visual e ID interno permanente nos históricos, preservando números oficiais e chaves técnicas. Faixas futuras transacionais e proteção dos números emitidos.
- Bloqueios temporários, solicitações, liberação, transferência, preparação offline e recuperação com revogação das gerações antigas.
- Rascunhos e comparação de base/local/remoto; revisão financeira separada para evitar dupla contabilização ou restauração de pagamentos por texto.
- Configurações padronizadas com cabeçalho, largura, tabelas, filtros, ações e modais; proteção de recibos novos não salvos ao navegar.
- Migração SQLite 9 e protocolo de nuvem 2 com backups verificados; gravações de aplicativos antigos bloqueadas no servidor. Guia atualizado incluído no candidato.

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
