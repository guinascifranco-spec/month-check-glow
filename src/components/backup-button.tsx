import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { exportBackup } from "@/lib/backup.functions";

export function BackupButton() {
  const [loading, setLoading] = useState(false);
  const runExport = useServerFn(exportBackup);

  async function handleBackup() {
    try {
      setLoading(true);
      const data = await runExport();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `month_check_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Erro ao exportar backup: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleBackup}
      disabled={loading}
      className="neu-pressable inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
      title="Exportar backup dos dados"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">Backup</span>
    </button>
  );
}
