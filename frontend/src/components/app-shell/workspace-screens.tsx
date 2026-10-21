"use client";

import type { ComponentType, ReactNode } from "react";
import { AccessWorkspace } from "@/components/admin/access-workspace";
import { BranchesWorkspace } from "@/components/admin/branches-workspace";
import { WorkGroupsWorkspace } from "@/components/admin/work-groups-workspace";
import { CompaniesWorkspace } from "@/components/admin/companies-workspace";
import { EmpresasWorkspace } from "@/components/admin/empresas-workspace";
import { DashboardWorkspace } from "@/components/app-shell/dashboard-workspace";
import { useWorkspaceManager } from "@/components/app-shell/workspace-manager";
import { getWorkspaceBasePath } from "@/components/app-shell/workspace-manager-store";
import { WorkspacePaneProvider } from "@/components/app-shell/workspace-pane";
import { CustomerWorkspace } from "@/components/customers/customer-workspace";
import { AtelierCatalogWorkspace } from "@/components/catalog/atelier-catalog-workspace";
import { MinuteRatesWorkspace } from "@/components/catalog/minute-rates-workspace";
import { ProductPricesWorkspace } from "@/components/catalog/product-prices-workspace";
import { MeasurementMasterDataWorkspace } from "@/components/measurements/measurement-master-data-workspace";
import { FloorCollaboratorsWorkspace } from "@/components/production/floor-collaborators-workspace";
import { FloorGradeWorkspace } from "@/components/production/floor-grade-workspace";
import { FloorTodayWorkspace } from "@/components/production/floor-today-workspace";
import { PickBagWorkspace } from "@/components/production/pick-bag-workspace";
import { QualityWorkspace } from "@/components/quality/quality-workspace";
import { ServiceOrdersWorkspace } from "@/components/service-orders/service-orders-workspace";
import { PaymentProvidersWorkspace } from "@/components/settings/payment-providers-workspace";
import { PaymentTerminalsWorkspace } from "@/components/settings/payment-terminals-workspace";
import { WhatsappNoticesWorkspace } from "@/components/settings/whatsapp-notices-workspace";
import { EmailSettingsWorkspace } from "@/components/settings/email-settings-workspace";
import { WhatsappSettingsWorkspace } from "@/components/settings/whatsapp-settings-workspace";

function AccessWorkspaceScreen() {
  return <AccessWorkspace />;
}

function BodyPartsWorkspaceScreen() {
  return <MeasurementMasterDataWorkspace mode="body-parts" />;
}

function MeasurementUnitsWorkspaceScreen() {
  return <MeasurementMasterDataWorkspace mode="units" />;
}

function ProductsWorkspaceScreen() {
  return <AtelierCatalogWorkspace mode="products" />;
}

function ServicesWorkspaceScreen() {
  return <AtelierCatalogWorkspace mode="services" />;
}

function PricesWorkspaceScreen() {
  return <ProductPricesWorkspace />;
}

function MinuteRatesWorkspaceScreen() {
  return <MinuteRatesWorkspace />;
}

function PaymentProvidersWorkspaceScreen() {
  return <PaymentProvidersWorkspace />;
}

function PaymentTerminalsWorkspaceScreen() {
  return <PaymentTerminalsWorkspace />;
}

const workspaceScreens: Record<string, ComponentType> = {
  "/dashboard": DashboardWorkspace,
  "/admin/tenants": CompaniesWorkspace,
  "/admin/companies": EmpresasWorkspace,
  "/admin/branches": BranchesWorkspace,
  "/admin/access": AccessWorkspaceScreen,
  "/admin/work-groups": WorkGroupsWorkspace,
  "/customers": CustomerWorkspace,
  "/body-parts": BodyPartsWorkspaceScreen,
  "/measurement-units": MeasurementUnitsWorkspaceScreen,
  "/products": ProductsWorkspaceScreen,
  "/services": ServicesWorkspaceScreen,
  "/prices": PricesWorkspaceScreen,
  "/minute-rates": MinuteRatesWorkspaceScreen,
  "/settings/payments": PaymentProvidersWorkspaceScreen,
  "/settings/payments/terminals": PaymentTerminalsWorkspaceScreen,
  "/settings/whatsapp": WhatsappSettingsWorkspace,
  "/settings/email": EmailSettingsWorkspace,
  "/whatsapp-notices": WhatsappNoticesWorkspace,
  "/service-orders": ServiceOrdersWorkspace,
  "/pick-bag": PickBagWorkspace,
  "/floor-collaborators": FloorCollaboratorsWorkspace,
  "/floor-schedule": FloorGradeWorkspace,
  "/floor-today": FloorTodayWorkspace,
  "/quality": QualityWorkspace,
};

export function resolveWorkspaceScreen(pathname: string): ComponentType | null {
  return workspaceScreens[getWorkspaceBasePath(pathname)] ?? null;
}

export function WorkspaceKeepAlive({ children }: Readonly<{ children: ReactNode }>) {
  const { currentTab, currentTabId, tabs } = useWorkspaceManager();
  const activeScreen = currentTab ? resolveWorkspaceScreen(currentTab.pathname) : null;

  return (
    <>
      {tabs.map((tab) => {
        if (tab.id !== currentTabId) {
          return null;
        }
        const Screen = resolveWorkspaceScreen(tab.pathname);
        if (!Screen) {
          return null;
        }

        return (
          <div className="workspace-pane" key={tab.id}>
            <WorkspacePaneProvider tab={tab}>
              <Screen />
            </WorkspacePaneProvider>
          </div>
        );
      })}
      {activeScreen ? null : children}
    </>
  );
}
