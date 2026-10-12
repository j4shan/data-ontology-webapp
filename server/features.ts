import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { FeatureHandler } from './gateway.ts';
export async function loadFeatures(root: string): Promise<{ handlers: FeatureHandler[]; delivered: string[] }> {
  const handlers: FeatureHandler[] = []; const delivered: string[] = [];
  for (const feature of ['explorer', 'workbench']) {
    try { await access(resolve(root, `web/src/${feature}/Entry.tsx`)); delivered.push(feature); } catch { /* A stage without its entry is not delivered. */ }
  }
  const file = resolve(root, 'server/agent/routes.ts');
  let exists = false;
  try { await access(file); exists = true; } catch { /* The agent stage installs this optional route module. */ }
  if (exists) {
    const module = await import(pathToFileURL(file).href);
    if (typeof module.createHandlers !== 'function') throw new Error('Agent routes must export createHandlers');
    handlers.push(...await module.createHandlers());
  }
  return { handlers, delivered };
}
