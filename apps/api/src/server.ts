import "dotenv/config";
import { createApp } from "./app";
import { getEnv } from "./config/env";
import { startValidationRebatchScheduler } from "./validations/service";
import { startDependencyEscalationScheduler } from "./dependencies/service";
import { ExpoPushGateway, startPushDeliveryScheduler } from "./notifications/service";

const env = getEnv();
const app = createApp();

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`CivicOS API listening on port ${env.PORT}`);
});

startValidationRebatchScheduler(env.VALIDATION_REBATCH_POLL_MINUTES);
startDependencyEscalationScheduler(env.DEPENDENCY_ESCALATION_POLL_MINUTES);
startPushDeliveryScheduler(new ExpoPushGateway(env.EXPO_ACCESS_TOKEN), env.PUSH_DELIVERY_POLL_SECONDS);
