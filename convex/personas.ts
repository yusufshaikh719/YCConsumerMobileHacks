import type { PersonaId } from "./lib/contracts";

type RoastContext = {
  verdict: "passed" | "failed_habit" | "failed_spoof";
  userName: string;
  habitPrompt: string;
  spoofSignals: string[];
  streakCount: number;
};

type RoastPersona = {
  name: string;
  fallbackMessage: string;
  tagline: string;
  systemInstruction: string;
  buildFallbackRoast: (context: RoastContext) => string;
};

export const ROAST_PERSONAS: Record<PersonaId, RoastPersona> = {
  drill_sergeant: {
    name: "Drill Sergeant",
    fallbackMessage: "Proof received. Keep that streak moving!",
    tagline: "Accountability at full volume.",
    systemInstruction: "Speak like a theatrical drill sergeant: sharp commands, military metaphors, and backhanded encouragement. Be playful, never cruel.",
    buildFallbackRoast: ({ verdict, userName, habitPrompt, spoofSignals, streakCount }) => {
      if (verdict === "passed") return `${userName}, proof accepted! ${streakCount} days on your streak. At ease, overachiever; tomorrow we do it again.`;
      if (verdict === "failed_habit") return `${userName}, your mission was "${habitPrompt}". That proof wouldn't pass inspection at a pillow fort. Fall in tomorrow!`;
      return `${userName}, suspicious signals: ${spoofSignals.join(", ") || "none reported"}. This is a habit challenge, not a covert operation. Present real proof!`;
    },
  },
  passive_aggressive_roommate: {
    name: "Passive-Aggressive Roommate",
    fallbackMessage: "Oh, you actually did it. Nice.",
    tagline: "A sticky note with feelings.",
    systemInstruction: "Speak like a passive-aggressive roommate leaving a polite but pointed sticky note. Use dry understatement and backhanded praise, never personal insults.",
    buildFallbackRoast: ({ verdict, userName, habitPrompt, spoofSignals, streakCount }) => {
      if (verdict === "passed") return `Oh, ${userName}, you actually did it. ${streakCount} days in a row. I'll put your medal next to the dishes you definitely washed.`;
      if (verdict === "failed_habit") return `Hey ${userName}, just a gentle reminder that "${habitPrompt}" was the assignment. No worries; I'll add it to the chore chart.`;
      return `Hey ${userName}, noticed ${spoofSignals.join(", ") || "no reported signal"} on your proof. I'm sure there's a perfectly convenient explanation. As usual.`;
    },
  },
  wall_street_bro: {
    name: "Wall Street Bro",
    fallbackMessage: "That's a bullish streak. Keep investing in yourself.",
    tagline: "Long on habits, short on excuses.",
    systemInstruction: "Speak like an overconfident Wall Street bro: market jargon, absurd trading metaphors, and backhanded hype. Keep the joke light and avoid financial advice.",
    buildFallbackRoast: ({ verdict, userName, habitPrompt, spoofSignals, streakCount }) => {
      if (verdict === "passed") return `${userName}, proof cleared compliance. Your ${streakCount}-day streak is outperforming my group chat's stock picks. Bullish.`;
      if (verdict === "failed_habit") return `${userName}, we were long on "${habitPrompt}" and short on evidence. That's a margin call on your excuses.`;
      return `${userName}, compliance flagged ${spoofSignals.join(", ") || "no reported signal"}. You can't diversify suspicious evidence into actual proof, bro.`;
    },
  },
  disappointed_coach: {
    name: "Disappointed Coach",
    fallbackMessage: "Good work. Let's see you do it again tomorrow.",
    tagline: "Proud, but never quite satisfied.",
    systemInstruction: "Speak like a disappointed but caring sports coach: locker-room metaphors, restrained praise, and high expectations. Roast the effort, not the person.",
    buildFallbackRoast: ({ verdict, userName, habitPrompt, spoofSignals, streakCount }) => {
      if (verdict === "passed") return `${userName}, ${streakCount} days on the streak. Good hustle. The trophy is still imaginary, but so was your warm-up.`;
      if (verdict === "failed_habit") return `${userName}, the play was "${habitPrompt}". That proof spent the whole game on the bench. Reset and try again tomorrow.`;
      return `${userName}, the review flagged ${spoofSignals.join(", ") || "no reported signal"}. Nice try, but questionable proof can't come off the bench for you.`;
    },
  },
};
