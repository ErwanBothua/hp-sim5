# OpenCable — Working Memory

> Internal working notes for future OpenCable tasks. This file is maintained so an implementation session can quickly recover the current architectural state without redoing the same analysis.

## Current objective

Adapt hp-sim5 to OpenCable while following the original hp-sim5 architecture. Do **not** bypass the native USD → setupScene → ECS → RenderSystem pipeline.

Immediate carriage task:
- OpenCable carriage is 350 × 350 mm.
- The supplied carriage drawing has **8 geometric corners**, and the user specifies that these 8 corners are the locations of the **8 pulleys**.
- hp-sim5 uses metres: 1 simulation unit = 1 metre.
- The accessible indexed drawing describes chamfered corners and 45 mm corner-related dimensions; the implemented octagonal corner coordinates are therefore (-130,175), (130,175), (175,130), (175,-130), (130,-175), (-130,-175), (-175,-130), (-175,130) mm = (-0.130,0.175), etc. in simulation units.
- Z remains independent and is not part of the XY belt kinematics.

## Architecture already established

### Scene loading
`hp-sim/app/appBootstrap.js` selects a USD scene and calls the original slideprinter scene setup. OpenCable is already present in the machine selector as `opencable_8belt.usda`. Do not add it again.

### USD → ECS
`example_apps/js/slideprinter/setupScene.js`:
- discovers `CablePathAPI`, `CableJoint`, `DistancePhysicsJoint`, and `RigidGroup` prims;
- creates ECS entities for tagged Spools, Anchors, Pinholes/Attachments;
- builds `RigidGroupComponent` from `rigidGroup:members`;
- reads `rigidGroup:renderIndices` and passes the resulting render segments into `RigidGroupComponent`.

### Rendering
`setupScene.js` imports the native `../flipper/renderSystem.js`.

`renderSystem.js` draws rigid-group visual edges from `RigidGroupComponent.renderSegments`. No parallel renderer or monkey-patch is used.

## OpenCable USD state

Files:
- `public/usd_scenes/opencable_8belt.usda`
- `public/usd_scenes/opencable_8belt_rigid_body.usda`

The current carriage implementation is in `opencable_8belt.usda`.

### Carriage implementation completed in this step
`public/usd_scenes/opencable_8belt.usda` now contains **8 carriage pulley members** (`PulleyA` through `PulleyH`) in one native `RigidGroup`.

The pulley/corner positions are, clockwise from the upper-left chamfer corner:
- A = (-0.130, +0.175) m
- B = (+0.130, +0.175) m
- C = (+0.175, +0.130) m
- D = (+0.175, -0.130) m
- E = (+0.130, -0.175) m
- F = (-0.130, -0.175) m
- G = (-0.175, -0.130) m
- H = (-0.175, +0.130) m

The rigid group uses:
`rigidGroup:renderIndices = "[0,1,2,3,4,5,6,7,0]"`
so the native renderer draws the eight-sided carriage perimeter.

The 8 existing cable joints remain one per belt/spool, but each joint now targets its corresponding pulley member instead of one of the previous four attachment members. Existing spool positions, joint rest lengths, cable paths and path parameters were kept unchanged.

Git commit for this step:
`c3c8a0aa76aace7d1002c041a5d83b1ff902eae8`

Verification after the write confirmed the updated USD file contains the eight-corner carriage representation.

## Geometry source / authority

The File Library currently exposes an indexed derivative of the supplied carriage drawing titled `Plan technique du chariot carré.png`. Its extracted content explicitly states:
- overall 350 × 350 mm;
- chamfered corners;
- pulley locations at the corners;
- pulley detail and other plate features;
- simulator conversion 1 unit = 1 metre.

The raw SVG XML itself is still not exposed as a directly readable file in the current tool environment. Therefore do not claim exact SVG path commands or exact hole/slot coordinates unless the raw SVG becomes accessible. The eight-corner requirement itself is explicitly supplied by the user and is now reflected in the USD.

## Important limitation of current visual representation

The native `RigidGroup` renderer only draws line segments between member positions. Therefore the current carriage is an **8-sided outline**, not yet a filled plate reproducing all SVG details (holes, slots, pulley graphics, central opening, etc.). Do not add a custom renderer without first inspecting and using an existing native hp-sim5 extension point.

## Git history / mistakes to avoid

A previous assistant attempt added `hp-sim/app/opencable-carriage-render.js` and imported it from `hp-sim.js`, using a monkey-patch approach. Those changes were reverted. Current `hp-sim.js` should remain the original bootstrap unless a later evidence-based change proves otherwise.

Never overwrite `appBootstrap.js` with partial/truncated content.

## Required workflow for future tasks

1. Read this file first.
2. Inspect the current repository state and the exact relevant source before changing anything.
3. Follow the original hp-sim5 data flow and extension points.
4. Make the smallest change that satisfies the task.
5. Change one file at a time when practical.
6. Test/verify before proceeding to another architectural change.
7. Update this working-memory file after meaningful architectural decisions or completed steps.
8. Never treat generated images or guessed geometry as authoritative source data.
9. If an exact source is unavailable, say so instead of inventing it.
