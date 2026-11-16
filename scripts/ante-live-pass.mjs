#!/usr/bin/env node
// Live end-to-end pass against a Convex deployment, using two demo device identities.
//   node scripts/ante-live-pass.mjs            create a group, join it, stamp, open a sandbox checkout
//   node scripts/ante-live-pass.mjs check <potId> <deviceId>   print the group as that phone sees it
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL to the deployment URL");
const client = new ConvexHttpClient(url);
const api = anyApi;
const log = (step, value) => console.log(JSON.stringify({ step, ...value }));
const summary = group => group && {
  title: group.title, inviteCode: group.inviteCode, potCents: group.potCents, status: group.status, payments: group.payments,
  members: group.members.map(m => `${m.name}:${m.stakeStatus}`),
  stamps: group.stamps.map(s => ({ by: group.members.find(m => m.userId === s.userId)?.name, landmark: s.landmark.name, minutes: s.minutesTaken, photo: Boolean(s.photoUrl), verifiedBy: s.verifiedBy })),
  lastSettlement: group.lastSettlement,
};

if (process.argv[2] === "check") {
  const [, , , potId, deviceId] = process.argv;
  log("check", summary(await client.query(api.ante.getGroup, { deviceId, potId })));
  process.exit(0);
}

const run = Date.now().toString(36);
const a = `live-a-${run}`;
const b = `live-b-${run}`;
const weekEndsAt = (() => {
  const end = new Date();
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  end.setHours(21, 0, 0, 0);
  if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 7);
  return end.getTime();
})();

const userA = await client.mutation(api.ante.ensureUser, { deviceId: a, name: "Live Aahil" });
const userB = await client.mutation(api.ante.ensureUser, { deviceId: b, name: "Live Yusuf" });
const { potId, inviteCode } = await client.mutation(api.ante.createGroup, { deviceId: a, name: `Live pass ${run}`, weekEndsAt });
log("created", { potId, inviteCode, userA, userB });
log("joined", await client.mutation(api.ante.joinGroup, { deviceId: b, inviteCode }));

const origin = { lat: 37.7694, lng: -122.4862 };
const landmark = { id: "wiki-69749966", name: "Spreckels Temple of Music", neighborhood: "Golden Gate Park", lat: 37.76972, lng: -122.46833, trivia: "An open-air bandshell in Golden Gate Park's Music Concourse, built in 1900.", source: "Wikipedia", radiusMeters: 50 };
const landmarkPhoto = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Golden_Gate_Park_-_Spreckels_Temple_of_Music_02.jpg/960px-Golden_Gate_Park_-_Spreckels_Temple_of_Music_02.jpg";
const store = async (bytes, type) => {
  const target = await client.mutation(api.submissions.generateUploadUrl, {});
  return (await (await fetch(target, { method: "POST", headers: { "Content-Type": type }, body: bytes })).json()).storageId;
};
const now = Date.now();
const sidequestId = await client.mutation(api.ante.startQuest, { deviceId: a, potId, landmark, originLat: origin.lat, originLng: origin.lng, pingAt: now - 60_000, revealAt: now, expiresAt: now + 25 * 60_000 });
const away = await client.action(api.ante.submitArrival, { deviceId: a, sidequestId, lat: origin.lat, lng: origin.lng, accuracy: 10 });
log("arrival from the start point", away);
const blank = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="), c => c.charCodeAt(0));
log("arrival at the landmark with a blank photo", await client.action(api.ante.submitArrival, { deviceId: a, sidequestId, lat: landmark.lat, lng: landmark.lng, accuracy: 10, photoStorageId: await store(blank, "image/jpeg") }));
const photo = new Uint8Array(await (await fetch(landmarkPhoto, { headers: { "User-Agent": "AnteApp/1.0 (live pass)" } })).arrayBuffer());
log("arrival at the landmark with a photo of it", await client.action(api.ante.submitArrival, { deviceId: a, sidequestId, lat: landmark.lat, lng: landmark.lng, accuracy: 10, photoStorageId: await store(photo, "image/jpeg") }));
log("seen by phone B", summary(await client.query(api.ante.getGroup, { deviceId: b, potId })));

const checkout = await client.action(api.whop.createPotCheckout, { potId, userId: userB });
log("checkout for phone B", checkout);
console.log(`\nPay the sandbox checkout, then run: node scripts/ante-live-pass.mjs check ${potId} ${a}`);
