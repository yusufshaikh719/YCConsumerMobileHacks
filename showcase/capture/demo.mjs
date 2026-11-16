import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const APP=process.env.APP_URL??"http://localhost:8081", OUT=process.env.OUT;
mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH});
const ctx=await b.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,permissions:["geolocation"],geolocation:{latitude:37.76071,longitude:-122.38602,accuracy:5}});
const page=await ctx.newPage();
await page.addInitScript(()=>document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent='[aria-label="Open demo state switcher"]{opacity:0!important} #error-toast{display:none!important}';document.head.appendChild(s)}));
const shot=async n=>{await page.waitForTimeout(n==="verifying"?300:2500);await page.evaluate(()=>{for(const e of document.querySelectorAll("div")){if(e.children.length<4&&(e.textContent.startsWith("Offline mode: not synced")||e.textContent.startsWith("OFFLINE MODE"))&&e.textContent.length<300)e.style.display="none"}});await page.screenshot({path:OUT+"/"+n+".png"});console.log(n)};
await page.goto(APP,{waitUntil:"networkidle",timeout:180000});
await page.getByText("Pick your crew.").waitFor({timeout:60000});
await shot("onboarding");
await page.getByLabel("Your name",{exact:true}).fill("Aahil");
await page.getByLabel("Group name",{exact:true}).fill("Hackathon crew");
await page.getByText("Next: fund the pot").click();await shot("onboarding-pot");await page.getByText("Next: your windows").click();
await page.waitForTimeout(1500);await shot("onboarding-windows");
await page.getByText("Start playing").click();
await page.getByText("This week's pot").waitFor({timeout:60000});
const tap=async hint=>{await page.getByLabel("Open demo state switcher").click();await page.waitForTimeout(800);for(const o of await page.getByText(hint,{exact:true}).all()){const bx=await o.boundingBox();if(!bx)continue;const x=bx.x+bx.width/2,y=bx.y+bx.height/2;if(!(await o.evaluate((el,[a,c])=>el.contains(document.elementFromPoint(a,c)),[x,y])))continue;await page.mouse.click(x,y);return}throw new Error(hint)};
await tap("Window open, armed");if(!process.env.ONLY_FEED){await shot("waiting");await page.mouse.move(195,600);await page.mouse.wheel(0,1200);await shot("waiting-pot");}
if(!process.env.ONLY_FEED)for(const [n,h] of [["ping","60s countdown"],["quest-live","Compass + timer"],["arrived","Selfie at YC HQ entrance"],["verifying","Stamp pending"],["verified","Postcard + stamp"],["failed-timeup","Window closed"],["not-verified","Retake allowed"]]){await tap(h);await shot(n);}
await tap("Window open, armed");await page.waitForTimeout(1500);
await page.getByLabel("Group feed").first().click();await shot("feed");
await page.mouse.wheel(0,900);await shot("feed-scrolled");
await page.goBack();await page.getByText("Your passport").first().click();await shot("passport");
await b.close();