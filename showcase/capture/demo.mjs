import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const APP=process.env.APP_URL??"http://localhost:8081", OUT=process.env.OUT;
mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH});
const ctx=await b.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,permissions:["geolocation"],geolocation:{latitude:37.76071,longitude:-122.38602,accuracy:5}});
const page=await ctx.newPage();
await page.addInitScript(()=>document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent='[aria-label="Open demo state switcher"]{opacity:0!important} #error-toast{display:none!important}';document.head.appendChild(s)}));
const shot=async n=>{await page.waitForTimeout(2500);await page.screenshot({path:OUT+"/"+n+".png"});console.log(n)};
await page.goto(APP,{waitUntil:"networkidle",timeout:180000});
await page.getByText("Pick your crew.").waitFor({timeout:60000});
await shot("onboarding");
await page.getByLabel("Your name",{exact:true}).fill("Aahil");
await page.getByLabel("Group name",{exact:true}).fill("Hackathon crew");
await page.getByText("Next: your windows").click();
await page.waitForTimeout(1500);await shot("onboarding-windows");
await page.getByText("Start playing").click();
await page.getByText("This week's pot").waitFor({timeout:60000});
for(const [n,s] of [["waiting","waiting-open"],["quest-live","live"],["arrived","arrived"],["verifying","verifying"],["verified","verified"],["failed-timeup","failed"],["not-verified","not-verified"],["ping","ping"]]){
 await page.goto(APP+"?state="+s,{waitUntil:"networkidle"});await shot(n);
 if(n==="waiting"){await page.mouse.move(195,600);await page.mouse.wheel(0,1200);await shot("waiting-pot");}
}
await page.goto(APP+"?state=waiting-open",{waitUntil:"networkidle"});await page.waitForTimeout(1500);
await page.getByLabel("Group feed").first().click();await shot("feed");
await page.mouse.wheel(0,900);await shot("feed-scrolled");
await page.goBack();await page.getByText("Your passport").first().click();await shot("passport");
await b.close();