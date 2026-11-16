import type { ImageSourcePropType } from "react-native";

export type LatLng = { lat: number; lng: number };

export type Fix = LatLng & { accuracy?: number | null };

export type Member = { id: string; name: string; fullName: string; initials: string; tint: string };

export type Landmark = {
  id: string;
  name: string;
  neighborhood: string;
  coords: LatLng;
  thumbnail: ImageSourcePropType | null;
  trivia: string;
  source: "Wikipedia" | "OpenStreetMap";
  url?: string;
  radiusMeters: number;
};

export const REACTIONS = ["🔥", "👏", "😂", "🫡"] as const;
export type Reaction = (typeof REACTIONS)[number];

export type Postcard = {
  id: string;
  memberId: string;
  landmark: Landmark;
  photo: ImageSourcePropType | null;
  completedAt: number;
  minutesTaken: number;
  reactions: Record<Reaction, string[]>;
  verifiedBy?: "photo_ai" | "gps_only";
};

export type Standing = { member: Member; completed: number; minutes: number; rank: number };

export type FreeWindow = { startMinute: number; endMinute: number };

export type Sidequest = {
  id: string;
  landmark: Landmark;
  origin: LatLng;
  pingAt: number;
  revealAt: number;
  expiresAt: number;
  distanceMeters: number;
  walkMinutes: number;
};

export type Verification =
  | { ok: true; postcard: Postcard; before: Standing[]; after: Standing[] }
  | { ok: false; reason: "not_verified" };

export type Funding = {
  payments: "sandbox" | "production" | "unavailable";
  myStake: "paid" | "unpaid" | null;
  paidCount: number;
  lastPayout: { winners: string[]; amountCents: number; transfer: "whop" | "pending" | "fallback"; at: number } | null;
};

export type JoinResult = "joined" | "invalid" | "not_found" | "offline";

export type BuyIn = { url: string | null; mode: "live" | "fallback" };

export type AnteSnapshot = {
  meId: string;
  backend: "convex" | "local";
  funding: Funding;
  loaded: boolean;
  onboarded: boolean;
  group: { name: string; inviteCode: string; members: Member[]; joined: boolean };
  stakeCents: number;
  potCents: number;
  weekEndsAt: number;
  windows: FreeWindow[];
  postcards: Postcard[];
  standings: Standing[];
  nextPingAt: number | null;
};

export class NoLandmarkError extends Error {
  constructor() {
    super("No landmark within a short walk");
  }
}

export interface AnteService {
  getSnapshot(): AnteSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  setName(name: string): Promise<void>;
  setWindows(windows: FreeWindow[]): Promise<void>;
  createGroup(name: string): Promise<void>;
  joinGroup(input: string): Promise<JoinResult>;
  finishOnboarding(): Promise<void>;
  armNextPing(now: number, pingAt?: number): Promise<number | null>;
  startSidequest(pingAt: number, origin: LatLng): Promise<Sidequest>;
  verifyArrival(quest: Sidequest, photoUri: string | null, position: Fix): Promise<Verification>;
  react(postcardId: string, reaction: Reaction): Promise<void>;
  buyIn(): Promise<BuyIn>;
}
