import { assertEquals } from "@std/assert";
import { planProfileFetch } from "../examples/src/domain/api_orchestration.good.ts";

for (
  const testCase of [
    {
      name: "an Error",
      cause: new Error("network unavailable"),
      message: "network unavailable",
    },
    {
      name: "an uninspectable cause",
      cause: Object.create(null),
      message: "Network request failed",
    },
  ] as const
) {
  Deno.test(`API example: ${testCase.name} becomes a Network result`, async () => {
    const planned = planProfileFetch(
      { request: () => Promise.reject(testCase.cause) },
      "token",
    );

    assertEquals(planned._tag, "Ok");
    if (planned._tag === "Err") return;

    assertEquals(await planned.value.run(), {
      _tag: "Err",
      error: { type: "Network", message: testCase.message },
    });
  });
}
