// Captures the deck's app screens from the Ante web build. See README.md for how to run it.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? "http://localhost:8081";
const OUT = process.env.OUT ?? join(here, "..", "screens");
const CHROME = process.env.CHROME_PATH;
const NAME = process.env.CAPTURE_NAME ?? "Aahil";
const GROUP = process.env.CAPTURE_GROUP ?? "Hackathon crew";
const [LAT, LNG] = (process.env.CAPTURE_AT ?? "37.7880,-122.4075").split(",").map(Number);
const WORK = join(here, ".work");
const FEED = join(WORK, "camera.y4m");

mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
ffmpeg("-f", "lavfi", "-i", "color=c=0xE4DDCB:s=720x960", "-frames:v", "1", "-pix_fmt", "yuv420p", FEED);

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + FEED],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  permissions: ["notifications", "geolocation", "camera"],
  geolocation: { latitude: LAT, longitude: LNG, accuracy: 8 },
});

const places = [];
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
await context.route(/en\.wikipedia\.org\/w\/api\.php|overpass-api\.de\/api\/interpreter/, async route => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  try {
    const response = await route.fetch({ timeout: 20000 });
    const body = await response.text();
    try {
      const json = JSON.parse(body);
      for (const page of Object.values(json.query?.pages ?? {})) {
        const at = page.coordinates?.[0];
        if (at) places.push({ name: page.title, lat: at.lat, lng: at.lon, image: page.thumbnail?.source });
      }
      for (const el of json.elements ?? []) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (el.tags?.name && lat != null) places.push({ name: el.tags.name, lat, lng });
      }
    } catch {}
    await route.fulfill({ response, body, headers: { ...response.headers(), ...cors } });
  } catch {
    await route.abort().catch(() => undefined);
  }
});

const page = await context.newPage();
if (process.env.CAPTURE_DEBUG) page.on("console", m => console.log("[page]", m.text().slice(0, 300)));
if (process.env.CAPTURE_DEBUG) page.on("requestfailed", r => console.log("[failed]", r.url().slice(0, 120), r.failure()?.errorText));
await page.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = '[aria-label="Open demo state switcher"]{opacity:0!important} #error-toast{display:none!important} *:focus{outline:none!important}';
    document.head.appendChild(style);
  });
});

const shot = async name => {
  await page.locator(":focus").evaluateAll(els => els.forEach(el => el.blur()));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, name + ".jpg"), type: "jpeg", quality: 85 });
  console.log("captured", name);
};
const seen = text =>
  page.getByText(text).first().waitFor({ timeout: 60000 }).catch(async error => {
    await page.screenshot({ path: join(WORK, "failed.png") });
    throw error;
  });
const tapTopmost = async locator => {
  for (const option of await locator.all()) {
    const box = await option.boundingBox();
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (!(await option.evaluate((el, [px, py]) => el.contains(document.elementFromPoint(px, py)), [x, y]))) continue;
    await page.mouse.click(x, y);
    return;
  }
  throw new Error("Nothing tappable for " + locator);
};
const demo = async (hint, text) => {
  await page.getByLabel("Open demo state switcher").click();
  await page.waitForTimeout(800);
  await tapTopmost(page.getByText(hint, { exact: true }));
  await seen(text);
  await page.waitForTimeout(800);
};

await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 180000 });
await seen("Pick your crew.");
await page.getByLabel("Your name", { exact: true }).fill(NAME);
await page.getByLabel("Group name", { exact: true }).fill(GROUP);
await page.getByText("Next: your windows").click();
await seen("When are you free?");
await page.getByText("Start playing").click();

await seen("This week's pot");
await demo("Window open, armed", "Could be any minute.");
await shot("waiting");
await page.mouse.move(195, 600);
await page.mouse.wheel(0, 1200);
await shot("waiting-pot");

await demo("60s countdown", "Shoes on.");
await shot("ping");

await page.getByText("Sidequest live").first().waitFor({ timeout: 120000 });
await page.waitForTimeout(3000);
await shot("quest-live");

const screenText = await page.evaluate(() => document.body.innerText);
const target = places.filter(p => screenText.includes(p.name)).sort((a, b) => b.name.length - a.name.length)[0];
if (!target) throw new Error("Could not match the quest landmark to a discovery result");
console.log("landmark", target.name);
if (target.image) {
  const photo = join(WORK, "landmark.jpg");
  const res = await fetch(target.image.replace(/\/\d+px-/, "/960px-"), { headers: { "user-agent": "AnteShowcaseCapture/1.0" } });
  writeFileSync(photo, Buffer.from(await res.arrayBuffer()));
  ffmpeg("-i", photo, "-vf", "scale=720:960:force_original_aspect_ratio=increase,crop=720:960,hflip", "-frames:v", "1", "-pix_fmt", "yuv420p", FEED);
}

await context.setGeolocation({ latitude: target.lat, longitude: target.lng, accuracy: 8 });
await seen("Selfie time.");
await page.waitForTimeout(4000);
await shot("arrived");
await page.getByLabel("Take selfie").click();
await seen("Sidequest complete");
await page.waitForTimeout(2500);
await shot("verified");
await context.setGeolocation({ latitude: LAT, longitude: LNG, accuracy: 8 });

await page.getByText("Back to waiting").or(page.getByText("Done")).first().click().catch(() => undefined);
await demo("Window open, armed", "Could be any minute.");
await page.getByLabel("Group feed").first().click();
await page.waitForTimeout(1500);
await shot("feed");
await page.goBack();
await seen("Your passport");
await page.getByText("Your passport").first().click();
await page.waitForTimeout(1500);
await shot("passport");

await browser.close();
