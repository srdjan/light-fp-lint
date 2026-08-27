// HTTP adapter stub: translates request descriptors into real fetch calls.

import type {
  HttpCapability,
  HttpRequest,
  HttpResponse,
} from "../domain/api_orchestration.good.ts";

export const httpCapability: HttpCapability = {
  async request(request) {
    if (request.path === "/me" && request.method === "GET") {
      return {
        status: 200,
        json: async () => ({ email: "admin@example.com", roles: ["admin"] }),
      };
    }
    if (request.path === "/audit" && request.method === "POST") {
      return {
        status: 202,
        json: async () => ({ ok: true, received: request.body }),
      };
    }
    return {
      status: 404,
      json: async () => ({ message: "Not found" }),
    };
  },
};
