import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, type Reply } from "@/components/auth/postJson";

// Shared by the Academics sections: the one place that turns a failed reply into a sentence for the person.
export type BranchChoice = { id: string; name: string; canEdit: boolean };
export type Notice = { variant: "success" | "error"; text: string } | null;

export const say = (reply: Reply, fallback: string) =>
  reply.status === 401
    ? SESSION_ENDED
    : reply.status === 429
      ? (reply.message ?? RATE_LIMITED)
      : reply.status === 0
        ? NETWORK_ERROR
        : (reply.message ?? fallback);
