// Pure consensus: no imports, so the check script can load this file directly.
export type Vote = "valid" | "invalid" | "risky" | "catch_all" | "unknown";
export type BuiltIn = "valid" | "risky" | "invalid" | "unknown" | null;
export type Consensus = { status: "valid" | "risky" | "invalid"; votes: number; catchAll: boolean };

// Needs two conclusive votes. Valid only when every conclusive vote is valid; invalid only when every one is invalid;
// anything else is risky, with a catch-all flag when a provider says so. The built-in result is a floor:
// invalid stays invalid and risky never becomes valid.
export function decide(builtIn: BuiltIn, votes: Vote[]): Consensus | null {
  const conclusive = votes.filter((v) => v !== "unknown");
  if (builtIn === "invalid" || conclusive.length < 2) return null;
  const catchAll = conclusive.includes("catch_all");
  let status: Consensus["status"] = "risky";
  if (conclusive.every((v) => v === "valid")) status = "valid";
  else if (conclusive.every((v) => v === "invalid")) status = "invalid";
  if (status === "valid" && builtIn === "risky") status = "risky";
  return { status, votes: Math.min(conclusive.length, 3), catchAll };
}
