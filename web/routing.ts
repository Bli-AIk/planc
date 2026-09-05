import PF from 'pathfinding';
import type { Position } from 'cytoscape';
import type { Relation } from './types';

export const GRID_STEP = 24;
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 80;
export interface EdgeRoute { weights: number[]; distances: number[]; straight: boolean }

export function routeEdges(positions: Map<string, Position>, relations: Relation[]): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>();
  if (!relations.length) return routes;
  const nodes = [...positions.values()];
  const margin = 6;
  const left = Math.min(...nodes.map(p => p.x / GRID_STEP)) - margin;
  const top = Math.min(...nodes.map(p => p.y / GRID_STEP)) - margin;
  const width = Math.max(...nodes.map(p => p.x / GRID_STEP)) - left + margin + 1;
  const height = Math.max(...nodes.map(p => p.y / GRID_STEP)) - top + margin + 1;
  const grid = new PF.Grid(width, height);
  const cell = (p: Position) => [p.x / GRID_STEP - left, p.y / GRID_STEP - top];

  // Reserve hidden nodes too, so revealing them never reroutes existing arrows.
  for (const position of nodes) {
    const [x, y] = cell(position);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 2; dy++) grid.setWalkableAt(x + dx, y + dy, false);
    }
  }
  const finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  for (const relation of relations) {
    // Self-associations have no endpoint axis; Cytoscape supplies their arrowed loop.
    if (relation.from === relation.to) {
      routes.set(relation.id, { straight: true, weights: [], distances: [] });
      continue;
    }
    const source = positions.get(relation.from)!;
    const target = positions.get(relation.to)!;
    const [sx, sy] = cell(source);
    const [tx, ty] = cell(target);
    // Prerequisites leave downward or diagonally; associations use separate side ports.
    const side = Math.sign(tx - sx) || 1;
    const diagonal = Math.abs(tx - sx) >= (ty - sy) * Math.tan(Math.PI / 8) ? side * 3 : 0;
    const start = relation.type === 'prerequisite' ? [sx + diagonal, sy + 3] : [sx + side * 5, sy];
    const end = relation.type === 'prerequisite' ? [tx - diagonal, ty - 3] : [tx + (tx === sx ? side : -side) * 5, ty];
    const path = finder.findPath(start[0], start[1], end[0], end[1], grid.clone());
    if (!path.length) throw new Error(`Cannot route relation ${relation.id}`);
    const points = PF.Util.compressPath([[sx, sy], ...path, [tx, ty]])
      .slice(1, -1).map(([x, y]) => ({ x: (x + left) * GRID_STEP, y: (y + top) * GRID_STEP }));
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const squaredLength = dx * dx + dy * dy;
    // Cytoscape segments use the projection along the endpoint axis and its normal.
    routes.set(relation.id, {
      straight: points.length === 0,
      weights: points.map(p => ((p.x - source.x) * dx + (p.y - source.y) * dy) / squaredLength),
      distances: points.map(p => (dx * (p.y - source.y) - dy * (p.x - source.x)) / Math.sqrt(squaredLength))
    });
  }
  return routes;
}
