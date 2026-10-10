import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RESPONSIBILITIES, type Responsibility } from "@/lib/personal-finance";

export function InvoiceResponsibility({ value, ownValue, onChange, onOwnChange, label = "Responsabilidade", disabled = false }: {
  value: Responsibility; ownValue: string; onChange: (value: Responsibility) => void;
  onOwnChange: (value: string) => void; label?: string; disabled?: boolean;
}) {
  return <div className="min-w-0 space-y-2">
    <span className="text-xs text-muted-foreground">Responsabilidade</span>
    <Select value={value} onValueChange={v => onChange(v as Responsibility)} disabled={disabled}>
      <SelectTrigger aria-label={label} className="min-h-11"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(RESPONSIBILITIES).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent>
    </Select>
    {value === "shared" && <label className="block text-xs text-muted-foreground">Minha parte (R$)<Input aria-label={`Minha parte — ${label}`} inputMode="decimal" value={ownValue} disabled={disabled} onChange={e => onOwnChange(e.target.value)} placeholder="Não informada" /></label>}
  </div>;
}