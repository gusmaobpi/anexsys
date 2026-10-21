"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  accessStatusLabel,
  applyAccessCommunityListFilters,
  applyAccessPermissionListFilters,
  applyAccessRoleListFilters,
  applyAccessUserListFilters,
  buildAccessCommunityExcelCsv,
  buildAccessPermissionExcelCsv,
  buildAccessRoleExcelCsv,
  buildAccessUserEmailCsv,
  buildAccessUserExcelCsv,
  userStatusLabel,
  type AccessCommunityListRecord,
  type AccessPermissionListRecord,
  type AccessRoleListRecord,
  type AccessUserListRecord,
} from "@/components/admin/access-list";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import {
  MasterDataDuplicateGuard,
  normalizeEmailValue,
} from "@/components/ui/master-data-duplicate-guard";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";
import { SmartLookup, type SmartLookupOption } from "@/components/ui/smart-lookup";

type BranchRecord = {
  id: string;
  code: string;
  displayName: string;
  legalName: string;
  status: "active" | "inactive";
};

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  defaultBranchId: string | null;
  status: "active" | "invited" | "inactive";
  isMaster?: boolean;
};

type RoleRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  status: "active" | "inactive";
  isSystemManaged: boolean;
};

type PermissionRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
};

type CommunityRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  status: "active" | "inactive";
};

type AccessSummary = {
  roles: Array<{
    assignmentId: string;
    roleId: string;
    code: string;
    displayName: string;
    assignedBranchId: string | null;
    assignedBranchLabel: string | null;
  }>;
  communities: Array<{
    membershipId: string;
    communityId: string;
    code: string;
    displayName: string;
  }>;
  branchScopes: Array<{
    scopeId: string;
    branchId: string;
    branchLabel: string;
    scopeType: "member" | "manager" | "admin";
  }>;
  effectiveAccess: {
    branchIds: string[];
    permissions: string[];
    communities: string[];
  };
};

type UserForm = {
  email: string;
  displayName: string;
  password: string;
  defaultBranchId: string;
  status: "active" | "invited" | "inactive";
};

type RoleForm = {
  code: string;
  displayName: string;
  description: string;
  status: "active" | "inactive";
  isSystemManaged: boolean;
};

type PermissionForm = {
  code: string;
  displayName: string;
  description: string;
};

type CommunityForm = {
  code: string;
  displayName: string;
  description: string;
  status: "active" | "inactive";
};

type AccessTab = "users" | "roles" | "permissions" | "communities";

const emptyUserForm = (): UserForm => ({
  email: "",
  displayName: "",
  password: "",
  defaultBranchId: "",
  status: "active",
});

const emptyRoleForm = (): RoleForm => ({
  code: "",
  displayName: "",
  description: "",
  status: "active",
  isSystemManaged: false,
});

const emptyPermissionForm = (): PermissionForm => ({
  code: "",
  displayName: "",
  description: "",
});

const emptyCommunityForm = (): CommunityForm => ({
  code: "",
  displayName: "",
  description: "",
  status: "active",
});

function mapUserToForm(user: UserRecord): UserForm {
  return {
    email: user.email,
    displayName: user.displayName,
    password: "",
    defaultBranchId: user.defaultBranchId ?? "",
    status: user.status,
  };
}

function mapRoleToForm(role: RoleRecord): RoleForm {
  return {
    code: role.code,
    displayName: role.displayName,
    description: role.description ?? "",
    status: role.status,
    isSystemManaged: role.isSystemManaged,
  };
}

function mapPermissionToForm(permission: PermissionRecord): PermissionForm {
  return {
    code: permission.code,
    displayName: permission.displayName,
    description: permission.description ?? "",
  };
}

function mapCommunityToForm(community: CommunityRecord): CommunityForm {
  return {
    code: community.code,
    displayName: community.displayName,
    description: community.description ?? "",
    status: community.status,
  };
}

function accessTabLabel(tab: AccessTab) {
  if (tab === "roles") return "Papéis";
  if (tab === "permissions") return "Permissões";
  if (tab === "communities") return "Comunidades";
  return "Usuários";
}

export function AccessWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const accessTabParam = searchParams.get("accessTab");
  const focusUserId = searchParams.get("focusUserId");
  const focusRoleId = searchParams.get("focusRoleId");
  const focusPermissionId = searchParams.get("focusPermissionId");
  const focusCommunityId = searchParams.get("focusCommunityId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const formDomain: AccessTab | null = focusRoleId
    ? "roles"
    : focusPermissionId
      ? "permissions"
      : focusCommunityId
        ? "communities"
        : focusUserId
          ? "users"
          : workspaceMode === "new"
            ? accessTabParam === "roles" || accessTabParam === "permissions" || accessTabParam === "communities"
              ? accessTabParam
              : "users"
            : null;
  const isFormWorkspace = formDomain !== null;
  const isUserFormWorkspace = formDomain === "users";
  const isRoleFormWorkspace = formDomain === "roles";
  const isPermissionFormWorkspace = formDomain === "permissions";
  const isCommunityFormWorkspace = formDomain === "communities";
  const isListWorkspace = !isFormWorkspace;
  const { closeWorkspace } = useWorkspaceManager();
  const { hasAnyPermission, apiJson, session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const canReadUsers = hasAnyPermission("users.read");
  const canWriteUsers = hasAnyPermission("users.write");
  const canReadRoles = hasAnyPermission("roles.read");
  const canWriteRoles = hasAnyPermission("roles.write");
  const canReadPermissions = hasAnyPermission("permissions.read");
  const canWritePermissions = hasAnyPermission("permissions.write");
  const canReadCommunities = hasAnyPermission("communities.read");
  const canReadBranches = hasAnyPermission("branches.read");
  const canWriteCommunities = false;

  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [activeTab, setActiveTab] = useWorkspaceScopedState<AccessTab>("access.activeTab", "users");
  const listTab: AccessTab =
    accessTabParam === "roles" || accessTabParam === "permissions" || accessTabParam === "communities" || accessTabParam === "users"
      ? accessTabParam
      : activeTab;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [activeUserId, setActiveUserId] = useWorkspaceScopedState<string | null>("access.activeUserId", null);
  const [activeRoleId, setActiveRoleId] = useWorkspaceScopedState<string | null>("access.activeRoleId", null);
  const [activePermissionId, setActivePermissionId] = useWorkspaceScopedState<string | null>("access.activePermissionId", null);
  const [activeCommunityId, setActiveCommunityId] = useWorkspaceScopedState<string | null>("access.activeCommunityId", null);
  const [userSummary, setUserSummary] = useState<AccessSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showCreatePermission, setShowCreatePermission] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);

  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [userDuplicateStatus, setUserDuplicateStatus] = useState<"idle" | "checking" | "duplicate">("idle");
  const [userDuplicateMatch, setUserDuplicateMatch] = useState<UserRecord | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRoleForm);
  const [permissionForm, setPermissionForm] = useState<PermissionForm>(emptyPermissionForm);
  const [communityForm, setCommunityForm] = useState<CommunityForm>(emptyCommunityForm);

  const [assignRoleId, setAssignRoleId] = useState("");
  const [assignRoleBranchId, setAssignRoleBranchId] = useState("");
  const [assignRoleAllBranches, setAssignRoleAllBranches] = useState(false);
  const [assignPermissionToRoleId, setAssignPermissionToRoleId] = useState("");
  const [assignPermissionToCommunityId, setAssignPermissionToCommunityId] = useState("");
  const [assignCommunityId, setAssignCommunityId] = useState("");
  const [assignBranchScopeId, setAssignBranchScopeId] = useState("");
  const [assignBranchScopeType, setAssignBranchScopeType] = useState<"member" | "manager" | "admin">("member");

  const userListRecords = useMemo<AccessUserListRecord[]>(
    () =>
      users.map((user) => ({
        ...user,
        defaultBranchLabel: branches.find((branch) => branch.id === user.defaultBranchId)?.displayName,
      })),
    [branches, users],
  );
  const userLookupOptions = useMemo(
    () => users.map((user) => ({ id: user.id, label: user.displayName, hint: user.email })),
    [users],
  );
  const roleLookupOptions = useMemo(
    () => roles.map((role) => ({ id: role.id, label: role.displayName, hint: role.code })),
    [roles],
  );
  const permissionLookupOptions = useMemo(
    () => permissions.map((permission) => ({ id: permission.id, label: permission.displayName, hint: permission.code })),
    [permissions],
  );
  const communityLookupOptions = useMemo(
    () => communities.map((community) => ({ id: community.id, label: community.displayName, hint: community.code })),
    [communities],
  );

  const activeUser = useMemo(
    () => users.find((record) => record.id === (focusUserId || activeUserId)) ?? null,
    [activeUserId, focusUserId, users],
  );
  const activeRole = useMemo(
    () => roles.find((record) => record.id === (focusRoleId || activeRoleId)) ?? null,
    [activeRoleId, focusRoleId, roles],
  );
  const activePermission = useMemo(
    () => permissions.find((record) => record.id === (focusPermissionId || activePermissionId)) ?? null,
    [activePermissionId, focusPermissionId, permissions],
  );
  const activeCommunity = useMemo(
    () => communities.find((record) => record.id === (focusCommunityId || activeCommunityId)) ?? null,
    [activeCommunityId, communities, focusCommunityId],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label:
      formDomain === "roles"
        ? workspaceMode === "new"
          ? "Papel: Novo"
          : activeRole
            ? `Papel: ${activeRole.displayName}`
            : "Papéis"
        : formDomain === "permissions"
          ? workspaceMode === "new"
            ? "Permissão: Nova"
            : activePermission
              ? `Permissão: ${activePermission.displayName}`
              : "Permissões"
          : formDomain === "communities"
            ? workspaceMode === "new"
              ? "Comunidade: Nova"
              : activeCommunity
                ? `Comunidade: ${activeCommunity.displayName}`
                : "Comunidades"
            : workspaceMode === "new"
              ? "Usuário: Novo"
              : activeUser && isUserFormWorkspace
                ? `Usuário: ${activeUser.displayName}`
                : "Usuários e Acessos",
    subtitle:
      workspaceMode === "new"
        ? "Novo cadastro"
        : formDomain === "roles"
          ? activeRole?.code ?? null
          : formDomain === "permissions"
            ? activePermission?.code ?? null
            : formDomain === "communities"
              ? activeCommunity?.code ?? null
              : isUserFormWorkspace
                ? activeUser?.email ?? null
                : null,
  });

  const loadedDomain: AccessTab = formDomain ?? listTab;
  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      if (loadedDomain === "users") {
        const [branchRecords, userRecords, roleRecords, communityRecords] = await Promise.all([
          canReadBranches ? apiJson<BranchRecord[]>("/branches") : Promise.resolve([]),
          canReadUsers ? apiJson<UserRecord[]>("/users") : Promise.resolve([]),
          formDomain === "users" && canReadRoles ? apiJson<RoleRecord[]>("/roles") : Promise.resolve(null),
          formDomain === "users" && canReadCommunities ? apiJson<CommunityRecord[]>("/communities") : Promise.resolve(null),
        ]);
        setBranches(branchRecords);
        setUsers(userRecords);
        if (roleRecords) setRoles(roleRecords);
        if (communityRecords) setCommunities(communityRecords);
      } else if (loadedDomain === "roles") {
        const [roleRecords, permissionRecords] = await Promise.all([
          canReadRoles ? apiJson<RoleRecord[]>("/roles") : Promise.resolve([]),
          formDomain === "roles" && canReadPermissions ? apiJson<PermissionRecord[]>("/permissions") : Promise.resolve(null),
        ]);
        setRoles(roleRecords);
        if (permissionRecords) setPermissions(permissionRecords);
      } else if (loadedDomain === "permissions") {
        setPermissions(canReadPermissions ? await apiJson<PermissionRecord[]>("/permissions") : []);
      } else {
        const [communityRecords, permissionRecords] = await Promise.all([
          canReadCommunities ? apiJson<CommunityRecord[]>("/communities") : Promise.resolve([]),
          formDomain === "communities" && canReadPermissions ? apiJson<PermissionRecord[]>("/permissions") : Promise.resolve(null),
        ]);
        setCommunities(communityRecords);
        if (permissionRecords) setPermissions(permissionRecords);
      }
      setMessage(null);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "Usuários e acessos não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canReadBranches, canReadCommunities, canReadPermissions, canReadRoles, canReadUsers, formDomain, loadedDomain]);

  const loadUserSummary = useCallback(
    async (userId: string) => {
      if (!canReadUsers) return;
      setSummaryLoading(true);
      try {
        const summary = await apiJson<AccessSummary>(`/users/${userId}/access-summary`);
        setUserSummary(summary);
      } catch (error) {
        setUserSummary(null);
        setMessage(error instanceof Error ? error.message : "O resumo de acesso não pôde ser carregado.");
      } finally {
        setSummaryLoading(false);
      }
    },
    [apiJson, canReadUsers],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadWorkspace]);

  useCadastroListRefresh("/admin/access", isListWorkspace, loadWorkspace);

  useEffect(() => {
    if (!isUserFormWorkspace || !activeUser || showCreateUser) return;
    const userId = activeUser.id;
    const timeoutId = window.setTimeout(() => {
      void loadUserSummary(userId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeUser, isUserFormWorkspace, loadUserSummary, showCreateUser]);

  const clearUserDuplicate = useCallback(() => {
    setUserDuplicateStatus("idle");
    setUserDuplicateMatch(null);
  }, []);

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/admin/access?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Usuário: Novo", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (user: Pick<UserRecord, "id" | "displayName" | "email">) => {
      const targetPath = `/admin/access?focusUserId=${encodeURIComponent(user.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Usuário: ${user.displayName}`, {
        cloneCurrent: false,
        subtitle: user.email || null,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const listHrefFor = useCallback((tab: AccessTab) => (tab === "users" ? "/admin/access" : `/admin/access?accessTab=${tab}`), []);

  const closeFormWorkspace = useCallback(() => {
    const listHref = listHrefFor(formDomain ?? listTab);
    const listLabel =
      formDomain === "roles" || listTab === "roles"
        ? "Papéis"
        : formDomain === "permissions" || listTab === "permissions"
          ? "Permissões"
          : formDomain === "communities" || listTab === "communities"
            ? "Comunidades"
            : "Usuários e Acessos";
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace(listHref);
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab(listHref, listLabel, { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, formDomain, isMobile, listHrefFor, listTab, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openAccessCreateWorkspace = useCallback(
    (tab: AccessTab, name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (tab !== "users") {
        params.set("accessTab", tab);
      }
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/admin/access?${params.toString()}`;
      const label = tab === "roles" ? "Papel: Novo" : tab === "permissions" ? "Permissão: Nova" : tab === "communities" ? "Comunidade: Nova" : "Usuário: Novo";
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, label, { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  function finishAccessSave(intent: CadastroSaveIntent, tab: AccessTab) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/admin/access",
      openCreate: () => openAccessCreateWorkspace(tab),
      navigateToList: () => navigateWithinWorkspace(listHrefFor(tab)),
    });
  }

  const openRoleEditWorkspace = useCallback(
    (role: Pick<RoleRecord, "id" | "displayName" | "code">) => {
      const targetPath = `/admin/access?accessTab=roles&focusRoleId=${encodeURIComponent(role.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Papel: ${role.displayName}`, { cloneCurrent: false, subtitle: role.code });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openPermissionEditWorkspace = useCallback(
    (permission: Pick<PermissionRecord, "id" | "displayName" | "code">) => {
      const targetPath = `/admin/access?accessTab=permissions&focusPermissionId=${encodeURIComponent(permission.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Permissão: ${permission.displayName}`, { cloneCurrent: false, subtitle: permission.code });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openCommunityEditWorkspace = useCallback(
    (community: Pick<CommunityRecord, "id" | "displayName" | "code">) => {
      const targetPath = `/admin/access?accessTab=communities&focusCommunityId=${encodeURIComponent(community.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Comunidade: ${community.displayName}`, { cloneCurrent: false, subtitle: community.code });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const handleInactivateUser = useCallback(
    async (user: AccessUserListRecord) => {
      if (user.status === "inactive" || user.isMaster) {
        return;
      }
      if (!window.confirm(`Inativar ${user.displayName}? O usuário deixa de entrar no sistema.`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const updated = await apiJson<UserRecord>(`/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setUsers((current) => current.map((record) => (record.id === updated.id ? updated : record)));
        setMessage(`${user.displayName} foi inativado.`);
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O usuário não pôde ser inativado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  const handleSendAccessLink = useCallback(
    async (user: UserRecord) => {
      setSaving(true);
      setMessage(null);
      try {
        const result = await apiJson<{ emailed: boolean; reason?: string | null; firstAccess?: { token: string } }>(
          `/users/${user.id}/access-link`,
          { method: "POST" },
        );
        if (result.emailed) {
          setMessage(`Link enviado para ${user.email}.`);
          return;
        }
        const link = result.firstAccess
          ? `${window.location.origin}/redefinir-senha?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(result.firstAccess.token)}`
          : "";
        setMessage(link ? `${result.reason ?? "A caixa de e-mail ainda não enviou."} ${link}` : result.reason ?? "O link não foi enviado.");
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O link não foi enviado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  const handleDeleteUser = useCallback(
    async (user: AccessUserListRecord, options: { skipConfirm?: boolean } = {}) => {
      if (user.id === currentUserId) {
        setMessage("Você não pode excluir o próprio usuário.");
        return false;
      }
      if (user.isMaster) {
        setMessage("O master não pode ser excluído.");
        return false;
      }
      if (
        !options.skipConfirm &&
        !window.confirm(`Excluir ${user.displayName}? O usuário some da lista e deixa de entrar no sistema.`)
      ) {
        return false;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson(`/users/${user.id}`, { method: "DELETE" });
        setUsers((current) => current.filter((record) => record.id !== user.id));
        setMessage(`${user.displayName} foi excluído da lista.`);
        return true;
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O usuário não pôde ser excluído."));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apiJson, currentUserId],
  );

  const handleDeleteUsers = useCallback(
    async (selected: AccessUserListRecord[]) => {
      if (selected.length === 0) {
        return;
      }
      if (!window.confirm(`Excluir ${selected.length} usuário(s) selecionado(s)? Eles somem da lista e deixam de entrar.`)) {
        return;
      }
      let deleted = 0;
      for (const user of selected) {
        const ok = await handleDeleteUser(user, { skipConfirm: true });
        if (ok) {
          deleted += 1;
        } else {
          break;
        }
      }
      if (deleted > 1) {
        setMessage(`${deleted} usuário(s) foram excluídos da lista.`);
      }
    },
    [handleDeleteUser],
  );

  const handleInactivateRole = useCallback(
    async (role: AccessRoleListRecord) => {
      if (role.status === "inactive" || role.isSystemManaged) {
        return;
      }
      if (!window.confirm(`Inativar ${role.displayName}? O papel deixa de ser atribuído a novos usuários.`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const updated = await apiJson<RoleRecord>(`/roles/${role.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setRoles((current) => current.map((record) => (record.id === updated.id ? updated : record)));
        setMessage(`${role.displayName} foi inativado.`);
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O papel não pôde ser inativado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const name = prefillName.trim();
      if (formDomain === "roles") {
        setShowCreateRole(true);
        setActiveRoleId(null);
        setRoleForm({ ...emptyRoleForm(), displayName: name });
        return;
      }
      if (formDomain === "permissions") {
        setShowCreatePermission(true);
        setActivePermissionId(null);
        setPermissionForm({ ...emptyPermissionForm(), displayName: name });
        return;
      }
      if (formDomain === "communities") {
        setShowCreateCommunity(true);
        setActiveCommunityId(null);
        setCommunityForm({ ...emptyCommunityForm(), displayName: name });
        return;
      }
      setShowCreateUser(true);
      setActiveUserId(null);
      setUserForm({ ...emptyUserForm(), displayName: name });
      clearUserDuplicate();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [clearUserDuplicate, formDomain, prefillName, setActiveCommunityId, setActivePermissionId, setActiveRoleId, setActiveUserId, workspaceMode]);

  useEffect(() => {
    if (!focusUserId || workspaceMode === "new") {
      return;
    }
    const user = users.find((item) => item.id === focusUserId);
    if (!user) {
      return;
    }
    setShowCreateUser(false);
    setActiveUserId(user.id);
    setUserForm(mapUserToForm(user));
    clearUserDuplicate();
  }, [clearUserDuplicate, focusUserId, setActiveUserId, users, workspaceMode]);

  useEffect(() => {
    if (!focusRoleId || workspaceMode === "new") {
      return;
    }
    const role = roles.find((item) => item.id === focusRoleId);
    if (!role) {
      return;
    }
    setShowCreateRole(false);
    setActiveRoleId(role.id);
    setRoleForm(mapRoleToForm(role));
  }, [focusRoleId, roles, setActiveRoleId, workspaceMode]);

  useEffect(() => {
    if (!focusPermissionId || workspaceMode === "new") {
      return;
    }
    const permission = permissions.find((item) => item.id === focusPermissionId);
    if (!permission) {
      return;
    }
    setShowCreatePermission(false);
    setActivePermissionId(permission.id);
    setPermissionForm(mapPermissionToForm(permission));
  }, [focusPermissionId, permissions, setActivePermissionId, workspaceMode]);

  useEffect(() => {
    if (!focusCommunityId || workspaceMode === "new") {
      return;
    }
    const community = communities.find((item) => item.id === focusCommunityId);
    if (!community) {
      return;
    }
    setShowCreateCommunity(false);
    setActiveCommunityId(community.id);
    setCommunityForm(mapCommunityToForm(community));
  }, [communities, focusCommunityId, setActiveCommunityId, workspaceMode]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    setShowCreateUser(false);
    setShowCreateRole(false);
    setShowCreatePermission(false);
    setShowCreateCommunity(false);
  }, [isListWorkspace]);

  const handleUserEmailBlur = useCallback(() => {
    const normalizedEmail = normalizeEmailValue(userForm.email);
    const currentUserId = showCreateUser ? null : activeUser?.id ?? null;
    if (!normalizedEmail) {
      clearUserDuplicate();
      return;
    }

    setUserDuplicateStatus("checking");
    const duplicate = users.find((user) => normalizeEmailValue(user.email) === normalizedEmail && user.id !== currentUserId) ?? null;
    setUserDuplicateMatch(duplicate);
    setUserDuplicateStatus(duplicate ? "duplicate" : "idle");
  }, [activeUser?.id, clearUserDuplicate, showCreateUser, userForm.email, users]);

  async function handleCreateUser(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWriteUsers) return;
    if (userDuplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada do usuário antes de salvar.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<UserRecord>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: userForm.email,
          displayName: userForm.displayName,
          password: userForm.password,
          defaultBranchId: userForm.defaultBranchId || undefined,
        }),
      });
      setUsers((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setMessage("Usuário criado com sucesso.");
      finishAccessSave(intent, "users");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O usuário não pôde ser criado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateUser(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWriteUsers || !activeUser) return;
    if (userDuplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada do usuário antes de salvar.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<UserRecord>(`/users/${activeUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: userForm.email,
          displayName: userForm.displayName,
          defaultBranchId: userForm.defaultBranchId || null,
          status: userForm.status,
        }),
      });
      setUsers((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      setMessage("Usuário atualizado com sucesso.");
      finishAccessSave(intent, "users");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O usuário não pôde ser atualizado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRole(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWriteRoles) return;
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<RoleRecord>("/roles", {
        method: "POST",
        body: JSON.stringify(roleForm),
      });
      setRoles((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setMessage("Papel criado com sucesso.");
      finishAccessSave(intent, "roles");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O papel não pôde ser criado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRole(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWriteRoles || !activeRole) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<RoleRecord>(`/roles/${activeRole.id}`, {
        method: "PATCH",
        body: JSON.stringify(roleForm),
      });
      setRoles((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      setMessage("Papel atualizado com sucesso.");
      finishAccessSave(intent, "roles");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O papel não pôde ser atualizado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePermission(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWritePermissions) return;
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<PermissionRecord>("/permissions", {
        method: "POST",
        body: JSON.stringify(permissionForm),
      });
      setPermissions((current) => [...current, created].sort((left, right) => left.code.localeCompare(right.code)));
      setMessage("Permissão criada com sucesso.");
      finishAccessSave(intent, "permissions");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A permissão não pôde ser criada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePermission(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWritePermissions || !activePermission) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<PermissionRecord>(`/permissions/${activePermission.id}`, {
        method: "PATCH",
        body: JSON.stringify(permissionForm),
      });
      setPermissions((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      setMessage("Permissão atualizada com sucesso.");
      finishAccessSave(intent, "permissions");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A permissão não pôde ser atualizada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteCommunities) return;
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<CommunityRecord>("/communities", {
        method: "POST",
        body: JSON.stringify(communityForm),
      });
      setCommunities((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setActiveCommunityId(created.id);
      setShowCreateCommunity(false);
      setCommunityForm(mapCommunityToForm(created));
      navigateWithinWorkspace(`/admin/access?accessTab=communities&focusCommunityId=${encodeURIComponent(created.id)}`);
      setMessage("Comunidade criada com sucesso.");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A comunidade não pôde ser criada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteCommunities || !activeCommunity) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<CommunityRecord>(`/communities/${activeCommunity.id}`, {
        method: "PATCH",
        body: JSON.stringify(communityForm),
      });
      setCommunities((current) => current.map((record) => (record.id === updated.id ? updated : record)));
      setCommunityForm(mapCommunityToForm(updated));
      setMessage("Comunidade atualizada com sucesso.");
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A comunidade não pôde ser atualizada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteUsers || !activeUser || !assignRoleId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/users/${activeUser.id}/roles`, {
        method: "POST",
        body: JSON.stringify({
          roleId: assignRoleId,
          assignedBranchId: assignRoleBranchId || undefined,
          grantsAllBranches: assignRoleAllBranches,
        }),
      });
      setAssignRoleId("");
      setAssignRoleBranchId("");
      setAssignRoleAllBranches(false);
      setMessage("Papel vinculado ao usuário.");
      await loadUserSummary(activeUser.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O papel não pôde ser vinculado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignBranchScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteUsers || !activeUser || !assignBranchScopeId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/users/${activeUser.id}/branch-scopes`, {
        method: "POST",
        body: JSON.stringify({ branchId: assignBranchScopeId, scopeType: assignBranchScopeType }),
      });
      setAssignBranchScopeId("");
      setAssignBranchScopeType("member");
      setMessage("Escopo de filial vinculado ao usuário.");
      await loadUserSummary(activeUser.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O escopo de filial não pôde ser vinculado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteCommunities || !activeUser || !assignCommunityId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/communities/${assignCommunityId}/users`, {
        method: "POST",
        body: JSON.stringify({ userId: activeUser.id }),
      });
      setAssignCommunityId("");
      setMessage("Comunidade vinculada ao usuário.");
      await loadUserSummary(activeUser.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A comunidade não pôde ser vinculada ao usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignPermissionToRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteRoles || !activeRole || !assignPermissionToRoleId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/roles/${activeRole.id}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permissionId: assignPermissionToRoleId }),
      });
      setAssignPermissionToRoleId("");
      setMessage("Permissão vinculada ao papel.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A permissão não pôde ser vinculada ao papel.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignPermissionToCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteCommunities || !activeCommunity || !assignPermissionToCommunityId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/communities/${activeCommunity.id}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permissionId: assignPermissionToCommunityId }),
      });
      setAssignPermissionToCommunityId("");
      setMessage("Permissão vinculada à comunidade.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A permissão não pôde ser vinculada à comunidade.");
    } finally {
      setSaving(false);
    }
  }

  const anyReadAccess = canReadUsers || canReadRoles || canReadPermissions || canReadCommunities;
  if (!anyReadAccess) {
    return (
      <section className="mini-card">
        <h3>Usuários e acessos indisponíveis</h3>
        <p>Você não possui acesso a este workspace no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {isFormWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Administração</div>
          <h1 className="title">
            {workspaceMode === "new"
              ? formDomain === "roles"
                ? "Novo papel"
                : formDomain === "permissions"
                  ? "Nova permissão"
                  : formDomain === "communities"
                    ? "Nova comunidade"
                    : "Novo usuário"
              : formDomain === "roles"
                ? activeRole?.displayName ?? "Papel"
                : formDomain === "permissions"
                  ? activePermission?.displayName ?? "Permissão"
                  : formDomain === "communities"
                    ? activeCommunity?.displayName ?? "Comunidade"
                    : activeUser?.displayName ?? "Usuário"}
          </h1>
          <p>
            {workspaceMode === "new"
              ? "Cadastre em uma aba interna. A lista permanece aberta."
              : "Altere o cadastro sem perder a lista."}
          </p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <section className="mini-card">
          <div className="workspace-toolbar">
            <div className="workspace-toolbar__copy">
              <h3>Navegação operacional</h3>
              <p>Escolha o domínio de administração e trabalhe no mesmo contexto.</p>
            </div>
            <div className="button-row">
              {(["users", "roles", "permissions", "communities"] as AccessTab[]).map((tab) => (
                <button
                  key={tab}
                  className={listTab === tab ? "button" : "button-secondary"}
                  onClick={() => {
                    setActiveTab(tab);
                    navigateWithinWorkspace(listHrefFor(tab));
                  }}
                  type="button"
                >
                  {accessTabLabel(tab)}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {isUserFormWorkspace ? (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <div className="workspace-toolbar__copy">
              <h3>{showCreateUser || workspaceMode === "new" ? "Novo usuário" : activeUser?.displayName ?? "Alterar usuário"}</h3>
              <p>
                {showCreateUser || workspaceMode === "new"
                  ? "Gravar fecha esta aba. Gravar e Continuar abre outro usuário."
                  : "Visualize e ajuste o usuário selecionado."}
              </p>
            </div>

            {showCreateUser || workspaceMode === "new" ? (
              <form className="form-grid" onSubmit={(event) => void handleCreateUser(event)}>
                <UserFormFields
                  duplicateGuard={
                    <MasterDataDuplicateGuard
                      entityLabel="usuário"
                      match={
                        userDuplicateMatch
                          ? {
                              id: userDuplicateMatch.id,
                              title: userDuplicateMatch.displayName,
                              subtitle: userDuplicateMatch.email,
                            }
                          : null
                      }
                      onCancel={() => {
                        setUserForm((current) => ({ ...current, email: "" }));
                        clearUserDuplicate();
                      }}
                      onEdit={userDuplicateMatch ? () => openEditWorkspace(userDuplicateMatch) : undefined}
                      onView={userDuplicateMatch ? () => openEditWorkspace(userDuplicateMatch) : undefined}
                      status={userDuplicateStatus}
                    />
                  }
                  branches={branches}
                  canQuickCreateBranch={hasAnyPermission("branches.write")}
                  form={userForm}
                  onEmailBlur={handleUserEmailBlur}
                  onEmailChange={clearUserDuplicate}
                  requirePassword
                  saving={saving}
                  setBranches={setBranches}
                  setForm={setUserForm}
                  setMessage={setMessage}
                />
                <div className="button-row">
                  <button className="button" disabled={saving || userDuplicateStatus !== "idle"} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving || userDuplicateStatus !== "idle"}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreateUser);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : activeUser ? (
              <div className="detail-stack">
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>Status</span>
                    <strong>{activeUser.status}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Email</span>
                    <strong>{activeUser.email}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Permissões efetivas</span>
                    <strong>{summaryLoading ? "Carregando…" : userSummary?.effectiveAccess.permissions.length ?? 0}</strong>
                  </div>
                </div>

                {activeUser.isMaster ? (
                  <p className="table-subtle">Este usuário é o master. Nome, e-mail, filial, papel e exclusão ficam travados. A senha muda pelo Esqueci a senha na tela de login.</p>
                ) : null}
                <form className="form-grid" onSubmit={handleUpdateUser}>
                  <UserFormFields
                    locked={Boolean(activeUser.isMaster)}
                    duplicateGuard={
                      <MasterDataDuplicateGuard
                        entityLabel="usuário"
                        match={
                          userDuplicateMatch
                            ? {
                                id: userDuplicateMatch.id,
                                title: userDuplicateMatch.displayName,
                                subtitle: userDuplicateMatch.email,
                              }
                            : null
                        }
                        onCancel={() => {
                          setUserForm((current) => ({ ...current, email: activeUser.email }));
                          clearUserDuplicate();
                        }}
                        onEdit={userDuplicateMatch ? () => openEditWorkspace(userDuplicateMatch) : undefined}
                        onView={userDuplicateMatch ? () => openEditWorkspace(userDuplicateMatch) : undefined}
                        status={userDuplicateStatus}
                      />
                    }
                    branches={branches}
                    canQuickCreateBranch={hasAnyPermission("branches.write")}
                    form={userForm}
                    onEmailBlur={handleUserEmailBlur}
                    onEmailChange={clearUserDuplicate}
                    saving={saving}
                    setBranches={setBranches}
                    setForm={setUserForm}
                    setMessage={setMessage}
                  />
                  <div className="button-row">
                    {activeUser.isMaster ? null : (
                      <>
                        <button className="button" disabled={saving || !canWriteUsers || userDuplicateStatus !== "idle"} type="submit">
                          {saving ? "Gravando…" : "Gravar"}
                        </button>
                        <button
                          className="button-secondary"
                          disabled={saving || !canWriteUsers || userDuplicateStatus !== "idle"}
                          onClick={(event) => {
                            requestCadastroContinue(event, handleUpdateUser);
                          }}
                          type="button"
                        >
                          {saving ? "Gravando…" : "Gravar e Continuar"}
                        </button>
                      </>
                    )}
                    <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                      Cancelar
                    </button>
                  </div>
                </form>

                <div className="mini-section">
                  <h4>Link de senha</h4>
                  <p className="table-subtle">Com a caixa de e-mail configurada, o link vai para o e-mail deste usuário. Sem a caixa, o link aparece aqui.</p>
                  <button className="button-secondary" disabled={saving || !canWriteUsers} onClick={() => void handleSendAccessLink(activeUser)} type="button">
                    {saving ? "Enviando…" : "Enviar link de senha"}
                  </button>
                </div>

                {activeUser.isMaster ? null : (
                <>
                <div className="mini-section">
                  <h4>Vincular papel</h4>
                  <form className="inline-form" onSubmit={handleAssignRole}>
                    <select value={assignRoleId} onChange={(event) => setAssignRoleId(event.target.value)}>
                      <option value="">Selecione o papel</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.displayName}
                        </option>
                      ))}
                    </select>
                    <select value={assignRoleBranchId} onChange={(event) => setAssignRoleBranchId(event.target.value)}>
                      <option value="">Sem filial (usuário não vê nenhuma até marcar)</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.displayName}
                        </option>
                      ))}
                    </select>
                    <label className="field">
                      <span>
                        <input
                          checked={assignRoleAllBranches}
                          onChange={(event) => setAssignRoleAllBranches(event.target.checked)}
                          type="checkbox"
                        />{" "}
                        Todas as Filiais
                      </span>
                    </label>
                    <button className="button-secondary" disabled={saving || !canWriteUsers} type="submit">
                      Vincular
                    </button>
                  </form>
                </div>

                <div className="mini-section">
                  <h4>Vincular escopo de filial</h4>
                  <form className="inline-form" onSubmit={handleAssignBranchScope}>
                    <select value={assignBranchScopeId} onChange={(event) => setAssignBranchScopeId(event.target.value)}>
                      <option value="">Selecione a filial</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.displayName}
                        </option>
                      ))}
                    </select>
                    <select value={assignBranchScopeType} onChange={(event) => setAssignBranchScopeType(event.target.value as "member" | "manager" | "admin")}>
                      <option value="member">Membro</option>
                      <option value="manager">Gerente</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button className="button-secondary" disabled={saving || !canWriteUsers} type="submit">
                      Vincular
                    </button>
                  </form>
                </div>

                <div className="mini-section">
                  <h4>Vincular comunidade</h4>
                  <form className="inline-form" onSubmit={handleAssignCommunity}>
                    <select value={assignCommunityId} onChange={(event) => setAssignCommunityId(event.target.value)}>
                      <option value="">Selecione a comunidade</option>
                      {communities.map((community) => (
                        <option key={community.id} value={community.id}>
                          {community.displayName}
                        </option>
                      ))}
                    </select>
                    <button className="button-secondary" disabled={saving || !canWriteCommunities} type="submit">
                      Vincular
                    </button>
                  </form>
                </div>
                </>
                )}

                <div className="mini-section">
                  <h4>Resumo de acesso</h4>
                  {summaryLoading ? (
                    <div className="empty-state">Carregando resumo…</div>
                  ) : userSummary ? (
                    <div className="workspace-stack">
                      <TokenBlock title="Papéis" values={userSummary.roles.map((item) => `${item.displayName}${item.assignedBranchLabel ? ` · ${item.assignedBranchLabel}` : ""}`)} />
                      <TokenBlock title="Comunidades" values={userSummary.communities.map((item) => item.displayName)} />
                      <TokenBlock title="Escopos de filial" values={userSummary.branchScopes.map((item) => `${item.branchLabel} · ${item.scopeType}`)} />
                      <TokenBlock title="Permissões efetivas" values={userSummary.effectiveAccess.permissions} />
                    </div>
                  ) : (
                    <div className="empty-state">Nenhum resumo disponível.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">O usuário desta aba não foi encontrado.</div>
            )}
          </article>
        </section>
      ) : isListWorkspace && listTab === "users" ? (
        <CadastroListPanel
          applyFilters={applyAccessUserListFilters}
          buildEmailCsv={buildAccessUserEmailCsv}
          buildExcelCsv={buildAccessUserExcelCsv}
          canInactivate={(row) => row.status !== "inactive" && !row.isMaster}
          canWrite={canWriteUsers}
          columnStorageKey="anexsys.frontend.access-users.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Nome",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  <div className="table-subtle">{row.email}</div>
                </>
              ),
            },
            { id: "email", label: "E-mail", render: (row) => row.email },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {userStatusLabel(row.status)}
                </span>
              ),
            },
            { id: "branch", label: "Filial padrão", render: (row) => row.defaultBranchLabel ?? "—" },
          ]}
          defaultColumnIds={["name", "status", "branch"]}
          emailFileName="usuarios-emails.csv"
          emptyFilters={{ name: "", email: "", status: "" }}
          emptyMessage="Nenhum usuário encontrado para os filtros informados."
          excelFileName="usuarios.csv"
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "email", label: "E-mail", placeholder: "E-mail já cadastrado" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativo" },
                { value: "invited", label: "Convidado" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={openCreateWorkspace}
          onDelete={(row) => {
            void handleDeleteUser(row);
          }}
          onDeleteMany={(rows) => {
            void handleDeleteUsers(rows);
          }}
          onEdit={openEditWorkspace}
          onInactivate={(row) => {
            void handleInactivateUser(row);
          }}
          records={userListRecords}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={userLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Usuários"
        />
      ) : null}

      {isRoleFormWorkspace ? (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <div className="workspace-toolbar__copy">
              <h3>{showCreateRole || workspaceMode === "new" ? "Novo papel" : activeRole?.displayName ?? "Alterar papel"}</h3>
              <p>
                {showCreateRole || workspaceMode === "new"
                  ? "Gravar fecha esta aba. Gravar e Continuar abre outro papel."
                  : "Visualize e ajuste o papel selecionado."}
              </p>
            </div>
            {showCreateRole || workspaceMode === "new" ? (
              <form className="form-grid" onSubmit={handleCreateRole}>
                <RoleFormFields form={roleForm} setForm={setRoleForm} />
                <div className="button-row">
                  <button className="button" disabled={saving} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreateRole);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : activeRole ? (
              <div className="detail-stack">
                {activeRole.code === "MASTER_ADMINISTRATOR" ? (
                  <p className="table-subtle">O papel master não pode ser alterado.</p>
                ) : null}
                <form className="form-grid" onSubmit={handleUpdateRole}>
                  <RoleFormFields form={roleForm} setForm={setRoleForm} />
                  <div className="button-row">
                    <button className="button" disabled={saving || !canWriteRoles || activeRole.code === "MASTER_ADMINISTRATOR"} type="submit">
                      {saving ? "Gravando…" : "Gravar"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWriteRoles || activeRole.code === "MASTER_ADMINISTRATOR"}
                      onClick={(event) => {
                        requestCadastroContinue(event, handleUpdateRole);
                      }}
                      type="button"
                    >
                      {saving ? "Gravando…" : "Gravar e Continuar"}
                    </button>
                    <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                      Cancelar
                    </button>
                  </div>
                </form>
                <div className="mini-section">
                  <h4>Vincular permissão</h4>
                  <form className="inline-form" onSubmit={handleAssignPermissionToRole}>
                    <select value={assignPermissionToRoleId} onChange={(event) => setAssignPermissionToRoleId(event.target.value)}>
                      <option value="">Selecione a permissão</option>
                      {permissions.map((permission) => (
                        <option key={permission.id} value={permission.id}>
                          {permission.code}
                        </option>
                      ))}
                    </select>
                    <button className="button-secondary" disabled={saving || !canWriteRoles || activeRole.code === "MASTER_ADMINISTRATOR"} type="submit">
                      Vincular
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="empty-state">O papel desta aba não foi encontrado.</div>
            )}
          </article>
        </section>
      ) : isPermissionFormWorkspace ? (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <div className="workspace-toolbar__copy">
              <h3>{showCreatePermission || workspaceMode === "new" ? "Nova permissão" : activePermission?.displayName ?? "Alterar permissão"}</h3>
              <p>
                {showCreatePermission || workspaceMode === "new"
                  ? "Gravar fecha esta aba. Gravar e Continuar abre outra permissão."
                  : "Visualize e ajuste a permissão selecionada."}
              </p>
            </div>
            {showCreatePermission || workspaceMode === "new" ? (
              <form className="form-grid" onSubmit={handleCreatePermission}>
                <PermissionFormFields form={permissionForm} setForm={setPermissionForm} />
                <div className="button-row">
                  <button className="button" disabled={saving} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreatePermission);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : activePermission ? (
              <form className="form-grid" onSubmit={handleUpdatePermission}>
                <PermissionFormFields form={permissionForm} setForm={setPermissionForm} />
                <div className="button-row">
                  <button className="button" disabled={saving || !canWritePermissions} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving || !canWritePermissions}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleUpdatePermission);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="empty-state">A permissão desta aba não foi encontrada.</div>
            )}
          </article>
        </section>
      ) : isCommunityFormWorkspace ? (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <div className="workspace-toolbar__copy">
              <h3>{showCreateCommunity || workspaceMode === "new" ? "Nova comunidade" : activeCommunity?.displayName ?? "Alterar comunidade"}</h3>
              <p>Comunidades estão congeladas: não concedem permissão. A permissão vem só do papel e do escopo.</p>
            </div>
            {showCreateCommunity || workspaceMode === "new" ? (
              <form className="form-grid" onSubmit={handleCreateCommunity}>
                <CommunityFormFields form={communityForm} setForm={setCommunityForm} />
                <div className="button-row">
                  <button className="button" disabled={saving || !canWriteCommunities} type="submit">
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : activeCommunity ? (
              <form className="form-grid" onSubmit={handleUpdateCommunity}>
                <CommunityFormFields form={communityForm} setForm={setCommunityForm} />
                <div className="button-row">
                  <button className="button" disabled={saving || !canWriteCommunities} type="submit">
                    {saving ? "Salvando…" : "Salvar alterações"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="empty-state">A comunidade desta aba não foi encontrada.</div>
            )}
          </article>
        </section>
      ) : isListWorkspace && listTab === "roles" ? (
        <CadastroListPanel
          applyFilters={applyAccessRoleListFilters}
          buildExcelCsv={buildAccessRoleExcelCsv}
          canInactivate={(row) => row.status !== "inactive" && !row.isSystemManaged}
          canWrite={canWriteRoles}
          columnStorageKey="anexsys.frontend.access-roles.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Nome",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  <div className="table-subtle">{row.code}</div>
                </>
              ),
            },
            { id: "code", label: "Código", render: (row) => row.code },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {accessStatusLabel(row.status)}
                </span>
              ),
            },
            { id: "system", label: "Sistema", render: (row) => (row.isSystemManaged ? "Sim" : "Não") },
          ]}
          defaultColumnIds={["name", "code", "status", "system"]}
          emptyFilters={{ name: "", code: "", status: "" }}
          emptyMessage="Nenhum papel encontrado para os filtros informados."
          excelFileName="papeis.csv"
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "code", label: "Código" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativo" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={(name) => openAccessCreateWorkspace("roles", name)}
          onEdit={openRoleEditWorkspace}
          onInactivate={(row) => {
            void handleInactivateRole(row);
          }}
          records={roles}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={roleLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Papéis"
        />
      ) : isListWorkspace && listTab === "permissions" ? (
        <CadastroListPanel
          applyFilters={applyAccessPermissionListFilters}
          buildExcelCsv={buildAccessPermissionExcelCsv}
          canWrite={canWritePermissions}
          columnStorageKey="anexsys.frontend.access-permissions.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Nome",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  <div className="table-subtle">{row.code}</div>
                </>
              ),
            },
            { id: "code", label: "Código", render: (row) => row.code },
            { id: "description", label: "Descrição", render: (row) => row.description || "—" },
          ]}
          defaultColumnIds={["name", "code"]}
          emptyFilters={{ name: "", code: "" }}
          emptyMessage="Nenhuma permissão encontrada para os filtros informados."
          excelFileName="permissoes.csv"
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "code", label: "Código" },
          ]}
          loading={loading}
          onCreate={(name) => openAccessCreateWorkspace("permissions", name)}
          onEdit={openPermissionEditWorkspace}
          records={permissions}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={permissionLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Permissões"
        />
      ) : isListWorkspace && listTab === "communities" ? (
        <CadastroListPanel
          applyFilters={applyAccessCommunityListFilters}
          buildExcelCsv={buildAccessCommunityExcelCsv}
          canWrite={canWriteCommunities}
          columnStorageKey="anexsys.frontend.access-communities.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Nome",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  <div className="table-subtle">{row.code}</div>
                </>
              ),
            },
            { id: "code", label: "Código", render: (row) => row.code },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {accessStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["name", "code", "status"]}
          emptyFilters={{ name: "", code: "", status: "" }}
          emptyMessage="Nenhuma comunidade encontrada para os filtros informados."
          excelFileName="comunidades.csv"
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "code", label: "Código" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativo" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={(name) => openAccessCreateWorkspace("communities", name)}
          onEdit={openCommunityEditWorkspace}
          records={communities}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={communityLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Comunidades"
        />
      ) : null}
    </>
  );
}

function TokenBlock({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mini-section">
      <h4>{title}</h4>
      {values.length > 0 ? (
        <div className="token-list">
          {values.map((value) => (
            <span className="token-pill" key={value}>
              {value}
            </span>
          ))}
        </div>
      ) : (
        <div className="empty-state">Nenhum vínculo encontrado.</div>
      )}
    </div>
  );
}

function UserFormFields({
  branches,
  canQuickCreateBranch,
  duplicateGuard,
  form,
  onEmailBlur,
  onEmailChange,
  setForm,
  setBranches,
  setMessage,
  saving,
  requirePassword = false,
  locked = false,
}: {
  branches: BranchRecord[];
  canQuickCreateBranch: boolean;
  duplicateGuard?: ReactNode;
  form: UserForm;
  onEmailBlur?: () => void;
  onEmailChange?: () => void;
  setForm: Dispatch<SetStateAction<UserForm>>;
  setBranches: Dispatch<SetStateAction<BranchRecord[]>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  saving: boolean;
  requirePassword?: boolean;
  locked?: boolean;
}) {
  const { apiJson } = useSession();
  const branchLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      branches.map((branch) => ({
        id: branch.id,
        label: branch.displayName,
        hint: `${branch.code} · ${branch.status}`,
      })),
    [branches],
  );

  return (
    <>
      <label className="field">
        <span>E-mail</span>
        <input
          disabled={locked}
          required
          value={form.email}
          onBlur={onEmailBlur}
          onChange={(event) => {
            onEmailChange?.();
            setForm((current) => ({ ...current, email: event.target.value }));
          }}
        />
      </label>
      {duplicateGuard}
      <label className="field">
        <span>Nome exibido</span>
        <input disabled={locked} required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      {requirePassword ? (
        <label className="field">
          <span>Senha inicial</span>
          <input
            minLength={8}
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
      ) : null}
      <label className="field">
        <span>Status</span>
        <select disabled={locked} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as UserForm["status"] }))}>
          <option value="active">Ativo</option>
          <option value="invited">Convidado</option>
          <option value="inactive">Inativo</option>
        </select>
      </label>
      <div className="field">
        <SmartLookup
          allowClear
          canCreate={canQuickCreateBranch}
          createLabel="Cadastrar"
          disabled={saving || locked}
          entityType="branches"
          label="Filial padrão"
          options={branchLookupOptions}
          value={form.defaultBranchId}
          onChange={(option) => setForm((current) => ({ ...current, defaultBranchId: option?.id ?? "" }))}
          renderQuickCreate={({ cancelCreate, completeCreate, initialValue }) => (
            <QuickCreateBranch
              apiJson={apiJson}
              initialValue={initialValue}
              onCancel={cancelCreate}
              onComplete={(created) => {
                setBranches((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName)));
                setMessage("Filial criada e selecionada automaticamente.");
                completeCreate({
                  id: created.id,
                  label: created.displayName,
                  hint: `${created.code} · ${created.status}`,
                });
              }}
              setMessage={setMessage}
            />
          )}
        />
      </div>
    </>
  );
}

function QuickCreateBranch({
  apiJson,
  initialValue,
  onCancel,
  onComplete,
  setMessage,
}: {
  apiJson: ReturnType<typeof useSession>["apiJson"];
  initialValue: string;
  onCancel: () => void;
  onComplete: (branch: BranchRecord) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [code, setCode] = useState(initialValue.slice(0, 12).toUpperCase());
  const [displayName, setDisplayName] = useState(initialValue);
  const [legalName, setLegalName] = useState(initialValue);
  const [pending, setPending] = useState(false);

  return (
    <div className="form-grid">
      <h4>Cadastro rápido</h4>
      <label className="field">
        <span>Código</span>
        <input required value={code} onChange={(event) => setCode(event.target.value)} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label className="field">
        <span>Razão social</span>
        <input required value={legalName} onChange={(event) => setLegalName(event.target.value)} />
      </label>
      <div className="button-row">
        <button
          className="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const created = await apiJson<BranchRecord>("/branches", {
                method: "POST",
                body: JSON.stringify({ code, displayName, legalName }),
              });
              onComplete(created);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "A filial não pôde ser criada.");
            } finally {
              setPending(false);
            }
          }}
          type="button"
        >
          {pending ? "Salvando…" : "Salvar e selecionar"}
        </button>
        <button className="button-secondary" onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function RoleFormFields({ form, setForm }: { form: RoleForm; setForm: Dispatch<SetStateAction<RoleForm>> }) {
  return (
    <>
      <label className="field">
        <span>Código</span>
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Descrição</span>
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RoleForm["status"] }))}>
          <option value="active">Ativa</option>
          <option value="inactive">Inativa</option>
        </select>
      </label>
      <label className="field field--checkbox">
        <span>Gerenciado pelo sistema</span>
        <input checked={form.isSystemManaged} onChange={(event) => setForm((current) => ({ ...current, isSystemManaged: event.target.checked }))} type="checkbox" />
      </label>
    </>
  );
}

function PermissionFormFields({
  form,
  setForm,
}: {
  form: PermissionForm;
  setForm: Dispatch<SetStateAction<PermissionForm>>;
}) {
  return (
    <>
      <label className="field">
        <span>Código</span>
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Descrição</span>
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      </label>
    </>
  );
}

function CommunityFormFields({
  form,
  setForm,
}: {
  form: CommunityForm;
  setForm: Dispatch<SetStateAction<CommunityForm>>;
}) {
  return (
    <>
      <label className="field">
        <span>Código</span>
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Descrição</span>
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      </label>
      <label className="field">
        <span>Status</span>
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CommunityForm["status"] }))}>
          <option value="active">Ativa</option>
          <option value="inactive">Inativa</option>
        </select>
      </label>
    </>
  );
}
