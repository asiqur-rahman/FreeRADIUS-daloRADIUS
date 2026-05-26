import { BadRequest } from "./errors.js";

export function normalizeMac(input: string): string {
  const compact = input.replace(/[:.\s-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(compact)) {
    throw BadRequest("MAC address must contain 12 hexadecimal digits");
  }
  return compact.match(/.{2}/g)!.join(":");
}
