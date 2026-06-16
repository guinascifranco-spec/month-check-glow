## Adicionar logo do Month Check

### Observação importante sobre a imagem
A imagem fornecida tem **fundo branco sólido** (não transparente). No tema escuro vai aparecer um retângulo branco ao redor do logo. Como upload via Lovable Assets (recomendado para binários), e aplico um dos tratamentos abaixo — me confirme qual prefere, mas vou seguir com a opção **A** por padrão se você só aprovar o plano:

- **A (padrão)**: removo o fundo branco via processamento (gerando PNG transparente) antes de subir como asset. Funciona em ambos os temas sem retângulo branco.
- **B**: mantenho a imagem como está (fundo branco). Fica visível um card branco ao redor do logo no tema escuro.
- **C**: você envia uma versão PNG com fundo já transparente.

### Passos
1. **Upload do logo** via `lovable-assets` CLI (não copio binário para `public/` — Lovable usa CDN via `.asset.json`). Salvo o ponteiro em `src/assets/logo.png.asset.json`. Se opção A: gero versão sem fundo em `/tmp` primeiro e subo essa.
2. **Novo componente** `src/components/logo.tsx` exportando `<Logo />` — `<img>` com `src` do asset, `alt="Month Check"`, `height` fixo (ex.: 32px no header, 56px na auth) e `width: auto` para preservar proporção.
3. **`src/routes/_authenticated/conferencia.tsx`** (header): substituo o bloco `<h1>Month Check</h1>` + subtítulo por `<Logo />` + subtítulo mantido.
4. **`src/routes/auth.tsx`**: substituo `<h1>Month Check</h1>` por `<Logo />` centralizado, mantendo o subtítulo.
5. **`src/routes/__root.tsx`**: adiciono `<link rel="icon">` apontando para o asset (favicon).

### Não muda
- Schema/banco, server functions, lógica de auth, tema/cores.
