
import { proxyPublicOsRequest, readRouteToken } from "../public-os-proxy";



export const dynamic = "force-dynamic";



export async function POST(

  request: Request,

  context: { params: Promise<{ token: string }> | { token: string } }

) {

  const { token } = await readRouteToken(context.params);



  return proxyPublicOsRequest(token, {

    method: "POST",

    headers: {

      Accept: "application/json",

      "content-type": "application/json",

      "user-agent": request.headers.get("user-agent") ?? "",

    },

    body: "{}",

  });

}

