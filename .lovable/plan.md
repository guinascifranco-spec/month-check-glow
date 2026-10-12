# Sidebar do Month Check

## Resultado esperado
Substituir as abas superiores e a barra inferior por uma única sidebar à esquerda, fixa no desktop, recolhível até uma faixa de ícones e aberta como painel temporário em telas menores. Todas as 11 áreas atuais permanecem acessíveis pelas mesmas rotas, sem qualquer alteração financeira, de autenticação ou de dados.

## Estrutura confirmada
- As 11 páginas autenticadas repetem `PageTabs` e `MobileNav`, além de cabeçalhos com logotipo e saída.
- O layout autenticado atual apenas protege a sessão e renderiza a página; ele é o ponto mínimo e correto para montar uma navegação compartilhada.
- O projeto já possui sidebar, painel móvel, tooltips, botões, ícones e tokens visuais necessários. Nenhuma biblioteca nova será instalada.
- O componente de sidebar atual usa referências de largura que precisam da forma explícita `var(...)` para evitar sobreposição no Tailwind 4.

## Implementação
1. Criar a sidebar compartilhada com o logotipo Month Check, destaque automático pela rota atual e estes grupos visuais, sem mudar nomes ou endereços:
   - **Planejamento:** Conferência, Visão Geral, Visão Futura.
   - **Dia a dia:** Lançamentos, Contas, Movimentações.
   - **Compromissos:** Parcelas, Cartões e faturas, Vale-alimentação.
   - **Patrimônio:** Investimentos.
   - **Ferramentas:** Analisar fatura.
2. Colocar no rodapé da sidebar o controle de tema e **Sair**, preservando o encerramento de sessão existente. Exibir tooltips no modo recolhido e fechar o painel móvel após escolher uma área.
3. Transformar o layout autenticado no shell comum: provider, sidebar fixa, área de conteúdo flexível e uma barra compacta com acionador sempre visível. No celular, o acionador abre e fecha o painel; no desktop, alterna entre menu completo e ícones.
4. Remover das 11 páginas somente `PageTabs`, `MobileNav` e os elementos globais agora centralizados (logotipo e saída). Preservar títulos de contexto, ações próprias — como backup e instalação — e todo o conteúdo interno das páginas.
5. Ajustar os tokens semânticos da sidebar aos modos claro e escuro atuais e corrigir suas classes de largura para `var(--sidebar-width)`, garantindo que o conteúdo reserve o espaço certo sem sobreposição.
6. Retirar os dois componentes antigos de navegação após confirmar que nenhuma página ainda os utiliza.

## Limites
- Nenhuma mudança em banco, migrações, consultas, cálculos, lançamentos, autenticação, integrações ou rotas.
- Nenhuma página financeira será recriada e nenhuma ação existente será removida.
- A alteração fica restrita ao shell autenticado, componentes de navegação, estilos semânticos e à retirada da navegação repetida nas páginas.

## Verificação
- Confirmar build e tipagem sem erros.
- Com sessão autenticada, percorrer as 11 rotas pela sidebar e conferir o item ativo em cada uma.
- Testar desktop expandido e recolhido, incluindo tooltips e espaço reservado para o conteúdo.
- Testar uma tela menor: abrir, navegar, fechar o painel e verificar ausência de cortes, sobreposição e rolagem horizontal indevida.
- Conferir visualmente páginas largas e densas, especialmente Conferência, Lançamentos, Faturas e Investimentos, sem salvar nem modificar registros financeiros.
- Confirmar que tema, instalação, backup e saída continuam acessíveis nos locais adequados.
