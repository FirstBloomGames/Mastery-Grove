(function initializeMothchorusProjection(root, factory) {
  "use strict";

  const projection = factory();
  if (typeof module === "object" && module.exports) module.exports = projection;
  else root.MothchorusProjection = projection;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMothchorusProjection() {
  "use strict";

  const WORLD_WIDTH = 1000;
  const WORLD_HEIGHT = 1000;
  const TOUCH_DPR_CAP = 1.5;
  const DESKTOP_DPR_CAP = 2;
  const BACKING_PIXEL_BUDGET = 1500000;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const CONSTANTS = deepFreeze({
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    touchDprCap: TOUCH_DPR_CAP,
    desktopDprCap: DESKTOP_DPR_CAP,
    backingPixelBudget: BACKING_PIXEL_BUDGET,
  });

  function positiveNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number.`);
    }
    return value;
  }

  function nonNegativeNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number.`);
    }
    return value;
  }

  function normalizedInsets(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("safeInsets must be an object.");
    }
    return deepFreeze({
      top: nonNegativeNumber(value.top ?? 0, "safeInsets.top"),
      right: nonNegativeNumber(value.right ?? 0, "safeInsets.right"),
      bottom: nonNegativeNumber(value.bottom ?? 0, "safeInsets.bottom"),
      left: nonNegativeNumber(value.left ?? 0, "safeInsets.left"),
    });
  }

  function createProjection(viewportWidth, viewportHeight, options = {}) {
    const width = positiveNumber(viewportWidth, "viewportWidth");
    const height = positiveNumber(viewportHeight, "viewportHeight");
    const worldWidth = positiveNumber(options.worldWidth ?? WORLD_WIDTH, "worldWidth");
    const worldHeight = positiveNumber(options.worldHeight ?? WORLD_HEIGHT, "worldHeight");
    const safeInsets = normalizedInsets(options.safeInsets);
    const safeWidth = width - safeInsets.left - safeInsets.right;
    const safeHeight = height - safeInsets.top - safeInsets.bottom;
    if (safeWidth <= 0 || safeHeight <= 0) throw new RangeError("safeInsets must leave a positive play rectangle.");

    const scale = Math.min(safeWidth / worldWidth, safeHeight / worldHeight);
    const renderWidth = worldWidth * scale;
    const renderHeight = worldHeight * scale;
    const offsetX = safeInsets.left + (safeWidth - renderWidth) / 2;
    const offsetY = safeInsets.top + (safeHeight - renderHeight) / 2;

    return deepFreeze({
      viewportWidth: width,
      viewportHeight: height,
      worldWidth,
      worldHeight,
      safeInsets,
      safeRect: {
        left: safeInsets.left,
        top: safeInsets.top,
        right: width - safeInsets.right,
        bottom: height - safeInsets.bottom,
        width: safeWidth,
        height: safeHeight,
      },
      scale,
      offsetX,
      offsetY,
      renderWidth,
      renderHeight,
      worldRect: {
        left: offsetX,
        top: offsetY,
        right: offsetX + renderWidth,
        bottom: offsetY + renderHeight,
        width: renderWidth,
        height: renderHeight,
      },
    });
  }

  function isProjection(value) {
    return Boolean(value
      && typeof value === "object"
      && Number.isFinite(value.scale)
      && value.scale > 0
      && Number.isFinite(value.offsetX)
      && Number.isFinite(value.offsetY)
      && Number.isFinite(value.worldWidth)
      && value.worldWidth > 0
      && Number.isFinite(value.worldHeight)
      && value.worldHeight > 0);
  }

  function pointCoordinates(x, y) {
    if (x && typeof x === "object" && !Array.isArray(x)) return pointCoordinates(x.x, x.y);
    if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
      throw new TypeError("point coordinates must be finite numbers.");
    }
    return { x, y };
  }

  function logicalToScreen(projection, x, y) {
    if (!isProjection(projection)) throw new TypeError("projection is invalid.");
    const point = pointCoordinates(x, y);
    return deepFreeze({
      x: projection.offsetX + point.x * projection.scale,
      y: projection.offsetY + point.y * projection.scale,
    });
  }

  function screenToLogical(projection, x, y, options = {}) {
    if (!isProjection(projection)) throw new TypeError("projection is invalid.");
    const point = pointCoordinates(x, y);
    let logicalX = (point.x - projection.offsetX) / projection.scale;
    let logicalY = (point.y - projection.offsetY) / projection.scale;
    if (options.clamp === true) {
      logicalX = Math.min(projection.worldWidth, Math.max(0, logicalX));
      logicalY = Math.min(projection.worldHeight, Math.max(0, logicalY));
    }
    return deepFreeze({ x: logicalX, y: logicalY });
  }

  function canvasBudget(cssWidth, cssHeight, devicePixelRatio = 1, options = {}) {
    const width = positiveNumber(cssWidth, "cssWidth");
    const height = positiveNumber(cssHeight, "cssHeight");
    const deviceDpr = positiveNumber(devicePixelRatio, "devicePixelRatio");
    const touch = options.touch === true;
    const dprCap = positiveNumber(
      options.dprCap ?? (touch ? TOUCH_DPR_CAP : DESKTOP_DPR_CAP),
      "dprCap",
    );
    const pixelBudget = positiveNumber(options.pixelBudget ?? BACKING_PIXEL_BUDGET, "pixelBudget");
    const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
    const dpr = Math.min(deviceDpr, dprCap, budgetDpr);
    const backingWidth = Math.max(1, Math.floor(width * dpr));
    const backingHeight = Math.max(1, Math.floor(height * dpr));

    return deepFreeze({
      cssWidth: width,
      cssHeight: height,
      touch,
      deviceDpr,
      dprCap,
      pixelBudget,
      budgetDpr,
      dpr,
      backingWidth,
      backingHeight,
      backingPixels: backingWidth * backingHeight,
    });
  }

  return deepFreeze({
    CONSTANTS,
    createProjection,
    isProjection,
    logicalToScreen,
    screenToLogical,
    canvasBudget,
  });
});
