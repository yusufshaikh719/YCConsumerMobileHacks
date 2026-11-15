import type { ImageSourcePropType } from "react-native";

export type LatLng = { lat: number; lng: number };

export type Member = { id: string; name: string; fullName: string; initials: string; tint: string };

export type Landmark = {
  id: string;
  name: string;
  neighborhood: string;
  coords: LatLng;
  thumbnail: ImageSourcePropType;
  trivia: string;
  source: "Wikipedia" | "OpenStreetMap";
  radiusMeters: number;
};

export const REACTIONS = ["🔥", "👏", "😂", "🫡"] as const;
export type Reaction = (typeof REACTIONS)[number];

export type Postcard = {
  id: string;
  memberId: string;
  landmark: Landmark;
  photo: ImageSourcePropType;
  completedAt: number;
  minutesTaken: number;
  reactions: Record<Reaction, string[]>;
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

export type AnteSnapshot = {
  meId: string;
  group: { name: string; inviteCode: string; members: Member[] };
  stakeCents: number;
  potCents: number;
  weekEndsAt: number;
  window: FreeWindow;
  postcards: Postcard[];
  standings: Standing[];
  nextPingAt: number | null;
};

export interface AnteService {
  positionMode: "device" | "simulated";
  getSnapshot(): AnteSnapshot;
  subscribe(listener: () => void): () => void;
  setWindow(window: FreeWindow): Promise<void>;
  armNextPing(now: number): Promise<number>;
  startSidequest(pingAt: number): Promise<Sidequest>;
  verifyArrival(quest: Sidequest, photoUri: string | null, position: LatLng): Promise<Verification>;
  react(postcardId: string, reaction: Reaction): Promise<void>;
}
