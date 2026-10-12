import { createWebsiteClient } from '../sdk/index.ts';
const [command, method, rawParams] = process.argv.slice(2);
if (!command || command === '--help') {
  console.log('Usage: npm run cli -- health | graph graph.METHOD [PARAMS_JSON]');
  console.log('Set DOG_WEBSITE_URL to override http://127.0.0.1:4310');
} else {
  try {
    const client = createWebsiteClient(process.env.DOG_WEBSITE_URL);
    if (command === 'health') console.log(JSON.stringify(await client.health(), null, 2));
    else if (command === 'graph' && method) {
      const params = rawParams ? JSON.parse(rawParams) : {};
      console.log(JSON.stringify(await client.graph(method as Parameters<typeof client.graph>[0], params), null, 2));
    } else throw new Error('Unknown command; use --help');
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
