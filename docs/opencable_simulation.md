# OpenCable simulation

This fork adds an initial OpenCable machine preset to the 2D hp-sim application.

## Machine model

The preset is `public/usd_scenes/opencable_8belt.usda` and models:

- 2440 x 1220 mm machine envelope.
- 350 x 350 mm rigid carriage.
- Four carriage attachment points (A-D).
- Eight independent spool/stepper drives (A-H).
- Two independent belts assigned to each carriage corner.
- Zero gravity for the planar machine model.

The scene is deliberately marked as a **simulation baseline**. The coordinates of the eight drives are explicit in the USD scene so that the mechanical geometry can be replaced with the final OpenCable coordinates without changing the physics engine.

## Cable model used

The OpenCable paths use the existing hp-sim5 `CablePathComponent` and Cable Joints physics. Each belt uses a `hybrid` spool endpoint and an `attachment` carriage endpoint. This is important because hp-sim5's hybrid endpoint handling updates stored cable length from spool rotation and supports layered winding through the existing rolling-radius machinery.

The physics engine already provides:

- point-to-circle tangents;
- circle-to-point tangents;
- circle-to-circle common tangents;
- signed arc length on wheels;
- hybrid endpoint handling;
- stored line length and layered winding;
- cable slack, constraint solving, and friction systems;
- dynamic stepper-motor behavior.

OpenCable therefore does not introduce a second cable-physics implementation.

## UI

`hp-sim/app/appBootstrap.js` registers `opencable_8belt.usda` in `AVAILABLE_USDAS`. It appears in the existing **Machines** menu as:

`OpenCable — 8-belt prototype`

## Current limitation

The preset intentionally does **not** claim to be the final OpenCable mechanical geometry. In particular, the exact pulley routing and final anchor coordinates must be inserted once the mechanical design is frozen.

The purpose of this first preset is to validate that the existing hp-sim5 physics stack can represent the OpenCable carriage and eight independent winding drives without creating a parallel simulation engine.

## Local run

From the repository root:

```bash
npm install
npx vite
```

Open:

```text
http://localhost:5173/hp-sim5/hp-sim/
```

Then open **Machines** and select **OpenCable — 8-belt prototype**.
