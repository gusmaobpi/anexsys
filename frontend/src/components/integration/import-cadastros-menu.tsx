"use client";

import { useRef, useState } from "react";
import { IntegrationResultsModal } from "@/components/integration/integration-results-modal";
import { readLayoutRows } from "@/components/integration/read-layout-sheet";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

export type ImportKind =
  | "body-parts"
  | "units"
  | "products"
  | "services"
  | "prices"
  | "minute-rates"
  | "users"
  | "customers"
  | "measurements"
  | "service-orders";

export function useImportCadastros(onFinished: (message: string) => void | Promise<void>, kinds: ImportKind[] = []) {
  const { apiJson } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const kindRef = useRef<ImportKind | null>(null);
  const [activeKind, setActiveKind] = useState<ImportKind | null>(null);
  const [pending, setPending] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const settledRunRef = useRef<string | null>(null);

  const open = (kind: ImportKind) => {
    kindRef.current = kind;
    setActiveKind(kind);
    inputRef.current?.click();
  };

  const openResults = () => setResultsOpen(true);

  const onFile = async (file: File | undefined) => {
    const kind = kindRef.current;
    if (!file || !kind) return;
    setPending(true);
    try {
      const rows = await readLayoutRows(file);
      if (rows.length === 0) {
        await onFinished("A planilha não tem linhas para importar.");
        return;
      }
      const started = await apiJson<{ id: string }>(`/integration/import/${kind}`, {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setActiveRunId(started.id);
      setResultsOpen(true);
    } catch (error) {
      await onFinished(describeWorkspaceError(error, "A planilha não foi importada."));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const input = (
    <input
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        void onFile(file);
      }}
      ref={inputRef}
      type="file"
    />
  );

  const panel = resultsOpen ? (
    <IntegrationResultsModal
      kinds={kinds.length > 0 ? kinds : activeKind ? [activeKind] : []}
      onClose={() => setResultsOpen(false)}
      onSettled={() => {
        if (!activeRunId || settledRunRef.current === activeRunId) return;
        settledRunRef.current = activeRunId;
        void onFinished("Migração concluída. A grade de resultados está atualizada.");
      }}
      runId={activeRunId}
    />
  ) : null;

  return { activeKind, input, open, openResults, panel, pending };
}
