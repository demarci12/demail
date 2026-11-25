export type ThemeId =
  | "work-planning"
  | "scheduling"
  | "vendors-and-orders"
  | "events-and-travel"
  | "creative-and-craft"
  | "everyday-life";

// turns[0] opens from mailbox A, [1] is B's reply, [2] A's follow-up, [3] B's closer.
export type WarmupThread = {
  theme: ThemeId;
  subject: string;
  // Keys this thread had before an edit, so threads in flight continue and repeat history holds.
  previousKeys?: string[];
  turns: [string, string, string, string];
};
