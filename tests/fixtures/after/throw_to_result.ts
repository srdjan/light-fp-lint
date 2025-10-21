import { Err } from "@/result.ts";
export function f(): Result<string, number> {
  return Err(new Error("x"));
}
