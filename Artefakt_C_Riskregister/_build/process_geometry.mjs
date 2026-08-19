const DEFAULT_DIMENSIONS = Object.freeze({
  process: Object.freeze({ w: 220, h: 76 }),
  decision: Object.freeze({ w: 250, h: 126 }),
  terminal: Object.freeze({ w: 200, h: 64 }),
});

const EPS = 0.001;

function createProcessGeometry(options = {}) {
  const dimensions = {
    process: { ...DEFAULT_DIMENSIONS.process, ...(options.process ?? {}) },
    decision: { ...DEFAULT_DIMENSIONS.decision, ...(options.decision ?? {}) },
    terminal: { ...DEFAULT_DIMENSIONS.terminal, ...(options.terminal ?? {}) },
  };
  const xScale = options.xScale ?? 1.20;
  const yScale = options.yScale ?? 1.40;
  const stubLength = options.stubLength ?? 24;
  const obstaclePadding = options.obstaclePadding ?? 12;

  function nodeGeometry(node) {
    if (node.type === 'decision') return dimensions.decision;
    if (node.type === 'start' || node.type === 'end') return dimensions.terminal;
    return dimensions.process;
  }

  function nodeCenter(node) {
    const { w, h } = nodeGeometry(node);
    return { x: node.x + w / 2, y: node.y + h / 2 };
  }

  function nodeBox(node, padding = 0) {
    const { w, h } = nodeGeometry(node);
    return {
      x0: node.x - padding,
      y0: node.y - padding,
      x1: node.x + w + padding,
      y1: node.y + h + padding,
    };
  }

  function layoutNodes(rawNodes) {
    if (!rawNodes.length) return [];
    const minX = Math.min(...rawNodes.map(node => node.x));
    const minY = Math.min(...rawNodes.map(node => node.y));
    return rawNodes.map(node => ({
      ...node,
      x: minX + (node.x - minX) * xScale,
      y: minY + (node.y - minY) * yScale,
    }));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function outwardVector(side) {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  function sideSpan(node, side) {
    const { w, h } = nodeGeometry(node);
    if (node.type === 'decision') return side === 'left' || side === 'right' ? h * 0.72 : w * 0.72;
    if (node.type === 'start' || node.type === 'end') return side === 'left' || side === 'right' ? h * 0.58 : w - h - 12;
    return side === 'left' || side === 'right' ? h - 24 : w - 24;
  }

  function portPoint(node, side, rawOffset = 0) {
    const { w, h } = nodeGeometry(node);
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;

    if (node.type === 'decision') {
      if (side === 'left' || side === 'right') {
        const offset = clamp(rawOffset, -h / 2 + 8, h / 2 - 8);
        const xReach = (w / 2) * (1 - Math.abs(offset) / (h / 2));
        return { x: cx + (side === 'left' ? -xReach : xReach), y: cy + offset };
      }
      const offset = clamp(rawOffset, -w / 2 + 12, w / 2 - 12);
      const yReach = (h / 2) * (1 - Math.abs(offset) / (w / 2));
      return { x: cx + offset, y: cy + (side === 'top' ? -yReach : yReach) };
    }

    if (node.type === 'start' || node.type === 'end') {
      const radius = h / 2;
      const straightHalf = w / 2 - radius;
      if (side === 'left' || side === 'right') {
        const offset = clamp(rawOffset, -radius + 5, radius - 5);
        const arcReach = Math.sqrt(Math.max(0, radius ** 2 - offset ** 2));
        const xReach = straightHalf + arcReach;
        return { x: cx + (side === 'left' ? -xReach : xReach), y: cy + offset };
      }
      const offset = clamp(rawOffset, -w / 2 + 8, w / 2 - 8);
      const beyondStraight = Math.max(0, Math.abs(offset) - straightHalf);
      const yReach = Math.sqrt(Math.max(0, radius ** 2 - beyondStraight ** 2));
      return { x: cx + offset, y: cy + (side === 'top' ? -yReach : yReach) };
    }

    const cornerInset = 13;
    if (side === 'left' || side === 'right') {
      const offset = clamp(rawOffset, -h / 2 + cornerInset, h / 2 - cornerInset);
      return { x: side === 'left' ? node.x : node.x + w, y: cy + offset };
    }
    const offset = clamp(rawOffset, -w / 2 + cornerInset, w / 2 - cornerInset);
    return { x: cx + offset, y: side === 'top' ? node.y : node.y + h };
  }

  function defaultSides(source, target) {
    const a = nodeCenter(source);
    const b = nodeCenter(target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy) * 0.78) {
      return dx >= 0
        ? { sourceSide: 'right', targetSide: 'left' }
        : { sourceSide: 'left', targetSide: 'right' };
    }
    return dy >= 0
      ? { sourceSide: 'bottom', targetSide: 'top' }
      : { sourceSide: 'top', targetSide: 'bottom' };
  }

  function assignPorts(nodes, edges) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const specs = edges.map((edge, index) => {
      const source = nodeById.get(edge.s);
      const target = nodeById.get(edge.t);
      if (!source || !target) return null;
      return { edge, index, source, target, ...defaultSides(source, target), sourceOffset: 0, targetOffset: 0 };
    }).filter(Boolean);
    const groups = new Map();

    function addAttachment(spec, role, node, side, other) {
      const key = `${node.id}|${side}`;
      if (!groups.has(key)) groups.set(key, []);
      const otherCenter = nodeCenter(other);
      groups.get(key).push({ spec, role, node, side, otherCenter });
    }

    for (const spec of specs) {
      addAttachment(spec, 'source', spec.source, spec.sourceSide, spec.target);
      addAttachment(spec, 'target', spec.target, spec.targetSide, spec.source);
    }

    for (const attachments of groups.values()) {
      attachments.sort((a, b) => {
        const axisA = a.side === 'left' || a.side === 'right' ? a.otherCenter.y : a.otherCenter.x;
        const axisB = b.side === 'left' || b.side === 'right' ? b.otherCenter.y : b.otherCenter.x;
        return axisA - axisB || a.role.localeCompare(b.role) || a.spec.edge.id.localeCompare(b.spec.edge.id);
      });
      const span = sideSpan(attachments[0].node, attachments[0].side);
      const step = attachments.length > 1 ? Math.min(14, span / Math.max(attachments.length - 1, 1)) : 0;
      attachments.forEach((attachment, index) => {
        const offset = (index - (attachments.length - 1) / 2) * step;
        if (attachment.role === 'source') attachment.spec.sourceOffset = offset;
        else attachment.spec.targetOffset = offset;
      });
    }
    return specs;
  }

  function samePoint(a, b) {
    return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
  }

  function compactPoints(points) {
    const clean = [];
    for (const point of points) {
      const p = { x: Number(point.x), y: Number(point.y) };
      if (!clean.length || !samePoint(clean.at(-1), p)) clean.push(p);
    }
    let changed = true;
    while (changed && clean.length > 2) {
      changed = false;
      for (let index = 1; index < clean.length - 1; index++) {
        const a = clean[index - 1], b = clean[index], c = clean[index + 1];
        if ((Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS)
          || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS)) {
          clean.splice(index, 1);
          changed = true;
          break;
        }
      }
    }
    return clean;
  }

  function segmentLength(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function routeLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index++) total += segmentLength(points[index - 1], points[index]);
    return total;
  }

  function isHorizontal(a, b) {
    return Math.abs(a.y - b.y) < EPS;
  }

  function segmentIntersectsBox(a, b, box) {
    if (isHorizontal(a, b)) {
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      return a.y > box.y0 + EPS && a.y < box.y1 - EPS && hi > box.x0 + EPS && lo < box.x1 - EPS;
    }
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    return a.x > box.x0 + EPS && a.x < box.x1 - EPS && hi > box.y0 + EPS && lo < box.y1 - EPS;
  }

  function pointIsEndpoint(point, points) {
    return samePoint(point, points[0]) || samePoint(point, points.at(-1));
  }

  function segmentRelation(a, b, c, d) {
    const abHorizontal = isHorizontal(a, b);
    const cdHorizontal = isHorizontal(c, d);
    if (abHorizontal && cdHorizontal) {
      if (Math.abs(a.y - c.y) >= EPS) return null;
      const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
      const hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
      return hi - lo > EPS ? { type: 'overlap', amount: hi - lo } : null;
    }
    if (!abHorizontal && !cdHorizontal) {
      if (Math.abs(a.x - c.x) >= EPS) return null;
      const lo = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
      const hi = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
      return hi - lo > EPS ? { type: 'overlap', amount: hi - lo } : null;
    }
    const h1 = abHorizontal ? a : c;
    const h2 = abHorizontal ? b : d;
    const v1 = abHorizontal ? c : a;
    const v2 = abHorizontal ? d : b;
    const x = v1.x, y = h1.y;
    if (x >= Math.min(h1.x, h2.x) - EPS && x <= Math.max(h1.x, h2.x) + EPS
      && y >= Math.min(v1.y, v2.y) - EPS && y <= Math.max(v1.y, v2.y) + EPS) {
      return { type: 'cross', point: { x, y } };
    }
    return null;
  }

  function rawNodeBounds(nodes, padding = 0) {
    const boxes = nodes.map(node => nodeBox(node, padding));
    return {
      x0: Math.min(...boxes.map(box => box.x0)),
      y0: Math.min(...boxes.map(box => box.y0)),
      x1: Math.max(...boxes.map(box => box.x1)),
      y1: Math.max(...boxes.map(box => box.y1)),
    };
  }

  function attachmentPoints(node, side, offset) {
    const port = portPoint(node, side, offset);
    const vector = outwardVector(side);
    const padded = nodeBox(node, obstaclePadding + 2);
    let clearance = stubLength;
    if (side === 'left') clearance = Math.max(clearance, port.x - padded.x0);
    else if (side === 'right') clearance = Math.max(clearance, padded.x1 - port.x);
    else if (side === 'top') clearance = Math.max(clearance, port.y - padded.y0);
    else clearance = Math.max(clearance, padded.y1 - port.y);
    return {
      port,
      stub: {
        x: port.x + vector.x * clearance,
        y: port.y + vector.y * clearance,
      },
    };
  }

  function buildCandidates(spec, nodeBounds) {
    const sourceAttachment = attachmentPoints(spec.source, spec.sourceSide, spec.sourceOffset);
    const targetAttachment = attachmentPoints(spec.target, spec.targetSide, spec.targetOffset);
    const sourcePort = sourceAttachment.port;
    const targetPort = targetAttachment.port;
    const sourceStub = sourceAttachment.stub;
    const targetStub = targetAttachment.stub;
    const midX = (sourceStub.x + targetStub.x) / 2;
    const midY = (sourceStub.y + targetStub.y) / 2;
    const quarterX = sourceStub.x + (targetStub.x - sourceStub.x) * 0.28;
    const threeQuarterX = sourceStub.x + (targetStub.x - sourceStub.x) * 0.72;
    const quarterY = sourceStub.y + (targetStub.y - sourceStub.y) * 0.28;
    const threeQuarterY = sourceStub.y + (targetStub.y - sourceStub.y) * 0.72;
    const laneOffset = 64 + (spec.index % 5) * 18;
    const outerLeft = nodeBounds.x0 - laneOffset;
    const outerRight = nodeBounds.x1 + laneOffset;
    const outerTop = nodeBounds.y0 - laneOffset;
    const outerBottom = nodeBounds.y1 + laneOffset;
    const start = [sourcePort, sourceStub];
    const end = [targetStub, targetPort];
    const candidates = [
      [...start, { x: targetStub.x, y: sourceStub.y }, ...end],
      [...start, { x: sourceStub.x, y: targetStub.y }, ...end],
    ];
    for (const x of [midX, quarterX, threeQuarterX, outerLeft, outerRight]) {
      candidates.push([...start, { x, y: sourceStub.y }, { x, y: targetStub.y }, ...end]);
    }
    for (const y of [midY, quarterY, threeQuarterY, outerTop, outerBottom]) {
      candidates.push([...start, { x: sourceStub.x, y }, { x: targetStub.x, y }, ...end]);
    }
    return candidates.map(compactPoints).filter(points => points.length >= 2);
  }

  function sortedUnique(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const result = [];
    for (const value of sorted) {
      if (!result.length || Math.abs(value - result.at(-1)) >= EPS) result.push(value);
    }
    return result;
  }

  function pointInsideBox(point, box) {
    return point.x > box.x0 + EPS && point.x < box.x1 - EPS
      && point.y > box.y0 + EPS && point.y < box.y1 - EPS;
  }

  class MinHeap {
    constructor() {
      this.items = [];
    }

    push(value) {
      const items = this.items;
      items.push(value);
      let index = items.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (items[parent].priority <= value.priority) break;
        items[index] = items[parent];
        index = parent;
      }
      items[index] = value;
    }

    pop() {
      const items = this.items;
      if (!items.length) return null;
      const root = items[0];
      const tail = items.pop();
      if (items.length && tail) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= items.length) break;
          let child = left;
          if (right < items.length && items[right].priority < items[left].priority) child = right;
          if (items[child].priority >= tail.priority) break;
          items[index] = items[child];
          index = child;
        }
        items[index] = tail;
      }
      return root;
    }
  }

  function edgeInteractionCost(a, b, chosenRoutes) {
    let cost = 0;
    for (const route of chosenRoutes) {
      for (let index = 1; index < route.points.length; index++) {
        const c = route.points[index - 1], d = route.points[index];
        const relation = segmentRelation(a, b, c, d);
        if (!relation) continue;
        if (relation.type === 'overlap') {
          cost += 42_000 + relation.amount * 220;
        } else {
          const sharedLogicalEndpoint = pointIsEndpoint(relation.point, route.points)
            && (samePoint(relation.point, a) || samePoint(relation.point, b));
          if (!sharedLogicalEndpoint) cost += 26_000;
        }
      }
    }
    return cost;
  }

  function gridRoute(spec, nodes, nodeBounds, chosenRoutes, reservedRoutes = []) {
    const sourceAttachment = attachmentPoints(spec.source, spec.sourceSide, spec.sourceOffset);
    const targetAttachment = attachmentPoints(spec.target, spec.targetSide, spec.targetOffset);
    const start = sourceAttachment.stub;
    const goal = targetAttachment.stub;
    const sourceVector = outwardVector(spec.sourceSide);
    const targetVector = outwardVector(spec.targetSide);
    const obstacles = nodes.map(node => nodeBox(node, obstaclePadding));
    const occupiedRoutes = [...chosenRoutes, ...reservedRoutes];
    const edgeSeed = [...spec.edge.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    const outerOffset = 42 + (edgeSeed % 9) * 8;
    const laneNudge = 6 + (edgeSeed % 5) * 3;
    const xValues = [start.x, goal.x, nodeBounds.x0 - outerOffset, nodeBounds.x1 + outerOffset];
    const yValues = [start.y, goal.y, nodeBounds.y0 - outerOffset, nodeBounds.y1 + outerOffset];

    for (const box of obstacles) {
      xValues.push(box.x0, box.x1, box.x0 - laneNudge, box.x1 + laneNudge);
      yValues.push(box.y0, box.y1, box.y0 - laneNudge, box.y1 + laneNudge);
    }
    // Existing lanes become explicit alternatives. Offset copies let a
    // reciprocal or later edge run beside an occupied lane instead of on it.
    for (const route of chosenRoutes) {
      for (let index = 1; index < route.points.length; index++) {
        const a = route.points[index - 1], b = route.points[index];
        if (isHorizontal(a, b)) yValues.push(a.y - laneNudge, a.y + laneNudge);
        else xValues.push(a.x - laneNudge, a.x + laneNudge);
      }
    }
    const xs = sortedUnique(xValues);
    const ys = sortedUnique(yValues);
    const startX = xs.findIndex(value => Math.abs(value - start.x) < EPS);
    const startY = ys.findIndex(value => Math.abs(value - start.y) < EPS);
    const goalX = xs.findIndex(value => Math.abs(value - goal.x) < EPS);
    const goalY = ys.findIndex(value => Math.abs(value - goal.y) < EPS);
    if (startX < 0 || startY < 0 || goalX < 0 || goalY < 0) return null;

    const pointAt = (xIndex, yIndex) => ({ x: xs[xIndex], y: ys[yIndex] });
    const keyOf = (xIndex, yIndex, direction) => `${xIndex}|${yIndex}|${direction}`;
    const distances = new Map();
    const previous = new Map();
    const heap = new MinHeap();
    const startKey = keyOf(startX, startY, 'n');
    distances.set(startKey, 0);
    heap.push({ priority: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y), cost: 0, xIndex: startX, yIndex: startY, direction: 'n', key: startKey });
    let goalKey = null;
    const segmentCache = new Map();

    while (heap.items.length) {
      const current = heap.pop();
      if (!current || current.cost !== distances.get(current.key)) continue;
      if (current.xIndex === goalX && current.yIndex === goalY) {
        goalKey = current.key;
        break;
      }
      const currentPoint = pointAt(current.xIndex, current.yIndex);
      const neighbours = [
        [current.xIndex - 1, current.yIndex, 'h'],
        [current.xIndex + 1, current.yIndex, 'h'],
        [current.xIndex, current.yIndex - 1, 'v'],
        [current.xIndex, current.yIndex + 1, 'v'],
      ];
      for (const [nextX, nextY, nextDirection] of neighbours) {
        if (nextX < 0 || nextY < 0 || nextX >= xs.length || nextY >= ys.length) continue;
        const nextPoint = pointAt(nextX, nextY);
        if (current.key === startKey
          && (nextPoint.x - start.x) * sourceVector.x + (nextPoint.y - start.y) * sourceVector.y < -EPS) continue;
        if (nextX === goalX && nextY === goalY
          && (currentPoint.x - goal.x) * targetVector.x + (currentPoint.y - goal.y) * targetVector.y < -EPS) continue;
        const segmentId = currentPoint.x < nextPoint.x || currentPoint.y < nextPoint.y
          ? `${currentPoint.x},${currentPoint.y}:${nextPoint.x},${nextPoint.y}`
          : `${nextPoint.x},${nextPoint.y}:${currentPoint.x},${currentPoint.y}`;
        let segmentCost = segmentCache.get(segmentId);
        if (segmentCost === undefined) {
          const blocked = obstacles.some(box => pointInsideBox(currentPoint, box)
            || pointInsideBox(nextPoint, box)
            || segmentIntersectsBox(currentPoint, nextPoint, box));
          segmentCost = blocked ? Infinity
            : segmentLength(currentPoint, nextPoint) + edgeInteractionCost(currentPoint, nextPoint, occupiedRoutes);
          segmentCache.set(segmentId, segmentCost);
        }
        if (!Number.isFinite(segmentCost)) continue;
        const bendCost = current.direction !== 'n' && current.direction !== nextDirection ? 38 : 0;
        const nextCost = current.cost + segmentCost + bendCost;
        const nextKey = keyOf(nextX, nextY, nextDirection);
        if (nextCost + EPS >= (distances.get(nextKey) ?? Infinity)) continue;
        distances.set(nextKey, nextCost);
        previous.set(nextKey, current.key);
        const heuristic = Math.abs(nextPoint.x - goal.x) + Math.abs(nextPoint.y - goal.y);
        heap.push({ priority: nextCost + heuristic, cost: nextCost, xIndex: nextX, yIndex: nextY, direction: nextDirection, key: nextKey });
      }
    }
    if (!goalKey) return null;

    const reversed = [];
    for (let key = goalKey; key; key = previous.get(key)) {
      const [xIndex, yIndex] = key.split('|').map(Number);
      reversed.push(pointAt(xIndex, yIndex));
      if (key === startKey) break;
    }
    reversed.reverse();
    return compactPoints([sourceAttachment.port, ...reversed, targetAttachment.port]);
  }

  function scoreRoute(points, spec, nodes, chosenRoutes) {
    let score = routeLength(points) + Math.max(0, points.length - 2) * 34;
    const sourceId = spec.source.id;
    const targetId = spec.target.id;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      for (const node of nodes) {
        // The short port/stub corridor can legitimately run inside the padded
        // bounding box of a diamond or capsule even though it is outside the
        // actual shape. Source and target are therefore never obstacles for
        // their own route; candidate construction keeps the route attached to
        // them only at the first and last segment.
        if (node.id === sourceId || node.id === targetId) continue;
        if (segmentIntersectsBox(a, b, nodeBox(node, obstaclePadding))) score += 1_000_000_000;
      }
      for (const route of chosenRoutes) {
        for (let otherIndex = 1; otherIndex < route.points.length; otherIndex++) {
          const c = route.points[otherIndex - 1], d = route.points[otherIndex];
          const relation = segmentRelation(a, b, c, d);
          if (!relation) continue;
          if (relation.type === 'overlap') {
            score += 18_000 + relation.amount * 180;
          } else if (!(pointIsEndpoint(relation.point, points) && pointIsEndpoint(relation.point, route.points))) {
            score += 14_000;
          }
        }
      }
    }
    return score;
  }

  function wrapLabel(text, maxChars = 24) {
    const tokens = String(text).trim().split(/\s+/).flatMap(token => {
      if (token.length <= maxChars) return [token];
      const chunks = [];
      for (let index = 0; index < token.length; index += maxChars) chunks.push(token.slice(index, index + maxChars));
      return chunks;
    });
    const lines = [];
    let current = '';
    for (const token of tokens) {
      const candidate = current ? `${current} ${token}` : token;
      if (current && candidate.length > maxChars) {
        lines.push(current);
        current = token;
      } else current = candidate;
    }
    if (current) lines.push(current);
    if (lines.length <= 2) return lines;
    const second = `${lines[1]} ${lines.slice(2).join(' ')}`;
    return [lines[0], second.length > maxChars ? `${second.slice(0, maxChars - 1).trimEnd()}…` : second];
  }

  function boxesOverlap(a, b, padding = 0) {
    return a.x < b.x + b.w + padding && a.x + a.w + padding > b.x
      && a.y < b.y + b.h + padding && a.y + a.h + padding > b.y;
  }

  function placeEdgeLabels(routes, nodes) {
    const occupied = [];
    const nodeRects = nodes.map(node => {
      const box = nodeBox(node, 5);
      return { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
    });
    const bounds = rawNodeBounds(nodes, 8);
    const routeSegments = routes.flatMap(route => route.points.slice(1).map((point, index) => ({
      routeIndex: route.index,
      a: route.points[index],
      b: point,
    })));
    const labelled = routes.filter(route => route.edge.label).sort((a, b) => b.edge.label.length - a.edge.label.length || a.index - b.index);
    for (const route of labelled) {
      const lines = wrapLabel(route.edge.label);
      const width = Math.max(...lines.map(line => line.length), 1) * 6.2 + 16;
      const height = lines.length * 13 + 8;
      const candidates = [];

      function addCandidate(cx, cy, baseScore, horizontal, segmentIndex) {
        candidates.push({
          x: cx - width / 2,
          y: cy - height / 2,
          w: width,
          h: height,
          lines,
          horizontal,
          segmentIndex,
          baseScore,
        });
      }

      for (let index = 1; index < route.points.length; index++) {
        const a = route.points[index - 1], b = route.points[index];
        const length = segmentLength(a, b);
        if (length < 12) continue;
        for (const fraction of [0.5, 0.3, 0.7]) {
          if (isHorizontal(a, b)) {
            const cx = a.x + (b.x - a.x) * fraction;
            for (const gap of [7, 18, 34, 56, 84, 120]) {
              for (const direction of [-1, 1]) {
                const cy = a.y + direction * (height / 2 + gap);
                addCandidate(cx, cy, gap * 4 - Math.min(length, 240) * 1.2 + index * 3, true, index);
              }
            }
          } else {
            const cy = a.y + (b.y - a.y) * fraction;
            for (const gap of [7, 18, 34, 56, 84, 120]) {
              for (const direction of [-1, 1]) {
                const cx = a.x + direction * (width / 2 + gap);
                addCandidate(cx, cy, 180 + gap * 4 - Math.min(length, 240) + index * 3, false, index);
              }
            }
          }
        }
      }

      // Tight elbows often have no segment long enough to carry a label. Add
      // positions around each bend, then a deterministic square spiral around
      // the route centre as a guaranteed clear fallback.
      for (let index = 0; index < route.points.length; index++) {
        const point = route.points[index];
        for (const gap of [10, 28, 52, 84]) {
          for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            addCandidate(
              point.x + dx * (width / 2 + gap),
              point.y + dy * (height / 2 + gap),
              520 + gap * 5 + index * 3,
              true,
              index,
            );
          }
        }
      }
      const anchor = route.points[Math.floor(route.points.length / 2)];

      function scoreCandidate(candidate) {
        if (nodeRects.some(box => boxesOverlap(candidate, box))) {
          candidate.score = Infinity;
          return;
        }
        if (occupied.some(box => boxesOverlap(candidate, box, 5))) {
          candidate.score = Infinity;
          return;
        }
        let score = candidate.baseScore;
        for (const segment of routeSegments) {
          if (segment.routeIndex === route.index) continue;
          if (segmentIntersectsBox(segment.a, segment.b, {
            x0: candidate.x - 5,
            y0: candidate.y - 5,
            x1: candidate.x + candidate.w + 5,
            y1: candidate.y + candidate.h + 5,
          })) score += 1_100;
        }
        candidate.score = score;
      }

      for (const candidate of candidates) scoreCandidate(candidate);

      let best = candidates.filter(candidate => Number.isFinite(candidate.score))
        .sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x)[0];
      if (!best) {
        for (let ring = 1; !best && ring <= 14; ring++) {
          const ringCandidates = [];
          for (let step = -ring; step <= ring; step++) {
            for (const [dx, dy] of [[step, -ring], [step, ring], [-ring, step], [ring, step]]) {
              ringCandidates.push({
                x: anchor.x + dx * 24 - width / 2,
                y: anchor.y + dy * 20 - height / 2,
                w: width,
                h: height,
                lines,
                horizontal: true,
                segmentIndex: 0,
                baseScore: 1_200 + ring * 50,
              });
            }
          }
          for (const candidate of ringCandidates) scoreCandidate(candidate);
          best = ringCandidates.filter(candidate => Number.isFinite(candidate.score))
            .sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x)[0];
        }
      }
      if (!best) {
        // This lane is outside every node. Walk rows and columns until it also
        // clears all previously placed labels, so every labelled source edge
        // always receives a label box.
        for (let row = 0; !best && row < routes.length + 8; row++) {
          const cy = row % 2 === 0
            ? bounds.y0 - height / 2 - 18 - Math.floor(row / 2) * (height + 10)
            : bounds.y1 + height / 2 + 18 + Math.floor(row / 2) * (height + 10);
          for (let column = 0; column <= routes.length; column++) {
            const direction = column % 2 ? 1 : -1;
            const distance = Math.ceil(column / 2) * (width + 10);
            const candidate = {
              x: anchor.x + direction * distance - width / 2,
              y: cy - height / 2,
              w: width,
              h: height,
              lines,
              horizontal: true,
              segmentIndex: 0,
              score: 10_000 + row * 100 + column,
            };
            if (!occupied.some(box => boxesOverlap(candidate, box, 5))) {
              best = candidate;
              break;
            }
          }
        }
      }
      route.labelBox = best;
      if (best) occupied.push(best);
    }
  }

  function routeEdges(nodes, edges) {
    const specs = assignPorts(nodes, edges);
    const nodeBounds = rawNodeBounds(nodes, obstaclePadding);
    const ordered = [...specs].sort((a, b) => {
      const ac = nodeCenter(a.source), at = nodeCenter(a.target);
      const bc = nodeCenter(b.source), bt = nodeCenter(b.target);
      return (Math.abs(ac.x - at.x) + Math.abs(ac.y - at.y))
        - (Math.abs(bc.x - bt.x) + Math.abs(bc.y - bt.y)) || a.index - b.index;
    });
    const chosen = [];
    for (let orderIndex = 0; orderIndex < ordered.length; orderIndex++) {
      const spec = ordered[orderIndex];
      const reservedRoutes = ordered.slice(orderIndex + 1).flatMap(futureSpec => {
        const source = attachmentPoints(futureSpec.source, futureSpec.sourceSide, futureSpec.sourceOffset);
        const target = attachmentPoints(futureSpec.target, futureSpec.targetSide, futureSpec.targetOffset);
        return [{ points: [source.port, source.stub] }, { points: [target.stub, target.port] }];
      });
      let points = gridRoute(spec, nodes, nodeBounds, chosen, reservedRoutes);
      if (!points) {
        const candidates = buildCandidates(spec, nodeBounds);
        const ranked = candidates.map(candidate => ({
          points: candidate,
          score: scoreRoute(candidate, spec, nodes, chosen),
        })).sort((a, b) => a.score - b.score || routeLength(a.points) - routeLength(b.points));
        points = ranked[0].points;
      }
      chosen.push({ ...spec, points, score: scoreRoute(points, spec, nodes, chosen) });
    }
    const routes = chosen.sort((a, b) => a.index - b.index);
    placeEdgeLabels(routes, nodes);
    return routes;
  }

  function roundedPath(points, radius = 9) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1], current = points[index], next = points[index + 1];
      const before = segmentLength(previous, current);
      const after = segmentLength(current, next);
      const bend = Math.min(radius, before / 2, after / 2);
      const enter = {
        x: current.x + Math.sign(previous.x - current.x) * bend,
        y: current.y + Math.sign(previous.y - current.y) * bend,
      };
      const exit = {
        x: current.x + Math.sign(next.x - current.x) * bend,
        y: current.y + Math.sign(next.y - current.y) * bend,
      };
      path += ` L ${enter.x} ${enter.y} Q ${current.x} ${current.y} ${exit.x} ${exit.y}`;
    }
    const last = points.at(-1);
    return `${path} L ${last.x} ${last.y}`;
  }

  function diagramBounds(nodes, routes = [], padding = 92) {
    const raw = rawNodeBounds(nodes);
    let x0 = raw.x0, y0 = raw.y0, x1 = raw.x1, y1 = raw.y1;
    for (const route of routes) {
      for (const point of route.points) {
        x0 = Math.min(x0, point.x); y0 = Math.min(y0, point.y);
        x1 = Math.max(x1, point.x); y1 = Math.max(y1, point.y);
      }
      if (route.labelBox) {
        x0 = Math.min(x0, route.labelBox.x); y0 = Math.min(y0, route.labelBox.y);
        x1 = Math.max(x1, route.labelBox.x + route.labelBox.w);
        y1 = Math.max(y1, route.labelBox.y + route.labelBox.h);
      }
    }
    return { x0: x0 - padding, y0: y0 - padding, x1: x1 + padding, y1: y1 + padding };
  }

  function foreignNodeHits(route, nodes, padding = 0) {
    const hits = [];
    for (let index = 1; index < route.points.length; index++) {
      for (const node of nodes) {
        if (node.id === route.source.id || node.id === route.target.id) continue;
        if (segmentIntersectsBox(route.points[index - 1], route.points[index], nodeBox(node, padding))) hits.push(node.id);
      }
    }
    return [...new Set(hits)];
  }

  function crossingSummary(routes) {
    let crossings = 0, overlaps = 0;
    for (let first = 0; first < routes.length; first++) {
      for (let second = first + 1; second < routes.length; second++) {
        const a = routes[first], b = routes[second];
        for (let ai = 1; ai < a.points.length; ai++) {
          for (let bi = 1; bi < b.points.length; bi++) {
            const relation = segmentRelation(a.points[ai - 1], a.points[ai], b.points[bi - 1], b.points[bi]);
            if (!relation) continue;
            if (relation.type === 'overlap') overlaps++;
            else if (!(pointIsEndpoint(relation.point, a.points) && pointIsEndpoint(relation.point, b.points))) crossings++;
          }
        }
      }
    }
    return { crossings, overlaps };
  }

  return {
    dimensions,
    nodeGeometry,
    nodeCenter,
    nodeBox,
    layoutNodes,
    portPoint,
    routeEdges,
    roundedPath,
    diagramBounds,
    segmentIntersectsBox,
    foreignNodeHits,
    crossingSummary,
  };
}

export { createProcessGeometry };
