import coitTowerThumb from "../../assets/landmarks/coit-tower.jpg";
import paintedLadiesThumb from "../../assets/landmarks/painted-ladies.jpg";
import ferryBuildingThumb from "../../assets/landmarks/ferry-building.jpg";
import palaceFineArtsThumb from "../../assets/landmarks/palace-fine-arts.jpg";
import missionDoloresThumb from "../../assets/landmarks/mission-dolores.jpg";
import transamericaThumb from "../../assets/landmarks/transamerica.jpg";
import graceCathedralThumb from "../../assets/landmarks/grace-cathedral.jpg";
import lottasFountainThumb from "../../assets/landmarks/lottas-fountain.jpg";
import youCoitPhoto from "../../assets/postcards/you-coit.jpg";
import sarahPaintedLadiesPhoto from "../../assets/postcards/sarah-painted-ladies.jpg";
import yusufGraceCathedralPhoto from "../../assets/postcards/yusuf-grace-cathedral.jpg";
import sarahTransamericaPhoto from "../../assets/postcards/sarah-transamerica.jpg";
import youFerryBuildingPhoto from "../../assets/postcards/you-ferry-building.jpg";
import mayaCoitPhoto from "../../assets/postcards/maya-coit.jpg";
import leoMissionDoloresPhoto from "../../assets/postcards/leo-mission-dolores.jpg";
import youLottasFountainPhoto from "../../assets/postcards/you-lottas-fountain.jpg";
import sarahMissionDoloresPhoto from "../../assets/postcards/sarah-mission-dolores.jpg";
import yusufFerryBuildingPhoto from "../../assets/postcards/yusuf-ferry-building.jpg";
import mayaPalaceFineArtsPhoto from "../../assets/postcards/maya-palace-fine-arts.jpg";
import youPaintedLadiesPhoto from "../../assets/postcards/you-painted-ladies.jpg";
import type { Landmark, LatLng, Member, Postcard, Reaction } from "./types";

export const ME_ID = "aahil";

export const members: Member[] = [
  { id: "aahil", name: "Aahil", fullName: "Aahil Shaikh", initials: "AS", tint: "#2FA052" },
  { id: "sarah", name: "Sarah", fullName: "Sarah Kim", initials: "SK", tint: "#C9772E" },
  { id: "yusuf", name: "Yusuf", fullName: "Yusuf Shaikh", initials: "YS", tint: "#3C6E9E" },
  { id: "maya", name: "Maya", fullName: "Maya Patel", initials: "MP", tint: "#A4507A" },
  { id: "leo", name: "Leo", fullName: "Leo Martinez", initials: "LM", tint: "#8A6D2F" },
  { id: "priya", name: "Priya", fullName: "Priya Nair", initials: "PN", tint: "#5B5F97" },
];

export const group = { name: "Sidequest Society", inviteCode: "HILL42", members };

export const STAKE_CENTS = 2000;

export const landmarks = {
  coit: {
    id: "coit-tower", name: "Coit Tower", neighborhood: "Telegraph Hill", coords: { lat: 37.8024, lng: -122.4058 },
    thumbnail: coitTowerThumb, source: "Wikipedia", radiusMeters: 45,
    trivia: "Paid for by Lillie Hitchcock Coit's 1929 bequest \"to add to the beauty of the city I have always loved.\"",
  },
  paintedLadies: {
    id: "painted-ladies", name: "Painted Ladies", neighborhood: "Alamo Square", coords: { lat: 37.7764, lng: -122.4331 },
    thumbnail: paintedLadiesThumb, source: "Wikipedia", radiusMeters: 50,
    trivia: "The row of Victorians on Steiner Street was built by developer Matthew Kavanaugh between 1892 and 1896.",
  },
  ferryBuilding: {
    id: "ferry-building", name: "Ferry Building", neighborhood: "Embarcadero", coords: { lat: 37.7955, lng: -122.3937 },
    thumbnail: ferryBuildingThumb, source: "Wikipedia", radiusMeters: 50,
    trivia: "Its 245-foot clock tower was modeled on the Giralda bell tower of Seville Cathedral.",
  },
  palace: {
    id: "palace-fine-arts", name: "Palace of Fine Arts", neighborhood: "Marina", coords: { lat: 37.8028, lng: -122.4483 },
    thumbnail: palaceFineArtsThumb, source: "Wikipedia", radiusMeters: 60,
    trivia: "Built for the 1915 Panama–Pacific Exposition, it was meant to come down when the fair closed.",
  },
  missionDolores: {
    id: "mission-dolores", name: "Mission Dolores", neighborhood: "Mission", coords: { lat: 37.7644, lng: -122.4270 },
    thumbnail: missionDoloresThumb, source: "Wikipedia", radiusMeters: 40,
    trivia: "Completed in 1791, the mission chapel is the oldest surviving building in San Francisco.",
  },
  transamerica: {
    id: "transamerica", name: "Transamerica Pyramid", neighborhood: "Financial District", coords: { lat: 37.7952, lng: -122.4028 },
    thumbnail: transamericaThumb, source: "OpenStreetMap", radiusMeters: 45,
    trivia: "At 853 feet it was San Francisco's tallest building from 1972 until Salesforce Tower topped out in 2018.",
  },
  grace: {
    id: "grace-cathedral", name: "Grace Cathedral", neighborhood: "Nob Hill", coords: { lat: 37.7919, lng: -122.4133 },
    thumbnail: graceCathedralThumb, source: "Wikipedia", radiusMeters: 45,
    trivia: "Its east doors are gilded casts of Ghiberti's \"Gates of Paradise\" from the Florence Baptistery.",
  },
  lotta: {
    id: "lottas-fountain", name: "Lotta's Fountain", neighborhood: "Union Square", coords: { lat: 37.7881, lng: -122.4036 },
    thumbnail: lottasFountainThumb, source: "Wikipedia", radiusMeters: 30,
    trivia: "San Francisco's oldest surviving monument; survivors of the 1906 earthquake used it as a meeting point.",
  },
} satisfies Record<string, Landmark>;

export const todaysQuest = { landmark: landmarks.coit, origin: { lat: 37.7972, lng: -122.4085 } satisfies LatLng, walkMinutes: 9, windowMinutes: 20 };

export const myQuestPhoto = youCoitPhoto;

const emptyReactions = (): Record<Reaction, string[]> => ({ "🔥": [], "👏": [], "😂": [], "🫡": [] });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function seedPostcards(now: number): Postcard[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const at = (daysAgo: number, hour: number) => today.getTime() - daysAgo * DAY + hour * HOUR;
  const card = (id: string, memberId: string, landmark: Landmark, photo: Postcard["photo"], completedAt: number, minutesTaken: number, reactions: Partial<Record<Reaction, string[]>> = {}): Postcard =>
    ({ id, memberId, landmark, photo, completedAt, minutesTaken, reactions: { ...emptyReactions(), ...reactions } });
  return [
    card("pc-sarah-painted", "sarah", landmarks.paintedLadies, sarahPaintedLadiesPhoto, Math.min(at(0, 12.4), now - 2 * HOUR), 8, { "🔥": ["yusuf", "maya"], "👏": ["leo"] }),
    card("pc-yusuf-grace", "yusuf", landmarks.grace, yusufGraceCathedralPhoto, Math.min(at(0, 13.1), now - HOUR), 12, { "😂": ["sarah"], "🫡": ["aahil"] }),
    card("pc-sarah-transamerica", "sarah", landmarks.transamerica, sarahTransamericaPhoto, at(2, 17.6), 11, { "🔥": ["aahil"] }),
    card("pc-aahil-ferry", "aahil", landmarks.ferryBuilding, youFerryBuildingPhoto, at(2, 18.9), 14, { "👏": ["sarah", "priya"] }),
    card("pc-maya-coit", "maya", landmarks.coit, mayaCoitPhoto, at(3, 16.3), 10, { "🔥": ["leo", "aahil"] }),
    card("pc-leo-mission", "leo", landmarks.missionDolores, leoMissionDoloresPhoto, at(3, 15.2), 13, { "😂": ["yusuf", "maya"] }),
    card("pc-aahil-lotta", "aahil", landmarks.lotta, youLottasFountainPhoto, at(4, 12.7), 11, { "🫡": ["leo"] }),
    card("pc-sarah-mission", "sarah", landmarks.missionDolores, sarahMissionDoloresPhoto, at(4, 8.5), 12, { "👏": ["maya"] }),
    card("pc-yusuf-ferry", "yusuf", landmarks.ferryBuilding, yusufFerryBuildingPhoto, at(5, 17.2), 9),
    card("pc-maya-palace", "maya", landmarks.palace, mayaPalaceFineArtsPhoto, at(5, 16.8), 15, { "🔥": ["sarah"] }),
    card("pc-aahil-painted", "aahil", landmarks.paintedLadies, youPaintedLadiesPhoto, at(5, 15.4), 13, { "👏": ["yusuf"] }),
  ];
}

export function weekEndsAt(now: number) {
  const end = new Date(now);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  end.setHours(21, 0, 0, 0);
  return end.getTime() > now ? end.getTime() : end.getTime() + 7 * DAY;
}
