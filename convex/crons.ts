import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete unverified users",
  { hourUTC: 9, minuteUTC: 0 },
  internal.users.deleteUnverifiedUsers,
  {},
);

export default crons;
