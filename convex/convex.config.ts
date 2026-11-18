import agentmail from "@agentmail/convex/convex.config";
import agent from "@convex-dev/agent/convex.config";
import auth from "@convex-dev/auth/convex.config";
import authEmail from "@convex-dev/auth/components/email/convex.config";
import authPassword from "@convex-dev/auth/components/password/convex.config";
import resend from "@convex-dev/resend/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  // Account email settings, read through the typed `env` export of
  // `_generated/server`. All are optional so a deployment without Resend
  // still pushes; sign-up emails need RESEND_API_KEY and a verified sender.
  env: {
    RESEND_API_KEY: v.optional(v.string()),
    SENDER_EMAIL: v.optional(v.string()),
    SENDER_NAME: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    // Encrypts the AI provider keys users save in Settings: 32 random bytes
    // as base64. Without it, saving keys and every AI feature are refused.
    AI_KEY_ENCRYPTION_SECRET: v.optional(v.string()),
  },
});

app.use(agentmail);
app.use(agent);
app.use(workflow);
app.use(auth);
app.use(authPassword);
app.use(authEmail);
app.use(resend);

export default app;
