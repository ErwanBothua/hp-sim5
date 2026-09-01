import { OpenText as UsdOpenText, getAttribute } from '../../src/js/usd/stage.js';
import { World, OrientationComponent } from '../../src/js/cable_joints/ecs.js';
import { runGame } from '../../example_apps/js/slideprinter/runner.js';
import { setupScene } from '../../example_apps/js/slideprinter/setupScene.js';
import { RemoteSpoolSystem, InputSystem, ExtruderComponent } from '../../example_apps/js/slideprinter/slideprinter_common.js';
import { detectFileFormat, FileFormat, isKlipperFormat, isRrfFormat } from '../../integrations/shared/fileFormatUtils.js';
import { createKlipperRawBridge } from '../../integrations/klipper/klipperSimulatorBridge.js';
import klipperMcuCommandPlayerWorkerUrl from '../../integrations/klipper/klipperMcuCommandPlayer.js?worker&url';
import rrfCanPlayerWorkerUrl from '../../integrations/rrf/rrfCanPlayer.js?worker&url';
import moveCommanderWorkerUrl from '../../example_apps/js/slideprinter/moveCommander.js?worker&url';
import { _updateAttachmentPoints } from '../../src/js/cable_joints/cable_joints_core.js';
import { QualityMonitor } from './quality-monitor.js';
import { setClosedLoopMotorFeatureFlags } from './closed-loop-flags.js';
import { setLineLayeringFeatureFlags } from './line-layering-flags.js';
import { getMachineMotorDiagnostics } from './motor-diagnostics.js';
import { bakeCableSceneUsdaSource } from '../../src/js/usd/cable_scene_baker.js';

const COMMAND_PRESET_VARIANTS = Object.freeze({
  hangprinterLogo: Object.freeze({
    default: Object.freeze({
      url: new URL('../../public/RRF_CAN_commands/Hangprinter_logo6_slideprinter_no_buildup.can', import.meta.url).href,
      format: FileFormat.RRF_CAN_BINARY,
      referencePresetKey: 'hangprinterLogo',
    }),
    lineLayered: Object.freeze({
      url: new URL('../../public/RRF_CAN_commands/Hangprinter_logo6_slideprinter_w_line_layers.can', import.meta.url).href,
      format: FileFormat.RRF_CAN_BINARY,
      referencePresetKey: 'hangprinterLogo',
    }),
  }),
  straightMoves: Object.freeze({
    default: Object.freeze({
      url: new URL('../../public/RRF_CAN_commands/draw_squares_bigger_slideprinter_no_buildup.can', import.meta.url).href,
      format: FileFormat.RRF_CAN_BINARY,
      referencePresetKey: 'straightMovesBigger',
    }),
    lineLayered: Object.freeze({
      url: new URL('../../public/RRF_CAN_commands/draw_squares_bigger_slideprinter_w_line_layers.can', import.meta.url).href,
      format: FileFormat.RRF_CAN_BINARY,
      referencePresetKey: 'straightMovesBigger',
    }),
  }),
});

function resolvePresetCommand(presetKey, lineLayeringEnabled) {
  const variants = COMMAND_PRESET_VARIANTS[presetKey];
  if (variants === null || variants === undefined) {
    return null;
  }
  if (lineLayeringEnabled === true && variants.lineLayered?.url) {
    return variants.lineLayered;
  }
  if (variants.default?.url) {
    return variants.default;
  }
  if (variants.lineLayered?.url) {
    return variants.lineLayered;
  }
  return null;
}

function getPresetActionLabel(presetKey) {
  if (presetKey === 'hangprinterLogo') {
    return 'Print Logo';
  }
  if (presetKey === 'straightMoves') {
    return 'Print Squares';
  }
  return presetKey;
}

function describeSelectedPresetFile(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }
  try {
    return new URL(url, window.location.href).pathname;
  } catch (_error) {
    return url;
  }
}

const PRESET_GCODE_MAP = Object.freeze({
  hangprinterLogo: {
    url: new URL('../../public/gcode/Hangprinter_logo6.gcode', import.meta.url).href,
    label: 'Hangprinter Logo (G-code)',
    color: '#ff7a18',
  },
  straightMoves: {
    url: new URL('../../public/gcode/draw_squares.gcode', import.meta.url).href,
    label: 'Draw Squares (G-code)',
    color: '#00b2ff',
  },
  straightMovesBigger: {
    url: new URL('../../public/gcode/draw_squares_bigger.gcode', import.meta.url).href,
    label: 'Draw Bigger Squares (G-code)',
    color: '#00b2ff',
  },
});

const DEFAULT_UPLOAD_PRESET_MATCHES = Object.freeze([
  { substring: 'Hangprinter_logo6', presetKey: 'hangprinterLogo' },
  { substring: 'draw_squares_bigger', presetKey: 'straightMovesBigger' },
  { substring: 'draw_squares', presetKey: 'straightMoves' },
]);
const DEFAULT_UPLOAD_PRESET_EXTENSIONS = Object.freeze(['.txt', '.serial', '.csv', '.can']);

function parseUploadPresetMappings(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_UPLOAD_PRESET_MATCHES;
  }
  const entries = [];
  const normalized = value
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  for (const segment of normalized) {
    const [name, key] = segment.split('=').map((entry) => entry.trim());
    if (name && key) {
      entries.push({ substring: name, presetKey: key });
    }
  }
  return entries.length > 0 ? entries : DEFAULT_UPLOAD_PRESET_MATCHES;
}

function parseUploadPresetExtensions(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_UPLOAD_PRESET_EXTENSIONS;
  }
  const entries = value
    .split(',')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0)
    .map((segment) => (segment.startsWith('.') ? segment : `.${segment}`));
  return entries.length > 0 ? entries : DEFAULT_UPLOAD_PRESET_EXTENSIONS;
}

function buildUploadPresetConfig(inputElement) {
  const dataset = inputElement?.dataset;
  const presets = parseUploadPresetMappings(dataset?.referencePresets);
  const extensions = parseUploadPresetExtensions(dataset?.referenceExtensions);
  return {
    presets,
    extensionSet: new Set(extensions),
  };
}

const GCODE_MM_TO_SIM_SCALE = 0.001;
const GCODE_EXTRUSION_EPSILON = 1e-6;
const GCODE_MOVE_EPSILON = 1e-9;
const GCODE_INLINE_COMMENT_RE = /\(.*?\)/g;
const referencePathCache = new Map();

const DEFAULT_PRESET_KEY = 'hangprinterLogo';
const DEFAULT_VIEW_SCALE = 0.6;
const MIN_VIEW_SCALE = 0.01;
const MAX_VIEW_SCALE = 200;
const ZOOM_FACTOR = 1.2;
const ZOOM_EPSILON = 1e-3;
const QUALITY_HISTORY_MAX_ENTRIES = 20;
const PUBLIC_BASE_URL = import.meta.env.BASE_URL || '/';

const AVAILABLE_USDAS = Object.freeze([
  { file: 'slideprinter_multi_unit.usda', label: 'Slideprinter Multi Unit (default)' },
  { file: 'slideprinter.usda', label: 'Slideprinter Original' },
  { file: 'slideprinter_hexagon.usda', label: 'Slideprinter (hexagon)' },
  { file: 'slideprinter_single_pinholes.usda', label: 'Slideprinter (single pinholes)' },
  { file: 'opencable_8belt.usda', label: 'OpenCable — 8-belt prototype' },
]);

function initHpSim() {
  const canvas = document.getElementById('myCanvas');
  const controlsRoot = document.getElementById('controls');
  if (!canvas || !controlsRoot) {
    return;
  }

  const printLogoBtn = document.getElementById('printLogoBtn');
  const printSquareBtn = document.getElementById('printSquareBtn');