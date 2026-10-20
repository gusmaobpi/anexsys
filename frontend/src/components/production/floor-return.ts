export const FLOOR_RETURN_KEY = "anexsys.floor.return";

export function rememberFloorReturn(pathname: string) {
  if (pathname.startsWith("/floor/")) {
    sessionStorage.setItem(FLOOR_RETURN_KEY, pathname);
  }
}

export function consumeFloorReturn() {
  const value = sessionStorage.getItem(FLOOR_RETURN_KEY);
  if (!value?.startsWith("/floor/")) {
    return null;
  }
  sessionStorage.removeItem(FLOOR_RETURN_KEY);
  return value;
}
