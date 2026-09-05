import cytoscape, { Core, Position, StylesheetJson } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { Graph, Plan, Task } from './types';
import { GRID_STEP, NODE_WIDTH, NODE_HEIGHT, routeEdges, type EdgeRoute } from './routing';
cytoscape.use(dagre);

const theme = getComputedStyle(document.documentElement);
const color = (name: string) => theme.getPropertyValue(`--${name}`).trim();
const styles: StylesheetJson = [
  { selector: 'node', style: {
    width: NODE_WIDTH, height: NODE_HEIGHT, shape: 'round-rectangle', 'corner-radius': '2px',
    'background-color': color('base'), 'border-width': 1, 'border-color': color('surface2'),
    label: 'data(label)', color: color('subtext'), 'font-family': theme.getPropertyValue('--font-mono').trim(), 'font-size': 14,
    'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '144px', 'text-overflow-wrap': 'anywhere',
    'overlay-opacity': 0, 'line-height': 1.3
  } },
  { selector: 'node.completed', style: { 'border-color': color('green'), color: color('green') } },
  { selector: 'node.in_progress', style: { 'border-color': color('yellow'), color: color('yellow') } },
  { selector: 'node.ready', style: { 'border-color': color('blue'), color: color('blue') } },
  { selector: 'node:selected', style: { 'border-width': 3, 'border-color': color('mauve'), 'background-color': color('surface0') } },
  { selector: 'edge', style: { width: 1.75, 'curve-style': 'straight', 'line-color': color('overlay'), 'target-arrow-color': color('overlay'), 'target-arrow-shape': 'triangle', 'arrow-scale': 1.15, 'overlay-opacity': 0 } },
  { selector: 'edge.routed', style: { 'curve-style': 'segments', 'edge-distances': 'node-position', 'segment-weights': 'data(weights)', 'segment-distances': 'data(distances)' } },
  { selector: 'edge.implicit', style: { 'line-style': 'dashed' } },
  { selector: 'edge.related', style: { 'line-style': 'dashed', 'line-color': color('mauve'), 'target-arrow-color': color('mauve') } },
  { selector: 'edge.loop', style: { 'curve-style': 'bezier', 'control-point-step-size': 64, 'loop-direction': '-90deg', 'loop-sweep': '60deg' } }
];
interface Layout { signature: string; positions: Map<string, Position>; routes: Map<string, EdgeRoute>; pan?: Position; zoom?: number }
const taskKey = (id: string) => `task:${id}`;
export const isVisible = (task: Task, showAll: boolean) => showAll || task.status !== 'not_started' || task.readiness.ready;

export class TaskGraph {
  private cy: Core;
  private layouts = new Map<string, Layout>();
  private current: string | null = null;
  private onSelect: (id: string) => void;
  constructor(container: HTMLElement, onSelect: (id: string) => void) {
    this.onSelect = onSelect;
    this.cy = cytoscape({ container, style: styles, minZoom: 0.25, maxZoom: 2, wheelSensitivity: 0.25, boxSelectionEnabled: false, autoungrabify: true, selectionType: 'single' });
    this.cy.on('tap', 'node', event => this.onSelect(event.target.data('taskId')));
    new ResizeObserver(() => this.cy.resize()).observe(container);
  }
  update(plan: Plan, graph: Graph | undefined, selected: string | null, showAll: boolean, showImplicit: boolean) {
    if (this.current) {
      const previous = this.layouts.get(this.current);
      if (previous) { previous.pan = { ...this.cy.pan() }; previous.zoom = this.cy.zoom(); }
    }
    if (!graph) { this.cy.elements().remove(); this.current = null; return; }
    const members = new Set(graph.taskIds);
    const tasks = plan.tasks.filter(t => members.has(t.id)).sort((a, b) => a.id.localeCompare(b.id));
    const edges = plan.relations.filter(r => members.has(r.from) && members.has(r.to)).sort((a, b) => a.id.localeCompare(b.id));
    const signature = JSON.stringify([graph.taskIds.slice().sort(), edges.map(r => [r.id, r.from, r.to, r.type])]);
    let layout = this.layouts.get(graph.id);
    if (!layout || layout.signature !== signature) {
      // Layout always includes blocked nodes and implicit prerequisites. State and filtering cannot change it.
      const full = cytoscape({ headless: true, styleEnabled: true, style: styles, elements: [
        ...tasks.map(t => ({ data: { id: taskKey(t.id) } })),
        ...edges.filter(r => r.type === 'prerequisite').map(r => ({ data: { id: `rel:${r.id}`, source: taskKey(r.from), target: taskKey(r.to) } }))
      ] });
      full.layout({ name: 'dagre', rankDir: 'TB', align: 'UL', nodeSep: 80, rankSep: 80, fit: false } as cytoscape.LayoutOptions).run();
      const positions = new Map(full.nodes().map(n => [n.id().slice(5), {
        x: Math.round(n.position('x') / GRID_STEP) * GRID_STEP,
        y: Math.round(n.position('y') / GRID_STEP) * GRID_STEP
      }] as [string, Position]));
      layout = { signature, positions, routes: routeEdges(positions, edges), pan: layout?.pan, zoom: layout?.zoom };
      full.destroy(); this.layouts.set(graph.id, layout);
    }
    this.current = graph.id;
    const visible = tasks.filter(t => isVisible(t, showAll));
    const visibleIds = new Set(visible.map(t => t.id));
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(visible.map(t => ({
        data: { id: taskKey(t.id), taskId: t.id, label: `${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◐' : t.readiness.ready ? '○' : '·'}  ${t.title.length > 30 ? `${t.title.slice(0, 29)}…` : t.title}` },
        position: layout!.positions.get(t.id), classes: `${t.status} ${t.status === 'not_started' && t.readiness.ready ? 'ready' : ''}`
      })));
      this.cy.add(edges.filter(r => visibleIds.has(r.from) && visibleIds.has(r.to) && (!r.implicit || showImplicit)).map(r => ({
        data: { id: `rel:${r.id}`, source: taskKey(r.from), target: taskKey(r.to), ...layout!.routes.get(r.id) }, classes: `${r.type} ${r.implicit ? 'implicit' : ''} ${layout!.routes.get(r.id)!.straight ? '' : 'routed'} ${r.from === r.to ? 'loop' : ''}`
      })));
      if (selected) this.cy.getElementById(taskKey(selected)).select();
    });
    if (layout.pan && layout.zoom) { this.cy.zoom(layout.zoom); this.cy.pan(layout.pan); }
    else if (visible.length) this.fit();
  }
  select(id: string) { this.cy.elements().unselect(); this.cy.getElementById(taskKey(id)).select(); }
  focus(id: string) { this.select(id); const node = this.cy.getElementById(taskKey(id)); if (node.length) this.cy.center(node); }
  zoom(factor: number) { this.cy.zoom({ level: this.cy.zoom() * factor, renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 } }); }
  fit() {
    if (!this.cy.nodes().length) return;
    this.cy.resize();
    const compact = this.cy.width() < 500;
    this.cy.fit(undefined, compact ? 18 : 50);
    this.cy.zoom(Math.min(this.cy.zoom(), 1));
    this.cy.center();
  }
}
