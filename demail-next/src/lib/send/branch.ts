// Pure helpers for condition steps; no imports so the migration check can load this file directly.
export const BRANCH_CONDITIONS = ["opened", "clicked", "replied", "visited_site", "always"] as const;
export type BranchCondition = (typeof BRANCH_CONDITIONS)[number];
export const BRANCH_CONDITION_LABELS: Record<BranchCondition, string> = {
  opened: "Opened an email",
  clicked: "Clicked a link",
  replied: "Replied",
  visited_site: "Visited your site",
  always: "End of path",
};
export const BRANCH_ACTIONS = ["next", "end", "step"] as const;
export type BranchAction = (typeof BRANCH_ACTIONS)[number];
export type GraphStep = {
  id: string;
  position: number;
  type: string;
  branch_condition: string | null;
  yes_action: string | null;
  yes_step_id: string | null;
  no_action: string | null;
  no_step_id: string | null;
};
// The step an outcome leads to; null means the sequence ends.
export function branchTarget<T extends GraphStep>(steps: T[], from: T, outcome: boolean): T | null {
  const action = outcome ? from.yes_action : from.no_action;
  if (action === "next") {
    let best: T | null = null;
    for (const s of steps) if (s.position > from.position && (!best || s.position < best.position)) best = s;
    return best;
  }
  if (action === "step") {
    const id = outcome ? from.yes_step_id : from.no_step_id;
    const target = steps.find((s) => s.id === id);
    return target && target.position > from.position ? target : null;
  }
  return null;
}
// Every reason the sequence would not move forward only; empty means it is valid.
export function graphProblems(steps: GraphStep[]): string[] {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const problems: string[] = [];
  sorted.forEach((s, i) => {
    if (s.type !== "branch") return;
    const n = i + 1;
    if (!(BRANCH_CONDITIONS as readonly string[]).includes(s.branch_condition ?? "")) problems.push(`Step ${n} has no valid condition.`);
    for (const [action, target] of [
      [s.yes_action, s.yes_step_id],
      [s.no_action, s.no_step_id],
    ] as const) {
      if (!(BRANCH_ACTIONS as readonly string[]).includes(action ?? "")) {
        problems.push(`Step ${n} has no valid target.`);
        continue;
      }
      if (action !== "step") continue;
      const t = sorted.find((x) => x.id === target);
      if (!t) problems.push(`Step ${n} goes to a step that no longer exists.`);
      else if (t.position <= s.position) problems.push(`Step ${n} goes to a step that is not after it.`);
    }
  });
  return problems;
}
