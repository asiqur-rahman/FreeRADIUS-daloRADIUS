import "../dist/loadAppEnv.js";
import { runSeedWithCleanup } from "../dist/seed/runSeed.js";

runSeedWithCleanup().catch((err) => {
  console.error(err);
  process.exit(1);
});
