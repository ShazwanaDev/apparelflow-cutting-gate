/** Loads .env.local, then .env, the same files Next.js reads, for the CLI scripts. */
export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A missing file is fine; the variables may come from the shell instead.
    }
  }
}
