"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type Profile = "tecnico" | "qualidade" | "gerente" | "atendente";

type Collaborator = {
  id: string;
  userId: string;
  status: string;
  displayName: string;
  profile: Profile | null;
  dailyRate: number;
  piecesPerDay: number;
};

type UserOption = { id: string; displayName: string; status: string };

const profileLabel: Record<Profile, string> = {
  tecnico: "Técnico",
  qualidade: "Qualidade",
  gerente: "Gerente",
  atendente: "Atendente",
};

export function FloorCollaboratorsWorkspace() {
  useWorkspaceRegistration({ label: "Colaboradores" });
  const { apiJson } = useSession();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile>("tecnico");
  const [dailyRate, setDailyRate] = useState("0");
  const [piecesPerDay, setPiecesPerDay] = useState("0");
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [people, registered] = await Promise.all([
      apiJson<UserOption[]>("/floor-schedule/candidates"),
      apiJson<Collaborator[]>("/floor-schedule/technicians"),
    ]);
    setUsers(people.filter((person) => person.status === "active"));
    setCollaborators(registered);
  }, [apiJson]);

  useEffect(() => {
    void load().catch((reason) => setError(describeWorkspaceError(reason, "O cadastro não abriu.")));
  }, [load]);

  function selectUser(nextUserId: string) {
    setUserId(nextUserId);
    const current = collaborators.find((person) => person.userId === nextUserId);
    if (!current) {
      setProfile("tecnico");
      setDailyRate("0");
      setPiecesPerDay("0");
      setActive(true);
      return;
    }
    setProfile(current.profile ?? "tecnico");
    setDailyRate(String(current.dailyRate));
    setPiecesPerDay(String(current.piecesPerDay));
    setActive(current.status === "active");
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await apiJson<Collaborator[]>("/floor-schedule/collaborators", {
        method: "PUT",
        body: JSON.stringify({
          userId,
          profile,
          dailyRate: Number(dailyRate.replace(",", ".")),
          piecesPerDay: Number(piecesPerDay),
          status: active ? "active" : "inactive",
        }),
      });
      setCollaborators(saved);
      window.dispatchEvent(new Event("anexsys:collaborators-changed"));
      setMessage("Colaborador gravado. O perfil passa a valer no acesso dessa pessoa.");
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O colaborador não foi gravado."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mini-card">
      <h3>Colaboradores</h3>
      <p>Associe a pessoa a um perfil. A diária e a média de peças entram na grade só para o Técnico.</p>
      {message ? <p className="field__hint">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      <div className="button-row">
        <label className="field">
          Pessoa
          <select className="input" onChange={(event) => selectUser(event.target.value)} value={userId}>
            <option value="">Escolher</option>
            {users.map((person) => (
              <option key={person.id} value={person.id}>{person.displayName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Perfil
          <select className="input" onChange={(event) => setProfile(event.target.value as Profile)} value={profile}>
            {(Object.keys(profileLabel) as Profile[]).map((item) => (
              <option key={item} value={item}>{profileLabel[item]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Valor da diária
          <input className="input" inputMode="decimal" onChange={(event) => setDailyRate(event.target.value)} value={dailyRate} />
        </label>
        <label className="field">
          Média de peças por dia
          <input className="input" inputMode="numeric" onChange={(event) => setPiecesPerDay(event.target.value)} value={piecesPerDay} />
        </label>
        <label className="field">
          <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" /> Ativo
        </label>
        <button className="button" disabled={saving || !userId} onClick={() => void save()} type="button">Gravar</button>
      </div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Perfil</th>
              <th>Diária</th>
              <th>Peças por dia</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {collaborators.map((person) => (
              <tr key={person.id}>
                <td>{person.displayName}</td>
                <td>{person.profile ? profileLabel[person.profile] : "Sem perfil"}</td>
                <td>{person.dailyRate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                <td>{person.piecesPerDay}</td>
                <td>{person.status === "active" ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
