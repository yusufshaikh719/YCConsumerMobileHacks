import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("daily pot deadlines", { minuteUTC: 0 }, internal.settlement.sweepExpiredDeadlines, {});
export default crons;
