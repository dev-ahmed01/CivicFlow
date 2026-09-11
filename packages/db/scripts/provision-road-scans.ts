import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { provisionRoadScans } from "../src/provision-road-scans";

const prisma = new PrismaClient();

async function main() {
  console.log("Provisioning demo road-scan cameras...");
  const result = await provisionRoadScans(prisma);
  console.log("Successfully provisioned demo road-scan coverage:");
  console.log(`- Cameras provisioned: ${result.camerasProvisioned}`);
  console.log(`- Ward: ${result.wardName} (${result.wardId})`);
  console.log(`- Agency: ${result.agencyName} (${result.agencyId})`);
}

main()
  .catch((error: unknown) => {
    console.error("Provisioning failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
