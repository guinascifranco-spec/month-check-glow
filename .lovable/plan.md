# Reformulação visual do Month Check

## Resultado esperado
Transformar a interface atual em uma ferramenta financeira mais sóbria, compacta e legível, sem mudar dados, cálculos, regras, navegação ou comportamento. A Conferência mantém seu mês, totais, progresso, pendências e edição dos lançamentos; as demais páginas preservam seus conteúdos e ações.

## Direção visual escolhida
- **Cinza editorial:** fundo `#F5F6F5`, superfícies/divisórias `#E8EBE9`, texto `#252B29` e verde de destaque `#168261`. Usar vermelho apenas para valores negativos e alertas. Branco nas superfícies que precisarem de contraste.
- **Tipografia:** Space Grotesk para títulos e números principais; DM Sans para texto, rótulos e controles. Hierarquia numérica forte, informação secundária discreta e peso negrito seletivo.
- **Organização:** painel compacto, com seções abertas, divisores e tabelas/linhas claras; cards somente quando realmente necessários, sem caixas aninhadas. Cantos discretos de 6–10px, bordas finas e sombras ausentes ou imperceptíveis. Interações com transições sutis.

## Aplicação nas telas
1. Atualizar cores, fontes, raios, superfícies e estilos compartilhados dos controles, preservando estados, contraste e áreas de toque. Simplificar abas desktop, barra inferior mobile, botões, campos e janelas existentes sem alterar suas ações.
2. **Conferência:** apresentar o período e os três totais em uma faixa de leitura direta; manter progresso e pendências como linhas/avisos discretos; dar protagonismo à tabela editável no desktop e a linhas compactas legíveis no celular. Preservar todos os campos, reordenação, marcação, exclusão e criação de lançamentos.
3. **Visão Geral:** manter Fluxo, Caixa, Patrimônio e Projeção, trocando caixas repetidas por agrupamento, divisores e tipografia; preservar tabelas, gráficos, controles e valores.
4. **Investimentos e Parcelas:** reduzir decoração dos indicadores e organizar ativos, aportes, proventos, compromissos, datas e progresso com linhas/tabelas onde couber, sem esconder ações ou informações.
5. **Visão Futura:** dar mais área e destaque aos gráficos; tornar seletor, resultados e eventos mais discretos, mantendo seus dados e controles.
6. **Lançamentos:** simplificar filtros, indicadores, gráficos, lista, orçamentos e as janelas de Categorias e Regras; manter edição, status, gráficos e todas as ações. Harmonizar também a entrada/cadastro e telas de estado/erro com o mesmo sistema visual.

## Limites técnicos
Somente apresentação: estilos globais, componentes visuais compartilhados e marcação/classes das páginas existentes quando necessário. Sem migrações, novas consultas, alterações de funções financeiras, modelos, rotas, dados, autenticação ou fluxos. Reaproveitar os componentes presentes; não reconstruir páginas nem remover conteúdo.

## Verificação
- Registrar os valores e dados mostrados antes da mudança e conferir que permanecem idênticos depois, inclusive gráficos.
- Revisar todas as páginas em desktop e celular: hierarquia, legibilidade, ausência de rolagem horizontal indevida, controles acessíveis e estados vazios/janelas.
- Testar os fluxos visuais principais com sessão ativa, especialmente seleção de mês, edição/marcação de lançamento, filtros e abertura dos formulários; confirmar compilação e ausência de erros na interface.
