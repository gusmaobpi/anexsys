"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type TodayPerson = {
  technicianId: string;
  displayName: string;
  presence: "confirmed" | "identified" | "active" | null;
  pickedAt: string | null;
  orderNo: string | null;
};

type DiaryLine = {
  displayName: string;
  orderNo: string;
  action: string;
  happenedAt: string;
};

const presenceLabel = {
  confirmed: "Confirmado",
  identified: "Identificado",
  active: "Ativo",
};

const actionLabel: Record<string, string> = {
  pick_up: "Pegar sacola",
  finish_production: "Terminei",
  pick_up_rework: "Pegar refação",
  finish_rework: "Terminei a refação",
};

export function FloorTodayWorkspace() {
  const { apiJson, session } = useSession();
  const branchId = session?.activeBranchId ?? "";
  const [people, setPeople] = useState<TodayPerson[]>([]);
  const [diary, setDiary] = useState<DiaryLine[]>([]);
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    const response = await apiJson<{ day: string; people: TodayPerson[]; diary: DiaryLine[] }>(
      `/floor-schedule/today?branchId=${branchId}`,
    );
    setDay(response.day);
    setPeople(response.people);
    setDiary(response.diary);
  }, [apiJson, branchId]);

  useEffect(() => {
    void load().catch((reason) => setError(describeWorkspaceError(reason, "A escala de hoje não abriu.")));
  }, [load]);

  return (
    <section className="mini-card">
      <h3>Escala de hoje</h3>
      <p>{day ? `Dia ${day.split("-").reverse().join("/")}.` : "Quem está confirmado, identificado ou ativo."} Sem valor.</p>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.technicianId}>
                <td>{person.displayName}</td>
                <td>{person.presence ? presenceLabel[person.presence] : "—"}</td>
                <td>
                  {person.presence === "active" && person.pickedAt
                    ? `${new Date(person.pickedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}, ao pegar ${person.orderNo}`
                    : person.presence === "identified"
                      ? "Clicou o nome, ainda sem sacola"
                      : "Ainda não leu o QR"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Diário de bordo</h3>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Técnico</th>
              <th>OS</th>
              <th>Passo</th>
            </tr>
          </thead>
          <tbody>
            {diary.map((line, index) => (
              <tr key={`${line.orderNo}-${line.happenedAt}-${index}`}>
                <td>{new Date(line.happenedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{line.displayName}</td>
                <td>{line.orderNo}</td>
                <td>{actionLabel[line.action] ?? line.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
