## Causa raiz

Os inputs monetários mantêm um estado local `valor: string`, mas um `useEffect` sincroniza esse estado toda vez que `row.valor` muda:

```ts
useEffect(() => { setValor(String(row.valor ?? 0)); }, [row.valor]);
```

Fluxo do bug quando o usuário digita rápido "1500,75":
1. A cada tecla, `scheduleSave` reinicia o debounce (1 s).
2. Se o usuário pausa por >1 s em "1500,7", `commitValor` faz `parseFloat` → salva 1500.7.
3. A mutation invalida a query, `row.valor` vira 1500.7.
4. O `useEffect` roda `setValor("1500.7")` — substitui o que estava no input, cursor pula, o próximo caractere digitado (o "5") é aplicado sobre a string reescrita e "some".
5. Idem com `type="number"` + vírgula: "12," vira `parseFloat`=12 → commit → effect reescreve como "12" e a vírgula desaparece.

O mesmo padrão existe em `InvestmentRow` (visão-geral) e no input de "Limite mensal" (parcelas). Nos modais (Nova Compra, aportes, proventos) o estado já é string e não há sync, então não são afetados — mas ainda usam `type="number"` que rejeita vírgula em alguns browsers.

## Correção

1. **`RowItem` em `src/routes/_authenticated/conferencia.tsx`**
   - Não usar `useEffect([row.valor])` para regravar o input. Sincronizar `valor` **apenas quando o id da row muda** (ou quando o input não está focado E o número parseado do estado local difere do `row.valor`).
   - Guardar `isFocused` via `onFocus`/`onBlur`; enquanto focado, nunca sobrescrever.
   - Trocar o `type="number"` dos dois campos de valor por `type="text"` com `inputMode="decimal"` e `pattern="[0-9.,]*"`, aceitando vírgula/ponto sem perder caracteres intermediários.
   - Mesma abordagem para o campo `descricao` (usar sync por `row.id`, não por `row.descricao`).

2. **`InvestmentRow` em `src/routes/_authenticated/visao-geral.tsx`**
   - Já sincroniza por `investment.id` (bom). Trocar os dois `type="number"` (saldo e %) por `type="text"` + `inputMode="decimal"` para não perder vírgula. Fazer a conversão com `parseFloat(v.replace(",", "."))` no debounce.

3. **Limite mensal em `src/routes/_authenticated/parcelas.tsx`**
   - `useEffect(() => setLimitInput(...), [settings?.monthly_limit])` tem o mesmo problema: após 1 s de debounce, a query é invalidada e o input é reescrito. Sincronizar só quando o input não está focado. Manter o `type="number"` aqui é aceitável (campo único, sem vírgula problemática), mas ainda evitar o overwrite durante o foco.

4. **Modais (Nova Compra, Novo Aporte, Novo Provento, Novo Ativo)**
   - Trocar `type="number"` dos campos monetários por `type="text"` + `inputMode="decimal"` para permitir digitar vírgula sem que o browser descarte o caractere. Já são estado string e conversão só no submit — só falta a máscara input mode.

## Detalhes técnicos

Padrão de sync seguro para inputs controlados com debounce:

```ts
const [valor, setValor] = useState(String(row.valor ?? 0));
const focusedRef = useRef(false);
useEffect(() => {
  if (focusedRef.current) return;
  const localNum = parseFloat(valor.replace(",", ".")) || 0;
  if (localNum !== Number(row.valor)) setValor(String(row.valor ?? 0));
}, [row.valor, row.id]);
```

Não vou adicionar `react-number-format` — resolvemos com input `text` + `inputMode="decimal"`, mantendo a stack enxuta. Se depois o usuário quiser máscara "R$ 1.234,56" formatada, aí sim usamos a lib.

## Verificação

- Digitar "1500,75" rapidamente em cada campo (Conferência, Investimentos, Limite, modais) e conferir que nenhum caractere é perdido e a vírgula é aceita.
- Confirmar que o auto-save ainda dispara ~1 s após a última tecla e persiste o valor correto.
- Rebuild sem erros de tipo.