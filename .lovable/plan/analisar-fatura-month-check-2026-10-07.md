# Analisar fatura — Month Check

## Objetivo e escopo

Adicionar o fluxo **upload → análise IA → prévia → revisão → confirmação → importação**, integrado ao estilo editorial atual. A análise nunca cria lançamentos; somente a confirmação final autoriza a gravação.

Preservar os dados, cálculos, páginas e funcionalidades existentes. Não incluir chat, previsão, integração bancária, aprendizado de categorias nem análises financeiras avançadas.

## Estrutura atual verificada

- Lançamentos são gravados em `month_check_rows`: `transaction_date`, `descricao`, `valor`, `tipo`, `category_id`, `quitado`, `expense_class`, `year`, `month` e `position`.
- Conferência utiliza `checklist_items`, separadamente. Importar para **Lançamentos**, sem copiar despesas para Conferência nem modificar seu planejamento.
- Categorias existentes ficam em `expense_categories`, separadas por usuário.
- `installments` representa cronogramas de parcelas/assinaturas, com início, valor e quantidade; não há campos de parcela no lançamento individual nem vínculo de origem de fatura.
- Os índices atuais de `month_check_rows` não oferecem idempotência de importação.
- O projeto possui funções autenticadas e envio do token já configurado. Não há SDK de IA no `package.json`; a chave do Lovable AI está disponível e o catálogo autenticado confirmou `openai/gpt-6-astra` na API Responses.

## 1. Página e navegação

- Criar `/analisar-fatura` dentro da área autenticada e adicionar **Analisar fatura** à navegação.
- Manter todas as opções existentes. No celular, adaptar o acesso por um menu de opções adicionais para evitar sete itens comprimidos na barra inferior.
- Reutilizar fontes, cores, botões, campos, seletores e confirmação do Month Check; sem nova estética, sombras pesadas ou seções com cards aninhados.
- Título: **Analisar fatura**.
- Subtítulo: **Envie sua fatura e deixe a IA identificar os lançamentos para você.**
- Upload por arrastar ou **Selecionar arquivo**; mostrar nome, tamanho, opção de remover e **Analisar fatura**.
- Aceitar um PDF, JPG/JPEG ou PNG por análise, com limite inicial de **20 MB**. Validar também conteúdo real e assinatura do arquivo no servidor; rejeitar executáveis, arquivos vazios, corrompidos e PDFs protegidos por senha. Limitar PDFs a 50 páginas, com mensagem clara quando excedido.

## 2. Análise segura com IA

- Usar Lovable AI no servidor, com AI SDK (`ai` e `@ai-sdk/openai`) e API Responses, modelo `openai/gpt-6-astra`.
- Autenticar a solicitação e buscar apenas as categorias do usuário. Não enviar histórico financeiro completo nem permitir que instruções presentes na fatura comandem a aplicação.
- Enviar PDF como conteúdo de arquivo e imagens com seu MIME real, conforme o formato multimodal recomendado da API.
- Processar o documento em memória, sem guardar permanentemente o arquivo, sem bucket público e sem registrar conteúdo, números completos de cartão ou documentos nos logs. Exibir apenas identificação mascarada do cartão.
- Transmitir o processamento pelo mecanismo de streaming suportado pelo projeto, sem manter uma resposta longa inteiramente bloqueada. A prévia só se torna importável após conclusão e validação de toda a resposta.
- Disponibilizar cancelamento durante a análise, propagando a interrupção à chamada de IA; não importar nem reiniciar automaticamente.
- Solicitar **Structured Outputs**, com esquema de objeto estrito, campos desconhecidos obrigatoriamente `null` e validação no servidor. Categoria sugerida precisa corresponder a uma categoria existente e pertencente ao usuário; caso contrário, `null`.
- Extrair emissor, cartão mascarado, período, vencimento, total, moeda e transações: data, descrição, valor, natureza da movimentação, parcela atual/total, categoria sugerida e confiança.
- Interpretar `03/10` como parcela 3 de 10, sem inventar datas, parcelas, categorias ou valores.
- Distinguir compras, encargos, estornos/créditos e linhas de resumo. Não importar o total da fatura, pagamentos de fatura ou saldos anteriores como se fossem compras, evitando dupla contagem. Manter avisos sobre componentes que impeçam a conciliação.

**Custo:** análises usam os créditos de IA do workspace; não há cobrança de análise ao selecionar o arquivo.

## 3. Prévia, conferência e revisão

- Mostrar **Fatura analisada**, total da fatura, total identificado, quantidade de lançamentos, período e vencimento. Dados ausentes aparecem como **Não identificado**, nunca como zero inventado.
- Exibir a seção **Conferência** com total da fatura, total identificado e diferença, calculados deterministicamente em centavos. Créditos/estornos reduzem o total identificado.
- Tolerância de arredondamento: **R$ 0,01**. Só mostrar **✓ Os valores conferem** quando ambos os totais forem conhecidos e a diferença estiver dentro dessa tolerância; exibir a diferença mesmo nesse caso.
- Fora da tolerância: **⚠ A soma dos lançamentos não corresponde ao total da fatura.** Se faltar o total, informar que não foi possível conferir.
- Mostrar separadamente o total identificado e o total selecionado para importar; editar valores ou remover linhas recalcula a conferência, enquanto apenas desmarcar uma linha não faz parecer que a extração perdeu dados.
- Tabela no computador e revisão empilhada no celular, com seleção, data, descrição, valor, categoria, parcela e confiança **Alta / Média / Baixa**.
- Permitir editar descrição, data, valor, categoria, parcela e natureza quando necessário; desmarcar ou remover transações da importação. Confiança não será apresentada como garantia de precisão.
- Datas sem ano ou dados ambíguos permanecem pendentes para revisão. Bloquear importação de linhas selecionadas sem data válida, descrição ou valor; permitir categoria ausente.
- Importar inicialmente apenas valores em **BRL**, sem conversão automática de moedas. Faturas com moeda desconhecida exigem esclarecimento na revisão; outras moedas ficam bloqueadas nesta versão.
- Diferença ou total ausente não autoriza afirmar correção: exigir reconhecimento explícito do aviso antes de avançar com as linhas revisadas.

## 4. Parcelas e situação

- Conforme sua escolha, lançamentos importados começam **não quitados** (`quitado = false`).
- Compras/encargos entram como `saida`, com valor positivo; créditos/estornos identificados e revisados entram como `entrada`, respeitando os campos e regras atuais.
- Usar a classificação existente, com `variavel` como padrão para despesas importadas.
- Preservar a parcela atual e total no lançamento importado, como metadados opcionais. Exibir essa informação discretamente ao consultar/editar o lançamento.
- **Não criar automaticamente cronogramas em Parcelas nem parcelas futuras:** importar apenas o valor cobrado na fatura enviada. Isso evita modificar projeções e duplicar despesas futuras.
- Ano e mês continuam derivados da data revisada, como no cadastro atual; não trocar automaticamente a competência para o mês de vencimento da fatura.

## 5. Duplicidade e confirmação

- Antes da confirmação, comparar as linhas selecionadas entre si e com os lançamentos do usuário por data, valor em centavos, descrição normalizada e origem de fatura/cartão quando disponível.
- Mostrar possíveis duplicidades com os dados disponíveis para comparação. Duplicatas exatas confirmadas e linhas já importadas ficam excluídas/bloqueadas; correspondências aproximadas exigem revisão explícita, sem descartar silenciosamente compras legítimas iguais.
- Revalidar duplicidades e propriedade das categorias no servidor imediatamente antes de gravar. Nunca confiar apenas na verificação da tela.
- Botão **Importar lançamentos** abre confirmação com:
  - **Você está prestes a importar X lançamentos.**
  - **Os lançamentos serão adicionados ao seu Month Check.**
  - **Cancelar** / **Confirmar importação**.
- Cancelar não grava nada e preserva a revisão. Confirmar grava somente as linhas selecionadas e validadas; desabilitar duplo clique.
- Gravar o lote atomicamente e com idempotência, para que falhas, concorrência ou repetição da confirmação não gerem importação parcial/duplicada. Retornar resumo de importados e ignorados, atualizar as consultas existentes e oferecer acesso a Lançamentos.

## Detalhes técnicos e alterações necessárias

- **Migração pequena e aditiva**, sem apagar/reescrever registros: campos opcionais em `month_check_rows` para parcela atual/total, identificação mascarada/origem da fatura e identificação estável da linha importada; índice único por usuário/origem/linha para idempotência, sem impor unicidade global de data/descrição/valor a lançamentos manuais.
- Acrescentar função transacional de importação com validação do usuário, categorias e duplicidades, serializando importações concorrentes do mesmo usuário. Manter RLS e conceder somente as permissões necessárias. Não criar outro sistema de lançamentos.
- A identidade da importação deve considerar o arquivo original e a posição original da transação, sem mudar quando o usuário revisa campos. Arquivos diferentes da mesma fatura continuam sujeitos à comparação com lançamentos existentes.
- Criar página, upload, resumo de conferência, revisão e confirmação em módulos focados; contratos/validação compartilhados e helpers de IA exclusivamente no servidor.
- Reutilizar o padrão de funções autenticadas para análise/importação. Escolher o transporte de upload/streaming compatível com TanStack Start durante a implementação, com autenticação explícita em qualquer handler HTTP necessário; sem Supabase Edge Functions.
- Preservar `src/start.ts` e os clientes gerados; não alterar chaves, autenticação ou provedores existentes.
- Atualizar navegação e, pontualmente, exibição/edição dos metadados importados em Lançamentos. O backup existente já seleciona todos os campos dos lançamentos; verificar que inclui os novos metadados.
- Incluir título, descrição e metadados próprios na nova página. Registrar decisões de arquitetura em `AGENTS.md` e requisitos aprovados na memória ao iniciar a implementação.

## Erros e recuperação

Mensagens específicas para arquivo inválido/grande, PDF protegido ou ilegível, ausência de transações, total não encontrado, resposta inválida e falha de comunicação/processamento. Limpar o estado de espera, preservar a revisão quando possível e não inventar resultados.

Preservar mensagens seguras de falta de créditos, configuração e acesso à IA. Não repetir recusas ou bloqueios; somente falhas transitórias elegíveis poderão ter recuperação limitada e espaçada, sem repetir importações.

## Validação antes da entrega

- Exercitar PDF e imagem com chamadas reais à IA, usando faturas sintéticas de teste sem dados pessoais; verificar entrada multimodal e esquema retornado.
- Cobrir parcelas `03/10`, categoria inexistente, campos desconhecidos, estornos e diferença de totais, inclusive tolerância de centavos.
- Testar arquivos inválidos/grandes, PDF ilegível/protegido, falhas da IA e cancelamento durante análise.
- Confirmar que análise, revisão e cancelamento da confirmação não criam lançamentos.
- Testar duplicidade exata/aproximada, repetição do arquivo, duplo clique, repetição da solicitação e concorrência.
- Importar um lote confirmado em sessão autenticada e conferir na tela de Lançamentos datas, valores, categorias, parcelas e situação não quitada. Remover apenas os registros sintéticos criados para o teste.
- Verificar isolamento entre usuários, propriedade das categorias e ausência de documentos/chaves nos logs e no navegador.
- Conferir computador e celular, navegação, backup, Conferência, Lançamentos, Parcelas e projeções, mantendo cálculos existentes.
- Ao entregar, listar arquivos/componentes criados ou alterados, explicar a integração de IA e informar resultados dos testes e eventuais bloqueios.