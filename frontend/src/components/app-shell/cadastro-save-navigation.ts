import { useEffect } from "react";

export type CadastroSaveIntent = "close" | "continue";

const CADASTRO_CHANGED_EVENT = "anexsys:cadastro-changed";

export function notifyCadastroChanged(path: string) {
  window.dispatchEvent(new CustomEvent(CADASTRO_CHANGED_EVENT, { detail: { path } }));
}

/** The list tab reloads in the background so the grade shows the record that was just saved. */
export function useCadastroListRefresh(path: string, enabled: boolean, reload: () => void | Promise<void>) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path !== path) {
        return;
      }
      void reload();
    };
    window.addEventListener(CADASTRO_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CADASTRO_CHANGED_EVENT, onChanged);
  }, [enabled, path, reload]);
}

type CadastroSaveExit = {
  currentTabId: string | null;
  isMobile: boolean;
  closeWorkspace: (tabId: string) => void;
};

export function requestCadastroContinue(
  event: { preventDefault(): void; currentTarget: { form: HTMLFormElement | null } },
  save: (event: { preventDefault(): void }, intent: CadastroSaveIntent) => void | Promise<void>,
) {
  if (event.currentTarget.form && !event.currentTarget.form.reportValidity()) {
    return;
  }
  void save(event, "continue");
}

export function finishCadastroSave(
  intent: CadastroSaveIntent,
  exit: CadastroSaveExit,
  options: {
    listPath: string;
    openCreate: () => void;
    navigateToList: () => void;
  },
) {
  notifyCadastroChanged(options.listPath);
  if (intent === "continue") {
    const closingTabId = exit.currentTabId;
    if (!closingTabId || exit.isMobile) {
      options.openCreate();
      return;
    }
    options.openCreate();
    window.setTimeout(() => {
      exit.closeWorkspace(closingTabId);
    }, 0);
    return;
  }
  if (!exit.currentTabId || exit.isMobile) {
    options.navigateToList();
    return;
  }
  exit.closeWorkspace(exit.currentTabId);
}
