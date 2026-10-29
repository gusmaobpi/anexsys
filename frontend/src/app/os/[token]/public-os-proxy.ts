const backendOrigin = (process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:3000").replace(/\/$/, "");

export function publicOsBackendUrl(token: string, suffix = "") {
  return `${backendOrigin}/api/v1/public/service-orders/${encodeURIComponent(token)}${suffix}`;
}

export async function proxyPublicOsRequest(
  token: string,
  init?: RequestInit & { action?: "recebi" | "concordo" },
): Promise<Response> {
  const suffix = init?.action ? `/${init.action}` : "";
  try {
    const response = await fetch(publicOsBackendUrl(token, suffix), {
      method: init?.method ?? "GET",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      body: init?.body,
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return Response.json(
        { message: "O servidor da OS não concluiu a operação. Pare o processo da porta 3000, rode npm run start:dev e recarregue." },
        { status: 502 },
      );
    }
    return new Response(text, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json(
      { message: "O servidor da OS não respondeu na porta 3000. Deixe o npm run start:dev no ar e recarregue." },
      { status: 503 },
    );
  }
}

export async function readRouteToken(params: Promise<{ token: string }> | { token: string }) {
  return Promise.resolve(params);
}
