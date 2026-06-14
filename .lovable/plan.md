## Gráfico termômetro mensal (saídas vs entradas)

### O que será feito
1. **Novo componente reutilizável** `MonthThermometer`:
   - Recebe os totais de entradas e saídas do mês.
   - Calcula o percentual: `min((saídas / entradas) * 100, 100)` (com proteção contra divisão por zero).
   - Exibe uma barra de progresso estilo bullet chart / termômetro com fundo `neu-inset` e preenchimento em cor `danger` que avança da esquerda para a direita.
   - Mostra o percentual numeramente ao lado ou sobre a barra, com label "Saídas / Entradas".
   - Mantém o visual limpo e consistente com o neumorfismo já presente (sombras, bordas arredondadas, paleta do tema).

2. **Integração na página** `src/routes/_authenticated/conferencia.tsx`:
   - Inserir o componente **dentro do card da tabela**, abaixo do `<tbody>` e antes do fechamento do wrapper da tabela (ou logo após a tabela, antes dos botões de adicionar), conforme solicitado — "abaixo das linhas de lançamentos".
   - Alimentar com os `totals.entradas` e `totals.saidas` já calculados via `useMemo`.

### Não será alterado
- Nenhuma lógica de backend ou banco de dados.
- Nenhum pacote adicional (o gráfico é feito com CSS/Tailwind puro).
- A tabela de lançamentos permanece igual.

### Detalhes técnicos
- As cores usarão os tokens semânticos do projeto: `text-primary`/`bg-primary` para entradas e `text-danger`/`bg-danger` para saídas.
- A barra terá largura total, altura confortável (~20–24 px), bordas arredondadas (`rounded-full`), sombra interna no fundo e sombra externa sutil no preenchimento.
- Se entradas = 0, a barra permanece vazia e exibe "—" ou "0%".
- O componente pode ser definido no próprio arquivo da rota ou em `src/components/` se preferir isolamento.