import type { Sidequest, Verification } from "../services/types";

export type Phase =
  | { name: "waiting"; preview?: "open" | "closed" }
  | { name: "ping"; quest: Sidequest }
  | { name: "live"; quest: Sidequest }
  | { name: "arrived"; quest: Sidequest }
  | { name: "verifying"; quest: Sidequest; photoUri: string | null }
  | { name: "verified"; quest: Sidequest; result: Extract<Verification, { ok: true }> }
  | { name: "failed"; quest: Sidequest; reason: "timeout" | "not_verified" };

export type PhaseName = Phase["name"];

export type Event =
  | { type: "PING"; quest: Sidequest; now: number }
  | { type: "REVEAL" }
  | { type: "ARRIVE" }
  | { type: "CAPTURE"; photoUri: string | null }
  | { type: "VERIFIED"; result: Extract<Verification, { ok: true }> }
  | { type: "REJECTED" }
  | { type: "RETAKE"; now: number }
  | { type: "TIMEOUT" }
  | { type: "DONE" }
  | { type: "DEV_JUMP"; phase: Phase };

export const initialPhase: Phase = { name: "waiting" };

export function phaseForQuest(quest: Sidequest, now: number): Phase {
  if (now < quest.revealAt) return { name: "ping", quest };
  if (now < quest.expiresAt) return { name: "live", quest };
  return { name: "failed", quest, reason: "timeout" };
}

export function pingSecondsLeft(quest: Sidequest, now: number) {
  return Math.max(0, Math.min(60, Math.ceil((quest.revealAt - now) / 1000)));
}

export function questProgress(quest: Sidequest, now: number) {
  const span = quest.expiresAt - quest.revealAt;
  return Math.max(0, Math.min(1, (quest.expiresAt - now) / span));
}

export function reduce(phase: Phase, event: Event): Phase {
  if (event.type === "DEV_JUMP") return event.phase;
  switch (phase.name) {
    case "waiting":
      return event.type === "PING" ? phaseForQuest(event.quest, event.now) : phase;
    case "ping":
      return event.type === "REVEAL" ? { name: "live", quest: phase.quest } : phase;
    case "live":
      if (event.type === "ARRIVE") return { name: "arrived", quest: phase.quest };
      if (event.type === "TIMEOUT") return { name: "failed", quest: phase.quest, reason: "timeout" };
      return phase;
    case "arrived":
      if (event.type === "CAPTURE") return { name: "verifying", quest: phase.quest, photoUri: event.photoUri };
      if (event.type === "TIMEOUT") return { name: "failed", quest: phase.quest, reason: "timeout" };
      return phase;
    case "verifying":
      if (event.type === "VERIFIED") return { name: "verified", quest: phase.quest, result: event.result };
      if (event.type === "REJECTED") return { name: "failed", quest: phase.quest, reason: "not_verified" };
      return phase;
    case "verified":
      return event.type === "DONE" ? initialPhase : phase;
    case "failed":
      if (event.type === "DONE") return initialPhase;
      if (event.type === "RETAKE" && phase.reason === "not_verified" && event.now < phase.quest.expiresAt) return { name: "arrived", quest: phase.quest };
      return phase;
  }
}
