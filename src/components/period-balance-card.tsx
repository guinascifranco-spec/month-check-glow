import { CalendarDays, CalendarRange } from "lucide-react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function PeriodBalanceCard({
  saldo,
  year,
  month,
  isLoading,
}: {
  saldo: number;
  year: number;
  month: number;
  isLoading?: boolean;
}) {
  const now = new Date();
  const total = daysInMonth(year, month);
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const diasRestantes = isCurrentMonth ? total - now.getDate() + 1 : total;
  const isLastDay = isCurrentMonth && diasRestantes === 1;
  const semanasRestantes = Math.max(1, Math.floor(diasRestantes / 7));

  const porDia = saldo / diasRestantes;
  const porSemana = saldo / semanasRestantes;

  const tone =
    saldo > 0 ? "text-primary" : saldo < 0 ? "text-danger" : "text-muted-foreground";

  const subtitle = isLoading
    ? "Calculando..."
    : isLastDay
      ? "Último dia do mês"
      : isCurrentMonth
        ? `Faltam ${diasRestantes} dias para o fim do mês`
        : `Referência do mês inteiro — ${total} dias`;

  return (
    <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Saldo disponível por período
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="neu-inset rounded-2xl p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-foreground/10" />
              <div className="mt-3 h-7 w-28 animate-pulse rounded bg-foreground/10" />
              <div className="mt-3 h-3 w-24 animate-pulse rounded bg-foreground/10" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
            <div className="neu-inset rounded-2xl p-4">
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs font-semibold uppercase tracking-wider">Por dia</span>
              </div>
              <div className={`mt-2 text-xl font-bold tabular-nums sm:text-2xl ${tone}`}>
                {brl.format(porDia)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                para os próximos {diasRestantes} dias
              </div>
            </div>

            <div className="neu-inset rounded-2xl p-4">
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <CalendarRange className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs font-semibold uppercase tracking-wider">Por semana</span>
              </div>
              <div className={`mt-2 text-xl font-bold tabular-nums sm:text-2xl ${tone}`}>
                {brl.format(porSemana)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {semanasRestantes === 1
                  ? "para a próxima semana"
                  : `para as próximas ${semanasRestantes} semanas`}
              </div>
            </div>
          </div>

          {saldo < 0 && (
            <p className="mt-3 text-sm font-medium text-danger">
              ⚠️ Saldo negativo — revise seus gastos
            </p>
          )}
          {saldo === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">Saldo zerado para este mês</p>
          )}
        </>
      )}
    </section>
  );
}
