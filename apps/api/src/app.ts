import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { UserRole } from "db";
import { createAuthRouter } from "./auth/routes";
import {
  requireAuth,
  requirePasswordResetComplete,
  requireRole,
} from "./auth/middleware";
import { createOtpProvider, type OtpProvider } from "./auth/otp-provider";
import { getEnv } from "./config/env";
import { createImageRelevanceService, type ImageRelevanceService } from "./images/relevance";
import { S3CompatibleStorage, type ImageStorage } from "./images/storage";
import { createTicketsRouter } from "./tickets/router";
import { createValidationJobsRouter, createValidationsRouter } from "./validations/router";
import { createAgencyRouter } from "./agency/router";
import { createProjectsRouter } from "./projects/router";
import { createAdminRouter } from "./admin/router";
import { createDependenciesRouter, createDependencyJobsRouter } from "./dependencies/router";
import { createRoadIntelligenceRouter } from "./road-intelligence/router";
import { createNotificationsRouter } from "./notifications/router";
import { createAnalyticsRouter } from "./analytics/router";

export interface AppDependencies {
  otpProvider?: OtpProvider;
  imageRelevance?: ImageRelevanceService;
  imageStorage?: ImageStorage;
}

export function createApp(dependencies: AppDependencies | OtpProvider = {}): Express {
  const resolvedDependencies: AppDependencies = "sendOtp" in dependencies ? { otpProvider: dependencies } : dependencies;
  const env = getEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  const allowedOrigins = env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || !allowedOrigins || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS"));
    },
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  // Part III §19.2 — mount the analytics router before any root router whose
  // middleware authenticates all paths. Protected analytics routes enforce
  // their own role checks inside createAnalyticsRouter.
  app.use(createAnalyticsRouter());
  app.use("/auth", createAuthRouter(resolvedDependencies.otpProvider ?? createOtpProvider(env)));
  app.use(createValidationJobsRouter(env.CRON_SECRET));
  app.use(createDependencyJobsRouter(env.CRON_SECRET));
  const imageStorage = resolvedDependencies.imageStorage ?? new S3CompatibleStorage(env);
  app.use(createTicketsRouter(
    resolvedDependencies.imageRelevance ?? createImageRelevanceService(env),
    imageStorage,
  ));
  app.use(createValidationsRouter());
  app.use(createAgencyRouter(imageStorage));
  app.use(createProjectsRouter(imageStorage));
  app.use(createDependenciesRouter());
  app.use(createRoadIntelligenceRouter());
  app.use(createNotificationsRouter());
  app.use("/admin", createAdminRouter());

  // Part III §17.2 — protected routes always authenticate, enforce role, then scope.
  app.get(
    "/protected/project-head",
    requireAuth,
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    (request, response) => {
      response.json({
        message: "Project Head access granted",
        userId: request.auth?.userId,
        agencyId: request.auth?.agencyId,
      });
    },
  );

  app.get(
    "/protected/me",
    requireAuth,
    requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    (request, response) => {
      response.json({ auth: request.auth });
    },
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;
    console.error(error);
    response.status(500).json({ error: "Unexpected server error" });
  });

  return app;
}
