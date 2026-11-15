import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/webhooks/whop",
  method: "POST",
  handler: httpAction(async () => new Response("Whop webhook verification is not configured", { status: 501 })),
});

export default http;
