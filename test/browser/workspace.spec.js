const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, writePlan, complete } = require('../helpers');
const { startServer } = require('../../src/server');
let root; let plan; let running;
test.beforeEach(async ({ page }) => {
  ({ root, plan } = fixture()); running = await startServer(root, { port: 0, pollInterval: 80 });
  await page.goto(running.url); await expect(page.locator('#connection')).toHaveText('已同步');
});
test.afterEach(async () => { await running?.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
const graphState = page => page.evaluate(() => {
  const cy = document.getElementById('graph')._cyreg.cy;
  return { nodes: cy.nodes().map(n => ({ id: n.data('taskId'), position: n.position() })), edges: cy.edges().map(e => e.id()), pan: cy.pan(), zoom: cy.zoom(), selected: cy.$(':selected').map(n => n.data('taskId')) };
});
async function clickNode(page, id) {
  const position = await page.evaluate(id => document.getElementById('graph')._cyreg.cy.getElementById(`task:${id}`).renderedPosition(), id);
  const box = await page.locator('#graph').boundingBox(); await page.mouse.click(box.x + position.x, box.y + position.y);
}
const graphGeometry = page => page.evaluate(() => {
  const cy = document.getElementById('graph')._cyreg.cy;
  return {
    nodes: cy.nodes().map(n => ({ id: n.id(), position: n.position(), width: n.width(), height: n.height() })),
    edges: cy.edges().map(e => ({
      id: e.id(), source: e.source().id(), target: e.target().id(), related: e.hasClass('related'),
      sourceArrow: e.style('source-arrow-shape'), targetArrow: e.style('target-arrow-shape'),
      points: [e.sourceEndpoint(), ...(e.segmentPoints() || []), e.targetEndpoint()]
    }))
  };
});
function expectGridAndArrows(geometry) {
  for (const node of geometry.nodes) {
    expect(node.position.x % 24).toBe(0); expect(node.position.y % 24).toBe(0);
    for (const other of geometry.nodes.filter(n => n.id !== node.id)) {
      expect(Math.abs(node.position.x - other.position.x) >= node.width || Math.abs(node.position.y - other.position.y) >= node.height).toBe(true);
    }
  }
  for (const edge of geometry.edges) {
    expect(edge.targetArrow).toBe('triangle');
    expect(edge.sourceArrow).toBe('none');
    for (const point of edge.points) expect(Number.isFinite(point.x) && Number.isFinite(point.y), `${edge.id} has finite endpoints`).toBe(true);
    if (edge.source === edge.target) continue;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      const dx = Math.abs(b.x - a.x); const dy = Math.abs(b.y - a.y);
      expect(Math.min(dx, dy, Math.abs(dx - dy)), `${edge.id} segment ${i} follows the eight directions`).toBeLessThan(0.01);
      // Sample the actual rendered segment, not just its stored routing points.
      const samples = Math.ceil(Math.max(dx, dy));
      for (const node of geometry.nodes.filter(n => n.id !== edge.source && n.id !== edge.target)) {
        for (let step = 0; step <= samples; step++) {
          const fraction = samples ? step / samples : 0;
          const x = a.x + (b.x - a.x) * fraction; const y = a.y + (b.y - a.y) * fraction;
          if (Math.abs(x - node.position.x) < node.width / 2 && Math.abs(y - node.position.y) < node.height / 2) {
            throw new Error(`${edge.id} crosses ${node.id}`);
          }
        }
      }
    }
  }
}
test('Mauve selection and eight-direction arrows remain stable when hidden content is revealed', async ({ page }) => {
  await clickNode(page, 'reading-view');
  expect(await page.evaluate(() => document.getElementById('graph')._cyreg.cy.$(':selected').style('border-color'))).toBe('rgb(203,166,247)');
  await expect(page.locator('.graph-link[aria-current="true"]')).toHaveCSS('color', 'rgb(203, 166, 247)');
  const before = await graphGeometry(page); expectGridAndArrows(before);
  await page.getByLabel('查看隐藏前置').check(); await page.getByLabel('查看隐藏项', { exact: true }).check();
  const after = await graphGeometry(page); expectGridAndArrows(after);
  for (const relation of plan.relations) {
    const edge = after.edges.find(e => e.id === `rel:${relation.id}`);
    expect(edge.source).toBe(`task:${relation.from}`); expect(edge.target).toBe(`task:${relation.to}`);
    if (relation.type === 'prerequisite') {
      expect(after.nodes.find(n => n.id === edge.source).position.y).toBeLessThan(after.nodes.find(n => n.id === edge.target).position.y);
    }
  }
  for (const edge of before.edges) expect(after.edges.find(e => e.id === edge.id)).toEqual(edge);
});
test('branching, merging, long prerequisites and reciprocal associations route around nodes', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  plan.tasks = Array.from({ length: 12 }, (_, i) => ({ ...plan.tasks[3], id: `t${i}`, title: `Task ${i}`, status: 'not_started', notes: [] }));
  plan.checks = []; plan.changes = [];
  plan.graphs = [{ id: 'delivery', title: 'Routing', notes: [], taskIds: plan.tasks.map(t => t.id) }];
  plan.relations = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 7], [5, 7], [6, 7], [7, 8], [7, 9], [8, 10], [9, 10], [10, 11], [0, 11]]
    .map(([from, to], i) => ({ id: `p${i}`, from: `t${from}`, to: `t${to}`, type: 'prerequisite', implicit: i === 15 }));
  plan.relations.push(...[[1, 6], [6, 1], [1, 4], [2, 2], [11, 0]].map(([from, to], i) => ({ id: `a${i}`, from: `t${from}`, to: `t${to}`, type: 'related' })));
  writePlan(root, plan); await expect(page.locator('#graph-title')).toHaveText('Routing');
  await page.getByLabel('查看隐藏项', { exact: true }).check(); await page.getByLabel('查看隐藏前置').check();
  await page.getByRole('button', { name: '适应图形', exact: true }).click();
  const before = await graphGeometry(page); expect(before.edges).toHaveLength(plan.relations.length); expectGridAndArrows(before);
  plan.tasks.reverse(); plan.relations.reverse(); plan.graphs[0].taskIds.reverse(); writePlan(root, plan);
  await page.reload(); await expect(page.locator('#connection')).toHaveText('已同步');
  await page.getByLabel('查看隐藏项', { exact: true }).check(); await page.getByLabel('查看隐藏前置').check();
  expect(await graphGeometry(page)).toEqual(before); expect(errors).toEqual([]);
  await page.getByRole('button', { name: '适应图形', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('routing.png'), fullPage: true });
});
test('filter toggles preserve positions and implicit edges never reveal tasks', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const before = await graphState(page); expect(before.nodes).toHaveLength(4); expect(before.edges).toHaveLength(3);
  await page.getByLabel('查看隐藏前置').check(); const implicit = await graphState(page);
  expect(implicit.nodes).toEqual(before.nodes); expect(implicit.edges).toHaveLength(4); expect(implicit.pan).toEqual(before.pan); expect(implicit.zoom).toEqual(before.zoom);
  await page.getByLabel('查看隐藏项', { exact: true }).check(); const all = await graphState(page); expect(all.nodes).toHaveLength(6);
  for (const node of before.nodes) expect(all.nodes.find(n => n.id === node.id).position).toEqual(node.position);
  await page.getByLabel('查看隐藏项', { exact: true }).uncheck(); expect((await graphState(page)).nodes).toEqual(before.nodes);
  expect(errors).toEqual([]);
});
test('canvas selection, Markdown updates, invalid recovery and completion keep selection and viewport', async ({ page }) => {
  await clickNode(page, 'reading-view'); await expect(page.locator('#detail-title')).toContainText('实现清单');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  const graph = await page.locator('#graph').boundingBox();
  await page.mouse.move(graph.x + 15, graph.y + 15); await page.mouse.down(); await page.mouse.move(graph.x + 55, graph.y + 45, { steps: 5 }); await page.mouse.up();
  const stable = await graphState(page);
  await page.getByRole('tab', { name: '笔记 1' }).click(); await expect(page.locator('.markdown')).toContainText('清单视图的实现笔记');
  const note = path.join(root, '.plan/notes/user/view.md'); fs.appendFileSync(note, '\n新的用户结论：重启后状态保持。\n');
  await expect(page.locator('.markdown')).toContainText('新的用户结论');
  expect((await graphState(page)).pan).toEqual(stable.pan); expect((await graphState(page)).zoom).toBe(stable.zoom);
  fs.writeFileSync(path.join(root, '.plan/plan.json'), '{broken'); await expect(page.getByRole('alert')).toContainText('保留上一次有效视图');
  await expect(page.locator('.markdown')).toContainText('新的用户结论');
  complete(plan, 'reading-view'); writePlan(root, plan); await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('#detail-title')).toContainText('已完成');
  await expect.poll(async () => (await graphState(page)).nodes.length).toBe(5);
  const after = await graphState(page); expect(after.pan).toEqual(stable.pan); expect(after.zoom).toBe(stable.zoom); expect(after.selected).toEqual(['reading-view']);
  for (const node of stable.nodes) expect(after.nodes.find(n => n.id === node.id).position).toEqual(node.position);
});
test('shared task status, full prerequisites, cross-graph jump and user-confirmation dissent', async ({ page }) => {
  await page.getByRole('button', { name: '数据与存储 3' }).click();
  await page.locator('#task-list').getByRole('button', { name: '决定本地数据的存储方式' }).click();
  await expect(page.locator('#detail-content')).toContainText('用户确认完成');
  await expect(page.locator('#detail-content')).toContainText('保留意见');
  await page.getByRole('tab', { name: '检查 2' }).click(); await expect(page.locator('.record')).toHaveCount(2);
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await page.locator('.dependency').filter({ hasText: '明确阅读清单' }).click();
  await expect(page.locator('#graph-title')).toHaveText('阅读清单'); await expect(page.locator('#detail-title')).toContainText('明确阅读清单');
  await page.locator('#task-list').getByRole('button', { name: '实现清单的阅读与归档视图' }).click();
  await expect(page.locator('#detail-content')).toContainText('隐式前置');
  await page.getByRole('button', { name: '本地历史' }).click(); await expect(page.locator('#history-content')).toContainText('Load example plan');
});
test('Markdown cannot execute HTML or load external images, and linked notes open locally', async ({ page }) => {
  const seen = []; page.on('request', request => seen.push(request.url()));
  fs.appendFileSync(path.join(root, '.plan/notes/agent/storage.md'), '\n<script>window.pwned=true</script>\n![external](https://example.invalid/image.png)\n[bad](javascript:alert(1))\n');
  await page.locator('#task-list').getByRole('button', { name: '决定本地数据的存储方式' }).click();
  await page.getByRole('tab', { name: '笔记 1' }).click(); await expect(page.locator('.markdown')).toContainText('window.pwned');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined(); expect(seen.filter(url => url.includes('example.invalid'))).toEqual([]);
  await page.getByRole('link', { name: '使用场景笔记' }).click(); await expect(page.locator('.markdown')).toContainText('我的使用场景');
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`readable graph and detail at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await page.getByRole('button', { name: '适应图形', exact: true }).click();
    const framing = await page.evaluate(() => {
      const cy = document.getElementById('graph')._cyreg.cy;
      return cy.nodes().map(n => { const box = n.renderedBoundingBox(); return box.x1 >= 0 && box.y1 >= 0 && box.x2 <= cy.width() && box.y2 <= cy.height(); });
    }); expect(framing.every(Boolean)).toBe(true);
    await clickNode(page, 'reading-view'); await expect(page.locator('#detail-title')).toContainText('实现清单');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('#graph canvas').first()).toBeVisible();
    const painted = await page.evaluate(() => [...document.querySelectorAll('#graph canvas')].some(canvas => {
      const context = canvas.getContext('2d'); if (!context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
      return count > 2000;
    })); expect(painted).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}.png`), fullPage: true });
    await page.getByRole('tab', { name: '笔记 1' }).click(); await expect(page.locator('.markdown')).toContainText('归档记录');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`notes-${viewport.width}.png`), fullPage: true });
  });
}
