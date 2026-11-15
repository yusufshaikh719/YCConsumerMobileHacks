import type { PersonaId } from "./lib/contracts";

export const ROAST_PERSONAS: Record<PersonaId, { name: string; fallbackMessage: string }> = {
  drill_sergeant: { name: "Drill Sergeant", fallbackMessage: "Proof received. Keep that streak moving!" },
  passive_aggressive_roommate: { name: "Passive-Aggressive Roommate", fallbackMessage: "Oh, you actually did it. Nice." },
  wall_street_bro: { name: "Wall Street Bro", fallbackMessage: "That's a bullish streak. Keep investing in yourself." },
  disappointed_coach: { name: "Disappointed Coach", fallbackMessage: "Good work. Let's see you do it again tomorrow." },
};
