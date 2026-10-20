"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";
import { balanceProduction } from "@/components/production/floor-balance";

type Technician = {
  id: string;
  userId: string;
  status: string;
  displayName: string;
  profile: string | null;
  dailyRate: number;
  piecesPerDay: number;
};
type CheckinCode = { purpose: "production" | "quality"; codeValue: string };
type OutlookDay = { workDate: string; orderValue: number; pieces: number };
type PeriodKind = "week" | "fortnight" | "month";

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(copy, diff);
}

function defaultUntil(today = new Date()) {
  return isoDate(addDays(startOfWeek(today), 6));
}

function periodRange(kind: PeriodKind, until: string) {
  const end = new Date(`${until}T12:00:00`);
  if (Number.isNaN(end.getTime())) {
    return { from: until, to: until };
  }
  if (kind === "month") {
    const from = new Date(end.getFullYear(), end.getMonth(), 1);
    const to = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    return { from: isoDate(from), to: isoDate(to) };
  }
  const span = kind === "week" ? 6 : 14;
  return { from: isoDate(addDays(end, -span)), to: isoDate(end) };
}

function eachDate(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function weekdayLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FloorGradeWorkspace() {
  const { apiJson, session } = useSession();
  const branchId = session?.activeBranchId ?? "";
  const [kind, setKind] = useState<PeriodKind>("week");
  const [until, setUntil] = useState(defaultUntil);
  const range = useMemo(() => periodRange(kind, until), [kind, until]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [outlook, setOutlook] = useState<Record<string, OutlookDay>>({});
  const [marks, setMarks] = useState<Record<string, string[]>>({});
  const [includedIds, setIncludedIds] = useState<string[]>([]);
  const [pickId, setPickId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dates = useMemo(() => eachDate(range.from, range.to), [range.from, range.to]);
  const activeTechnicians = technicians.filter((person) => person.status === "active" && person.profile === "tecnico");
  const visibleTechnicians = activeTechnicians.filter((person) => includedIds.includes(person.id));
  const availableTechnicians = activeTechnicians.filter((person) => !includedIds.includes(person.id));

  const load = useCallback(async () => {
    if (!branchId || dates.length === 0 || dates.length > 31) return;
    const [techs, schedule, forecast] = await Promise.all([
      apiJson<Technician[]>("/floor-schedule/technicians"),
      apiJson<{ days: Array<{ technicianId: string; workDate: string }> }>(
        `/floor-schedule/days?branchId=${branchId}&from=${range.from}&to=${range.to}`,
      ),
      apiJson<{ days: OutlookDay[] }>(`/floor-schedule/outlook?branchId=${branchId}&from=${range.from}&to=${range.to}`),
    ]);
    setTechnicians(techs);
    const next: Record<string, string[]> = {};
    for (const day of schedule.days) {
      next[day.technicianId] = [...(next[day.technicianId] ?? []), day.workDate.slice(0, 10)];
    }
    setMarks(next);
    const tecnicoIds = new Set(
      techs.filter((person) => person.status === "active" && person.profile === "tecnico").map((person) => person.id),
    );
    const markedIds = Object.entries(next)
      .filter(([id, days]) => days.length > 0 && tecnicoIds.has(id))
      .map(([id]) => id);
    setIncludedIds((current) => [...new Set([...current, ...markedIds])]);
    const byDay: Record<string, OutlookDay> = {};
    for (const day of forecast.days) {
      byDay[day.workDate.slice(0, 10)] = { ...day, workDate: day.workDate.slice(0, 10) };
    }
    setOutlook(byDay);
  }, [apiJson, branchId, dates.length, range.from, range.to]);

  useEffect(() => {
    void load().catch((reason) => setError(describeWorkspaceError(reason, "A grade não abriu.")));
  }, [load]);

  useEffect(() => {
    const refreshPeople = () => {
      void apiJson<Technician[]>("/floor-schedule/technicians")
        .then(setTechnicians)
        .catch((reason) => setError(describeWorkspaceError(reason, "A grade não abriu.")));
    };
    window.addEventListener("anexsys:collaborators-changed", refreshPeople);
    return () => window.removeEventListener("anexsys:collaborators-changed", refreshPeople);
  }, [apiJson]);

  function includeTechnician() {
    if (!pickId) return;
    setIncludedIds((current) => (current.includes(pickId) ? current : [...current, pickId]));
    setPickId("");
  }

  function toggle(technicianId: string, date: string) {
    setMarks((current) => {
      const datesForPerson = new Set(current[technicianId] ?? []);
      if (datesForPerson.has(date)) datesForPerson.delete(date);
      else datesForPerson.add(date);
      return { ...current, [technicianId]: [...datesForPerson] };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiJson("/floor-schedule/days", {
        method: "PUT",
        body: JSON.stringify({
          branchId,
          from: range.from,
          to: range.to,
          marks: visibleTechnicians.map((person) => ({ technicianId: person.id, dates: marks[person.id] ?? [] })),
        }),
      });
      setMessage("Escala gravada.");
    } catch (reason) {
      setError(describeWorkspaceError(reason, "A escala não foi gravada."));
    } finally {
      setSaving(false);
    }
  }

  async function printSheet(purpose: "production" | "quality") {
    setError(null);
    try {
      const codes = await apiJson<CheckinCode[]>(`/floor-schedule/checkin-codes?branchId=${branchId}`);
      const code = codes.find((item) => item.purpose === purpose);
      if (!code) return;
      const branchName = session?.branches.find((branch) => branch.id === branchId)?.label ?? "Filial";
      const url = `${window.location.origin}/floor/${code.codeValue}`;
      const title = purpose === "production" ? "Check-in da produção" : "Check-in da qualidade";
      const instruction = purpose === "production" ? "Leia para informar seu nome" : "Leia para revisar";
      const popup = window.open("", "_blank", "width=900,height=1100");
      if (!popup) {
        setError("O navegador bloqueou a impressão.");
        return;
      }
      popup.document.write(`<!doctype html><html><head><title>${title}</title>
        <style>
          @page { size: A5; margin: 12mm; }
          body { font-family: Arial, sans-serif; text-align: center; color: #162033; }
          h1 { font-size: 28px; margin-bottom: 8px; }
          p { font-size: 18px; }
          img { width: 78mm; height: 78mm; }
        </style></head><body>
        <p>ANEXSYS</p>
        <h1>${title}</h1>
        <p>${instruction}</p>
        <img alt="${title}" src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}" />
        <p>${branchName}</p>
      </body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O QR não foi impresso."));
    }
  }

  const costByDay = dates.map((date) =>
    visibleTechnicians.reduce((sum, person) => sum + ((marks[person.id] ?? []).includes(date) ? person.dailyRate : 0), 0),
  );
  const orderByDay = dates.map((date) => outlook[date]?.orderValue ?? 0);
  const dueByDay = dates.map((date) => outlook[date]?.pieces ?? 0);
  const capacityByDay = dates.map((date) =>
    visibleTechnicians.reduce((sum, person) => sum + ((marks[person.id] ?? []).includes(date) ? person.piecesPerDay : 0), 0),
  );
  const produceByDay = balanceProduction(dueByDay, capacityByDay);
  const periodTooLong = dates.length > 31;

  return (
    <section className="mini-card">
      <h3>Grade de planejamento</h3>
      <p>Inclua o técnico e marque os dias. Semana e quinzena terminam na data de Até. Mês abre o mês dessa data.</p>
      {message ? <p className="field__hint">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      <div className="button-row">
        {(["week", "fortnight", "month"] as const).map((item) => (
          <button className={kind === item ? "button" : "button-secondary"} key={item} onClick={() => setKind(item)} type="button">
            {item === "week" ? "Semana" : item === "fortnight" ? "Quinzena" : "Mês"}
          </button>
        ))}
        <label className="field floor-until">
          Até
          <input className="input" onChange={(event) => setUntil(event.target.value)} type="date" value={until} />
        </label>
      </div>
      {periodTooLong ? <p className="error-text">O período da grade vai até um mês.</p> : null}
      <div className="button-row">
        <select className="input" onChange={(event) => setPickId(event.target.value)} value={pickId}>
          <option value="">Incluir técnico</option>
          {availableTechnicians.map((person) => (
            <option key={person.id} value={person.id}>{person.displayName}</option>
          ))}
        </select>
        <button className="button-secondary" disabled={!pickId} onClick={includeTechnician} type="button">Incluir</button>
      </div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Técnico</th>
              {dates.map((date) => <th key={date}>{weekdayLabel(date)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleTechnicians.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 1}>Inclua um técnico para montar a grade.</td>
              </tr>
            ) : null}
            {visibleTechnicians.map((person) => (
              <tr key={person.id}>
                <td>
                  {person.displayName}
                  <span className="field__hint"> {money(person.dailyRate)} · {person.piecesPerDay} peças/dia</span>
                </td>
                {dates.map((date) => {
                  const marked = (marks[person.id] ?? []).includes(date);
                  return (
                    <td key={date}>
                      <button
                        aria-pressed={marked}
                        className={`floor-day${marked ? " button" : " button-secondary"}`}
                        onClick={() => toggle(person.id, date)}
                        type="button"
                      >
                        {marked ? money(person.dailyRate) : "Não"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="floor-band">
              <td colSpan={dates.length + 1}>Resultado financeiro</td>
            </tr>
            <tr>
              <td>Custo da diária</td>
              {costByDay.map((value, index) => <td key={dates[index]}>{money(value)}</td>)}
            </tr>
            <tr>
              <td>Valor da OS</td>
              {orderByDay.map((value, index) => <td key={dates[index]}>{money(value)}</td>)}
            </tr>
            <tr>
              <td>Resultado</td>
              {dates.map((date, index) => {
                const result = orderByDay[index] - costByDay[index];
                return <td className={result < 0 ? "floor-negative" : undefined} key={date}>{money(result)}</td>;
              })}
            </tr>
            <tr className="floor-band">
              <td colSpan={dates.length + 1}>Esteira de produtividade</td>
            </tr>
            <tr>
              <td>Capacidade</td>
              {capacityByDay.map((value, index) => <td key={dates[index]}>{value}</td>)}
            </tr>
            <tr>
              <td>Peças na previsão</td>
              {dueByDay.map((value, index) => <td key={dates[index]}>{value}</td>)}
            </tr>
            <tr>
              <td>A produzir</td>
              {produceByDay.map((value, index) => <td key={dates[index]}>{value}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="button-row">
        <button className="button" disabled={saving || !branchId || periodTooLong} onClick={() => void save()} type="button">Gravar</button>
        <button className="button-secondary" onClick={() => void printSheet("production")} type="button">Imprimir check-in da produção</button>
        <button className="button-secondary" onClick={() => void printSheet("quality")} type="button">Imprimir check-in da qualidade</button>
      </div>
    </section>
  );
}
