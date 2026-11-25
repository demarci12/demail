"use client";
import { useEffect } from "react";
import { markThreadRead } from "./actions";
export function MarkRead({ threadId }: { threadId: string }) {
  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId]);
  return null;
}
