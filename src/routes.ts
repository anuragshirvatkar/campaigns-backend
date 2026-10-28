import { Router } from "express";
import { prisma } from "./lib/prisma.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";
import { assistantRouter } from "./modules/assistant/assistant.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { campaignsRouter, myCampaignsRouter } from "./modules/campaigns/campaigns.routes.js";
import { campaignCommentsRouter, commentsRouter } from "./modules/comments/comments.routes.js";
import { contributionsRouter, myContributionsRouter } from "./modules/contributions/contributions.routes.js";
import { demoDocsRouter } from "./modules/demo-docs/demo-docs.routes.js";
import { feedbackRouter } from "./modules/feedback/feedback.routes.js";
import { followsRouter, myFollowsRouter } from "./modules/follows/follows.routes.js";
import { analyticsRouter, reportRouter } from "./modules/metrics/metrics.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { platformRouter } from "./modules/platform/platform.routes.js";
import { updatesRouter } from "./modules/updates/updates.routes.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", database: "connected" });
});

apiRouter.use("/config", platformRouter);
apiRouter.use("/auth", authRouter);

// Public campaign pages, plus actions nested under a campaign
apiRouter.use("/campaigns", campaignsRouter);
apiRouter.use("/campaigns", reportRouter);
apiRouter.use("/campaigns", updatesRouter);
apiRouter.use("/campaigns", campaignCommentsRouter);
apiRouter.use("/campaigns", followsRouter);
apiRouter.use("/campaigns", feedbackRouter);

apiRouter.use("/contributions", contributionsRouter);
apiRouter.use("/comments", commentsRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/ai", aiRouter);
// Sam, the voice assistant
apiRouter.use("/assistant", assistantRouter);
// Web pages the demo campaigns link to as sources and calls to action
apiRouter.use("/demo-docs", demoDocsRouter);

// The logged-in user's own things
apiRouter.use("/me/campaigns", myCampaignsRouter);
apiRouter.use("/me/campaigns", analyticsRouter);
apiRouter.use("/me/notifications", notificationsRouter);
apiRouter.use("/me", myContributionsRouter);
apiRouter.use("/me", myFollowsRouter);
apiRouter.use("/me", usersRouter);

// The platform admin: campaign review and analytics
apiRouter.use("/admin", adminRouter);
