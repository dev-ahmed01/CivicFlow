import { resolve } from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app";
import { getEnv } from "./config/env";
import { startValidationRebatchScheduler } from "./validations/service";
import { startDependencyEscalationScheduler } from "./dependencies/service";
import { ExpoPushGateway, startPushDeliveryScheduler } from "./notifications/service";

// Turbo starts this package with apps/api as cwd, while the documented local
// setup keeps one shared .env at the repository root. Package-local values win.
dotenv.config();
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const env = getEnv();
const app = createApp();

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`CivicOS API listening on port ${env.PORT}`);
});

startValidationRebatchScheduler(env.VALIDATION_REBATCH_POLL_MINUTES);
startDependencyEscalationScheduler(env.DEPENDENCY_ESCALATION_POLL_MINUTES);
startPushDeliveryScheduler(new ExpoPushGateway(env.EXPO_ACCESS_TOKEN), env.PUSH_DELIVERY_POLL_SECONDS);
