"use client";

import { useSyncExternalStore } from "react";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useWorkspaceManager } from "@/components/app-shell/workspace-manager";
import {
  getWorkspaceBasePath,
  listWorkspaceTabsForNavItem,
  shouldShowWorkspaceNavSubmenu,
} from "@/components/app-shell/workspace-manager-store";
import {
  createEmptySidebarTree,
  readSidebarTree,
  subscribeSidebarTree,
  toggleTreeId,
  writeSidebarTree,
} from "@/components/app-shell/sidebar-tree";
import { INTEGRATION_ORDER_HREF } from "@/components/integration/migration-layouts";
import { useSession } from "@/components/providers/session-provider";

type NavItem = {
  href: string;
  label: string;
  hint: string;
  requiredPermissions?: string[];
  permissionMatch?: "all" | "any";
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Geral",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        hint: "Visão inicial",
      },
    ],
  },
  {
    title: "Cadastros",
    items: [
      {
        href: "/customers",
        label: "Clientes",
        hint: "Cadastro e medidas",
        requiredPermissions: ["customers.read"],
      },
      {
        href: "/body-parts",
        label: "Partes do Corpo",
        hint: "Master data de medidas",
        requiredPermissions: ["measurements.read"],
      },
      {
        href: "/measurement-units",
        label: "Unidades de Medida",
        hint: "Unidades padrão",
        requiredPermissions: ["measurements.read"],
      },
      {
        href: "/products",
        label: "Produtos",
        hint: "Calça, saia, vestido, terno",
        requiredPermissions: ["service_orders.read"],
      },
      {
        href: "/services",
        label: "Serviços",
        hint: "Bainha, ajuste, barra",
        requiredPermissions: ["service_orders.read"],
      },
      {
        href: "/prices",
        label: "Preços",
        hint: "Produto + serviço, preço e tempo",
        requiredPermissions: ["service_orders.read"],
      },
      {
        href: "/minute-rates",
        label: "Valor por Minuto",
        hint: "R$/min da empresa p/ precificar por tempo",
        requiredPermissions: ["service_orders.read"],
      },
    ],
  },
  {
    title: "Administração",
    items: [
      {
        href: "/admin/tenants",
        label: "Contas",
        hint: "Quem assina o ANEXSYS",
        requiredPermissions: ["tenants.read"],
      },
      {
        href: "/admin/companies",
        label: "Empresas",
        hint: "CNPJ da Conta; troque no contexto",
        requiredPermissions: ["companies.read"],
      },
      {
        href: "/admin/branches",
        label: "Filiais",
        hint: "Ligadas à Empresa ativa",
        requiredPermissions: ["branches.read"],
      },
      {
        href: "/admin/access",
        label: "Usuários e Acessos",
        hint: "Perfis e permissões",
        requiredPermissions: ["users.read", "roles.read", "permissions.read"],
        permissionMatch: "all",
      },
      {
        href: "/admin/work-groups",
        label: "Grupos de trabalho",
        hint: "Quem trabalha junto. Não muda a permissão",
        requiredPermissions: ["users.read"],
      },
    ],
  },
  {
    title: "Configurações",
    items: [
      {
        href: "/settings/payments",
        label: "Pagamentos",
        hint: "Operadoras e credenciais por empresa",
        requiredPermissions: ["finance.read"],
      },
      {
        href: "/settings/whatsapp",
        label: "WhatsApp",
        hint: "Número, modelos e horário de envio",
        requiredPermissions: ["whatsapp.write"],
      },
      {
        href: "/settings/email",
        label: "E-mail",
        hint: "Caixa de saída da Conta",
        requiredPermissions: ["email.write"],
      },
    ],
  },
  {
    title: "Operações",
    items: [
      {
        href: "/service-orders",
        label: "Ordens de serviço",
        hint: "Gestão operacional de ordens",
        requiredPermissions: ["service_orders.read"],
      },
      {
        href: "/whatsapp-notices",
        label: "Avisos",
        hint: "Fila e falhas das mensagens ao cliente",
        requiredPermissions: ["whatsapp.read"],
      },
      {
        href: "/pick-bag",
        label: "Pegar sacola",
        hint: "Esteira manual: pegar, terminar e refação",
        requiredPermissions: ["production_orders.read", "service_orders.read"],
        permissionMatch: "any",
      },
      {
        href: "/quality",
        label: "Controle de qualidade",
        hint: "Revisa peça a peça e gera OP de refação",
        requiredPermissions: ["quality.read"],
      },
      {
        href: "/floor-collaborators",
        label: "Colaboradores",
        hint: "Perfil, diária e média de peças",
        requiredPermissions: ["floor_schedule.write"],
      },
      {
        href: "/floor-schedule",
        label: "Grade de planejamento",
        hint: "Período com os colaboradores de cada dia",
        requiredPermissions: ["floor_schedule.write"],
      },
      {
        href: "/floor-today",
        label: "Escala de hoje",
        hint: "Confirmados, identificados e ativos",
        requiredPermissions: ["service_orders.read"],
      },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { href: "/fiscal/settings", label: "Configuração Fiscal", hint: "Empresa, filial e parâmetros da NFS-e", requiredPermissions: ["fiscal.admin"] },
      { href: "/fiscal/certificates", label: "Certificados Digitais", hint: "Certificado A1 da filial", requiredPermissions: ["fiscal.admin"] },
      { href: "/fiscal/environments", label: "Ambientes", hint: "Homologação e produção", requiredPermissions: ["fiscal.admin"] },
      { href: "/fiscal/batch", label: "Emissão em Lote", hint: "Uma nota por OS ou consolidada por cliente", requiredPermissions: ["fiscal.write"] },
      { href: "/fiscal/history", label: "Histórico Fiscal", hint: "Notas, XML e PDF", requiredPermissions: ["fiscal.read"] },
      { href: "/fiscal/cancellations", label: "Cancelamento Fiscal", hint: "Cancela a nota já emitida", requiredPermissions: ["fiscal.write"] },
      { href: "/fiscal/pending", label: "Pendências Fiscais", hint: "Erros para corrigir e reprocessar", requiredPermissions: ["fiscal.read"] },
      { href: "/fiscal/audit", label: "Auditoria Fiscal", hint: "Quem emitiu, cancelou e alterou", requiredPermissions: ["fiscal.audit"] },
    ],
  },
  {
    title: "Integração",
    items: [
      {
        href: INTEGRATION_ORDER_HREF,
        label: "Importar Registros",
        hint: "Escolhe o layout, baixa a planilha e importa",
        requiredPermissions: ["users.write"],
      },
    ],
  },
];

function TreeChevron({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <span aria-hidden="true" className={`nav-tree-chevron${expanded ? " nav-tree-chevron--expanded" : ""}`}>
      ▸
    </span>
  );
}

export function RoleAwareNav({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  const { hasAnyPermission } = useSession();
  const { currentTab, tabs, activateWorkspace, closeWorkspace, isHome, openWorkspaceFromMenu } = useWorkspaceManager();
  const { isMobile } = useWorkspaceViewportMode();
  const tree = useSyncExternalStore(subscribeSidebarTree, readSidebarTree, createEmptySidebarTree);
  const hasAllPermissions = (permissions: string[]) => permissions.every((permission) => hasAnyPermission(permission));

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.requiredPermissions
          ? item.permissionMatch === "all"
            ? hasAllPermissions(item.requiredPermissions)
            : hasAnyPermission(...item.requiredPermissions)
          : true,
      ),
    }))
    .filter((section) => section.items.length > 0);

  const toggleSection = (title: string, lockedOpen: boolean) => {
    if (lockedOpen && !tree.collapsedSections.includes(title)) {
      return;
    }
    writeSidebarTree({
      ...tree,
      collapsedSections: toggleTreeId(tree.collapsedSections, title),
    });
  };

  return (
    <nav className="nav-tree">
      {visibleSections.map((section) => {
        const hasOpenSubmenu = section.items.some(
          (item) => !isMobile && shouldShowWorkspaceNavSubmenu(tabs, item.href),
        );
        const sectionExpanded = hasOpenSubmenu || !tree.collapsedSections.includes(section.title);
        return (
          <div className="nav-tree__section" key={section.title}>
            <button
              aria-expanded={sectionExpanded}
              className="sidebar__section-title"
              onClick={() => toggleSection(section.title, hasOpenSubmenu)}
              type="button"
            >
              <TreeChevron expanded={sectionExpanded} />
              <span>{section.title}</span>
            </button>
            {sectionExpanded ? (
              <ul className="nav-list">
                {section.items.map((item) => {
                  const relatedTabs = listWorkspaceTabsForNavItem(tabs, item.href);
                  const hasSubmenu = !isMobile && shouldShowWorkspaceNavSubmenu(tabs, item.href);
                      const active = item.href === "/dashboard"
                        ? isHome
                        : currentTab
                          ? getWorkspaceBasePath(currentTab.pathname) === item.href
                          : false;
                  return (
                    <li key={item.href}>
                      <div className={`nav-link${active ? " nav-link--active" : ""}`}>
                        {hasSubmenu ? (
                          <span className="nav-tree-toggle">
                            <TreeChevron expanded />
                          </span>
                        ) : (
                          <span className="nav-tree-toggle nav-tree-toggle--spacer" />
                        )}
                        <button
                          className="nav-link__main"
                          onClick={() => {
                            openWorkspaceFromMenu(item.href, item.label);
                            onNavigate?.();
                          }}
                          type="button"
                        >
                          <span>{item.label}</span>
                          <span className="nav-hint">{item.hint}</span>
                        </button>
                      </div>
                      {hasSubmenu ? (
                        <ul aria-label={`Abas abertas de ${item.label}`} className="nav-sublist">
                          {relatedTabs.map((tab) => {
                            const subActive = tab.id === currentTab?.id;
                            return (
                              <li
                                className={`nav-subitem${subActive ? " nav-subitem--active" : ""}`}
                                key={tab.id}
                              >
                                <button
                                  className="nav-sublink"
                                  onClick={() => {
                                    activateWorkspace(tab.id);
                                    onNavigate?.();
                                  }}
                                  title={tab.subtitle ? `${tab.label} · ${tab.subtitle}` : tab.label}
                                  type="button"
                                >
                                  <span>{tab.label}</span>
                                  {tab.subtitle ? <small>{tab.subtitle}</small> : null}
                                </button>
                                <button
                                  aria-label={`Fechar ${tab.label}`}
                                  className="nav-sublink__close"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    closeWorkspace(tab.id);
                                  }}
                                  type="button"
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
