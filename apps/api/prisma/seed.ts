import "../src/loadAppEnv.js";
import { runSeedWithCleanup } from "../src/seed/runSeed.js";

runSeedWithCleanup().catch((err) => {
  console.error(err);
  process.exit(1);
});
