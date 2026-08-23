import "dotenv/config";
import { createApp } from "./app";
import { getEnv } from "./config/env";
import { startValidationRebatchScheduler } from "./validations/service";
import { startDependencyEscalationScheduler } from "./dependencies/service";

const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`CivicOS API listening on http://localhost:${env.PORT}`);
});

startValidationRebatchScheduler(env.VALIDATION_REBATCH_POLL_MINUTES);
startDependencyEscalationScheduler(env.DEPENDENCY_ESCALATION_POLL_MINUTES);
