"use client";

import { useEffect, useId, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type DayBoard = {
  from: string;
  to: string;
  days: Array<{ workDate: string; names: string[] }>;
};

const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function dayParts(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return {
    day,
    monthLabel: MONTHS[month - 1] ?? "",
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "",
  };
}

function monthGroups(days: DayBoard["days"]) {
  const groups: Array<{ label: string; span: number }> = [];
  for (const day of days) {
    const label = dayParts(day.workDate).monthLabel;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      groups.push({ label, span: 1 });
    }
  }
  return groups;
}

export function FloorDayBoardChip() {
  const { apiJson, session } = useSession();
  const branchId = session?.activeBranchId ?? "";
  const branchName = session?.branches.find((branch) => branch.id === branchId)?.label ?? "Filial";
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<DayBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!branchId) {
      setBoard(null);
      setError("Selecione a filial para ver a grade do dia.");
      return;
    }
    let cancelled = false;
    setError(null);
    void apiJson<DayBoard>(`/floor-schedule/day-board?branchId=${branchId}`)
      .then((next) => {
        if (!cancelled) {
          setBoard(next);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setBoard(null);
          setError(describeWorkspaceError(reason, "A grade do dia não abriu."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, branchId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = board ? monthGroups(board.days) : [];

  return (
    <>
      <button
        aria-expanded={open}
        className={`topbar-chip${open ? " topbar-chip--active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Grade do Dia
      </button>
      {open ? (
        <div aria-labelledby={titleId} aria-modal="true" className="day-board-lightbox" role="dialog">
          <button aria-label="Fechar grade do dia" className="day-board-lightbox__backdrop" onClick={() => setOpen(false)} type="button" />
          <section className="day-board-card">
            <div className="day-board-card__head">
              <div>
                <h2 id={titleId}>Grade do Dia</h2>
                <p>{branchName}. Hoje e os cinco dias seguintes.</p>
              </div>
              <button className="button-secondary" onClick={() => setOpen(false)} type="button">
                Fechar
              </button>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {!board && !error ? <p className="field__hint">Carregando…</p> : null}
            {board ? (
              <div className="data-table-wrapper">
                <table className="data-table day-board-table">
                  <thead>
                    <tr>
                      {groups.map((group) => (
                        <th className="day-board-month" colSpan={group.span} key={`${group.label}-${group.span}`}>
                          {group.label}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {board.days.map((day) => (
                        <th key={`${day.workDate}-day`}>{dayParts(day.workDate).day}</th>
                      ))}
                    </tr>
                    <tr>
                      {board.days.map((day) => (
                        <th className="day-board-weekday" key={`${day.workDate}-week`}>
                          {dayParts(day.workDate).weekday}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {board.days.map((day) => (
                        <td key={day.workDate}>
                          {day.names.length === 0
                            ? "—"
                            : day.names.map((name) => (
                                <div key={name}>{name}</div>
                              ))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
