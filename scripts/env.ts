/**
 * Loads env files for the CLI scripts, in the same order of precedence Next.js
 * uses. Set ENV_FILE to load a specific file first, e.g. ENV_FILE=.env.production.local
 * to run migrations against the production database.
 */
export function loadEnv() {
  const files = [process.env.ENV_FILE, '.env.local', '.env'].filter((file): file is string => Boolean(file));
  for (const file of files) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A missing file is fine; the variables may come from the shell instead.
    }
  }
}
