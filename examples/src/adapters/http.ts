// HTTP adapter stub: translates request descriptors into real fetch calls.
//
// The stub answers from a table rather than reaching the network, so nothing
// here awaits. The port still promises a promise, so each response says so with
// `Promise.resolve` instead of an `async` that never awaits anything. A real
// adapter would await `fetch` and keep the same shape.

import type { HttpCapability } from "../domain/api_orchestration.good.ts";

export const httpCapability: HttpCapability = {
  request(request) {
    if (request.path === "/me" && request.method === "GET") {
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({ email: "admin@example.com", roles: ["admin"] }),
      });
    }
    if (request.path === "/audit" && request.method === "POST") {
      return Promise.resolve({
        status: 202,
        json: () => Promise.resolve({ ok: true, received: request.body }),
      });
    }
    return Promise.resolve({
      status: 404,
      json: () => Promise.resolve({ message: "Not found" }),
    });
  },
};
