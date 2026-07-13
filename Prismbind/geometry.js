(function initializePrismbindGeometry(root, factory) {
  "use strict";

  const geometry = factory();
  if (typeof module === "object" && module.exports) module.exports = geometry;
  else root.PrismbindGeometry = geometry;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrismbindGeometry() {
  "use strict";

  const EPSILON = 1e-7;

  function finitePoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
  }

  function cross(a, b, c) {
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return 0;
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function onSegment(a, b, point, epsilon = EPSILON) {
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(point)) return false;
    return Math.abs(cross(a, b, point)) <= epsilon
      && point.x >= Math.min(a.x, b.x) - epsilon
      && point.x <= Math.max(a.x, b.x) + epsilon
      && point.y >= Math.min(a.y, b.y) - epsilon
      && point.y <= Math.max(a.y, b.y) + epsilon;
  }

  function segmentsIntersect(a, b, c, d, epsilon = EPSILON) {
    if (![a, b, c, d].every(finitePoint)) return false;
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    const proper = ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
      && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
    if (proper) return true;
    return onSegment(a, b, c, epsilon) || onSegment(a, b, d, epsilon)
      || onSegment(c, d, a, epsilon) || onSegment(c, d, b, epsilon);
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return 0;
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area * 0.5;
  }

  function edgeWouldCross(points, candidate, closing = false) {
    if (!Array.isArray(points) || points.length < 2 || !points.every(finitePoint)) return false;
    const start = points[points.length - 1];
    const end = closing ? points[0] : candidate;
    if (!finitePoint(end)) return true;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (index === points.length - 2) continue;
      if (closing && index === 0) continue;
      if (segmentsIntersect(start, end, a, b)) return true;
    }
    return false;
  }

  function canClose(points, minimumArea = 0.16) {
    if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return false;
    const areaFloor = Math.max(0, Number.isFinite(Number(minimumArea)) ? Number(minimumArea) : 0.16);
    return !edgeWouldCross(points, points[0], true) && Math.abs(polygonArea(points)) >= areaFloor;
  }

  return Object.freeze({
    EPSILON,
    cross,
    onSegment,
    segmentsIntersect,
    polygonArea,
    edgeWouldCross,
    canClose,
  });
});
