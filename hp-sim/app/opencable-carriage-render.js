import { RenderSystem } from '../../example_apps/js/flipper/renderSystem.js';
import {
  PositionComponent,
  RigidGroupComponent,
} from '../../src/js/cable_joints/ecs.js';
import { ExtruderComponent } from '../../example_apps/js/slideprinter/slideprinter_common.js';

const CARRIAGE_SIZE_M = 0.350;
const HALF_SIZE_M = CARRIAGE_SIZE_M * 0.5;

let openCableSceneActive = false;

// Detect the active USDA without modifying appBootstrap.js.
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === 'string'
        ? args[0]
        : args[0]?.url || '';
      openCableSceneActive = String(requestUrl).includes('opencable_8belt.usda');
    } catch (_) {
      // Keep the previous scene state if the request cannot be inspected.
    }
    return response;
  };
}

if (!RenderSystem.prototype.__openCableCarriagePatched) {
  const originalRun = RenderSystem.prototype.run;

  if (typeof originalRun === 'function') {
    RenderSystem.prototype.run = function (...args) {
      const world = args.find((value) => value && typeof value.query === 'function');

      if (!world || !openCableSceneActive) {
        return originalRun.apply(this, args);
      }

      // Suppress only the old Hexagon rigid-group outline during rendering.
      // Physics, rigid-body membership, pinholes and cable joints are untouched.
      const originalQuery = world.query;
      world.query = function (components) {
        if (Array.isArray(components) && components.includes(RigidGroupComponent)) {
          return [];
        }
        return originalQuery.call(this, components);
      };

      try {
        originalRun.apply(this, args);
      } finally {
        world.query = originalQuery;
      }

      drawOpenCableCarriage(this, world);
    };
  }

  RenderSystem.prototype.__openCableCarriagePatched = true;
}

function drawOpenCableCarriage(renderer, world) {
  const extruderEntities = world.query([ExtruderComponent]);
  if (extruderEntities.length === 0) {
    return;
  }

  const centerSources = [];
  for (const entityId of extruderEntities) {
    const extruder = world.getComponent(entityId, ExtruderComponent);
    if (!extruder?.centerSources || typeof extruder.centerSources !== 'object') {
      continue;
    }

    for (const [machineId, sourceIds] of Object.entries(extruder.centerSources)) {
      if (!/opencable/i.test(machineId) || !Array.isArray(sourceIds) || sourceIds.length === 0) {
        continue;
      }
      centerSources.push(sourceIds);
    }
  }

  if (centerSources.length === 0) {
    return;
  }

  for (const sourceIds of centerSources) {
    let sumX = 0.0;
    let sumY = 0.0;
    let count = 0;

    for (const entityId of sourceIds) {
      const pos = world.getComponent(entityId, PositionComponent)?.pos;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        continue;
      }
      sumX += pos.x;
      sumY += pos.y;
      count += 1;
    }

    if (count === 0) {
      continue;
    }

    const cx = sumX / count;
    const cy = sumY / count;

    const left = renderer.cX(cx - HALF_SIZE_M);
    const right = renderer.cX(cx + HALF_SIZE_M);
    const top = renderer.cY(cy + HALF_SIZE_M);
    const bottom = renderer.cY(cy - HALF_SIZE_M);

    renderer.c.save();
    renderer.c.strokeStyle = 'green';
    renderer.c.lineWidth = Math.max(1.0, 2.0 * renderer.effectiveCScale / 250);
    renderer.c.beginPath();
    renderer.c.moveTo(left, top);
    renderer.c.lineTo(right, top);
    renderer.c.lineTo(right, bottom);
    renderer.c.lineTo(left, bottom);
    renderer.c.closePath();
    renderer.c.stroke();
    renderer.c.restore();
  }
}
