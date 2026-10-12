import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createGateway } from '../server/gateway.ts';
import { GraphClient } from '../server/graph-client.ts';
import { once } from 'node:events';
import {
  ids,
  datasets,
  relationships,
  datasetDetail,
  search,
  snapshot,
  subgraph,
} from './fixtures/explorer-catalog.ts';
const enabled = process.env.DOG_BROWSER_TESTS === '1';
test(
  'Explorer desktop and portrait: search selection, edge/neighbor recenter, partial views, history and stale query protection',
  { skip: !enabled },
  async (t) => {
    const graph = new GraphClient({
      socketPath: '/tmp/absent-browser-fixture.sock',
      timeoutMs: 200,
    });
    const server = createGateway({
      graph,
      staticDir: new URL('../dist', import.meta.url).pathname,
      delivered: ['explorer'],
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.DOG_BROWSER_EXECUTABLE ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });
    t.after(async () => {
      await browser.close();
      graph.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: 'reduce',
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/health', (route) =>
      route.fulfill({
        json: {
          website: 'ready',
          graph: 'connected',
          generation: 'fixture-generation',
          snapshot,
          stages: [],
        },
      }),
    );
    await page.route('**/api/graph', async (route) => {
      const { method, params } = route.request().postDataJSON();
      let result: any;
      if (method === 'graph.search') {
        if (params.query === 'slow') await new Promise((resolve) => setTimeout(resolve, 700));
        result = search(params.query);
      } else if (method === 'graph.get_dataset') result = datasetDetail(params.node_id);
      else if (method === 'graph.expand_subgraph')
        result = subgraph(params.seed_node_ids, params.max_depth);
      else if (method === 'graph.get_relationship')
        result = {
          ...relationships.find((edge) => edge.edge_id === params.edge_id),
          entity_definitions: [],
          datasets,
        };
      else if (method === 'graph.get_identity')
        result = {
          name: 'Customer',
          description: 'Logical customer',
          entity_definitions: [{ node_id: ids.account }, { node_id: ids.customer }],
          datasets,
          truncated: false,
        };
      await route.fulfill({
        json: { jsonrpc: '2.0', id: 'fixture', generation: 'fixture-generation', result },
      });
    });
    await page.goto(url);
    await page.getByLabel('Entity, dataset or column').fill('account');
    await page.getByRole('button', { name: 'Select dataset Account', exact: true }).click();
    await expect(page.getByTestId('focus-title')).toHaveText('Account');
    await expect(page.locator('[data-node-id]')).toHaveCount(3);
    assert.equal(
      await page.locator(`[data-node-id="${ids.account}"]`).getAttribute('opacity'),
      '1',
    );
    assert.ok(
      Number(await page.locator(`[data-node-id="${ids.customer}"]`).getAttribute('opacity')) < 1,
    );
    await expect(page.locator('[data-edge-id]')).toHaveCount(4);
    await page.locator('[data-edge-id="fixture:explorer.customer-primary"]').click();
    await expect(page.getByTestId('focus-title')).toHaveText('fixture:customer');
    await expect(page.getByRole('complementary', { name: 'Focus inspector' })).toContainText(
      'optional',
    );
    await page.locator(`[data-node-id="${ids.customer}"]`).click();
    await expect(page.getByTestId('focus-title')).toHaveText('Customer');
    await expect(page.getByLabel('Entity, dataset or column')).toHaveValue('account');
    await expect(
      page.getByRole('button', { name: 'Select dataset Account', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Previous focus', exact: true }).click();
    await expect(page.getByTestId('focus-title')).toHaveText('fixture:customer');
    await page.getByLabel('BFS depth', { exact: true }).selectOption('3');
    await expect(page.getByText('Partial neighborhood:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByRole('button', { name: 'Recenter on dataset Customer', exact: true }).click();
    await expect(page.getByTestId('focus-title')).toHaveText('Customer');
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByLabel('Entity, dataset or column').fill('slow');
    await page.waitForTimeout(350);
    await page.getByLabel('Entity, dataset or column').fill('account');
    await expect(
      page.getByRole('button', { name: 'Select dataset Account', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(750);
    assert.equal(
      await page.getByRole('button', { name: 'Select dataset Stale result', exact: true }).count(),
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Select dataset Account', exact: true }).click();
    await expect(page.getByTestId('focus-title')).toHaveText('Account');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByTestId('neighborhood-graph').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/private/tmp/dog-explorer-portrait.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: '/private/tmp/dog-explorer-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
  },
);

test(
  'Live McDonald’s catalog supports dataset, logical identity, column, definition and edge focus',
  { skip: process.env.DOG_LIVE_GRAPH_TESTS !== '1' },
  async (t) => {
    const graph = new GraphClient({
      socketPath: process.env.DOG_SOCKET ?? '/tmp/data-ontology-graph.sock',
    });
    const server = createGateway({
      graph,
      staticDir: new URL('../dist', import.meta.url).pathname,
      delivered: ['explorer'],
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.DOG_BROWSER_EXECUTABLE ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });
    t.after(async () => {
      await browser.close();
      graph.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: 'reduce',
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await expect(page.getByText('Graph service connected', { exact: true })).toBeVisible();
    await page.getByLabel('Search category').selectOption('dataset');
    await page.getByLabel('Entity, dataset or column').fill('check');
    await page.getByRole('button', { name: 'Select dataset Check', exact: true }).click();
    await expect(page.getByTestId('focus-title')).toHaveText('Check');
    await expect(page.locator('[data-node-id][data-distance="0"]')).toHaveCount(1);
    assert.ok((await page.locator('[data-node-id]').count()) > 1);
    await page.getByLabel('Search category').selectOption('identity');
    await expect(page.locator('.search-result').first()).toBeVisible();
    const identityName = await page.locator('.search-result').first().locator('strong').innerText();
    await page.locator('.search-result').first().click();
    await expect(page.getByTestId('focus-title')).toHaveText(identityName);
    await expect(page.locator('.inspector .kind-pill')).toHaveText('identity');
    assert.ok((await page.locator('[data-node-id][data-distance="0"]').count()) > 0);
    await page.getByLabel('Search category').selectOption('column');
    await expect(page.locator('.search-result').first()).toBeVisible();
    const column = await page.locator('.search-result').first().locator('strong').innerText();
    await page.locator('.search-result').first().click();
    await expect(page.locator('.inspector .kind-pill')).toHaveText('column');
    await expect(page.locator('.column.is-highlight strong')).toHaveText(column);
    await page.getByLabel('Search category').selectOption('entity_definition');
    await expect(page.locator('.search-result').first()).toBeVisible();
    await page.locator('.search-result').first().click();
    await expect(page.locator('.inspector .kind-pill')).toHaveText('entity definition');
    await expect(page.locator('.definition.is-highlight')).toBeVisible();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page
      .getByRole('button', { name: /^Recenter on relationship/ })
      .first()
      .click();
    await expect(page.locator('.inspector .kind-pill')).toHaveText('relationship');
    await expect(page.getByLabel('Entity, dataset or column')).toHaveValue('check');
    await page.getByLabel('Dataset limit').selectOption('25');
    await page.getByLabel('BFS depth', { exact: true }).selectOption('3');
    await expect(page.getByText('Partial neighborhood:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: '/private/tmp/dog-explorer-mcd.png', fullPage: true });
    await page.getByRole('tab', { name: '02 AKG workbench' }).click();
    await expect(page.getByText('Coming in Stage 3', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '01 Graph explorer' }).click();
    await expect(page.locator('.inspector .kind-pill')).toHaveText('relationship');
    assert.deepEqual(errors, []);
  },
);
