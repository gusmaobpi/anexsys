"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useSession } from "@/components/providers/session-provider";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type WorkGroupMember = {
  userId: string;
  displayName: string;
  email: string;
};

type WorkGroupRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  members: WorkGroupMember[];
};

type UserOption = {
  id: string;
  displayName: string;
  email: string;
};

export function WorkGroupsWorkspace() {
  useWorkspaceRegistration({
    label: "Grupos de trabalho",
    subtitle: "Não altera a permissão",
  });
  const { hasAnyPermission, apiJson } = useSession();
  const canRead = hasAnyPermission("users.read");
  const canWrite = hasAnyPermission("users.write");
  const [groups, setGroups] = useState<WorkGroupRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setGroups([]);
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextGroups, nextUsers] = await Promise.all([
        apiJson<WorkGroupRecord[]>("/work-groups"),
        apiJson<UserOption[]>("/users"),
      ]);
      setGroups(nextGroups);
      setUsers(nextUsers);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "Os grupos de trabalho não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(group: WorkGroupRecord) {
    const userId = selectedUserId[group.id];
    if (!userId) {
      setMessage("Escolha a pessoa para colocar neste grupo.");
      return;
    }
    setSavingGroupId(group.id);
    setMessage(null);
    try {
      const next = await apiJson<WorkGroupRecord[]>(`/work-groups/${group.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setGroups(next);
      const person = users.find((user) => user.id === userId);
      setMessage(`${person?.displayName ?? "A pessoa"} foi para o grupo ${group.displayName}.`);
      setSelectedUserId((current) => ({ ...current, [group.id]: "" }));
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A pessoa não pôde entrar no grupo."));
    } finally {
      setSavingGroupId(null);
    }
  }

  if (!canRead) {
    return <p className="table-subtle">Os grupos de trabalho dependem da permissão de usuários.</p>;
  }

  return (
    <section>
      <div className="workspace-toolbar__copy">
        <h2>Grupos de trabalho</h2>
        <p>Quem trabalha junto. O grupo não muda o que a pessoa pode fazer: isso continua no papel e na filial.</p>
      </div>
      {message ? <WorkspaceFlash message={message} /> : null}
      {loading ? <p className="table-subtle">Carregando…</p> : null}
      {groups.map((group) => (
        <article className="mini-section" key={group.id}>
          <h4>{group.displayName}</h4>
          {group.members.length > 0 ? (
            <ul>
              {group.members.map((member) => (
                <li key={member.userId}>
                  {member.displayName}
                  {member.email ? ` · ${member.email}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="table-subtle">Ninguém neste grupo.</p>
          )}
          {canWrite ? (
            <div className="button-row">
              <label className="field">
                <span>Pessoa</span>
                <select
                  value={selectedUserId[group.id] ?? ""}
                  onChange={(event) => setSelectedUserId((current) => ({ ...current, [group.id]: event.target.value }))}
                >
                  <option value="">Escolha</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} · {user.email}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" disabled={savingGroupId === group.id} onClick={() => void assign(group)} type="button">
                Colocar neste grupo
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
