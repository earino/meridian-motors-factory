// Shared layout constants & helpers for the factory scene.

export const BELT_TOP = 1.0;           // conveyor surface height (world Y)
export const BELT_START = -30;         // belt left edge (raw side)
export const BELT_END = 16;            // belt right edge (exit side)
export const RAMP_END = 19;            // ramp bottom / road start

export const ZONES = {
  raw:      { x0: -30, x1: -20 },
  weld:     { x0: -19, x1: -13 },   // center -16
  paint:    { x0: -9,  x1: -2 },    // center -5.5
  assembly: { x0: 1,   x1: 7 },      // center +4
  check:    { x0: 9,   x1: 13 },     // center +11
};

export const CAR_SPEED = 2.6;          // world units per second at 1x
export const SPAWN_INTERVAL = 7.5;     // seconds between cars (game time)
export const DESPAWN_X = 64;

// Surface height of the line/road for a given x position.
export function surfaceY(x) {
  if (x < BELT_END) return BELT_TOP;
  if (x >= RAMP_END) return 0.03;
  const t = (x - BELT_END) / (RAMP_END - BELT_END); // 0..1 across ramp
  return BELT_TOP + (0.03 - BELT_TOP) * t;
}

export function surfaceSlope(x) {
  if (x < BELT_END || x >= RAMP_END) return 0;
  const dy = 0.03 - BELT_TOP;
  const dx = RAMP_END - BELT_END;
  return Math.atan2(dy, dx); // negative (descending toward +X)
}

export function inZone(x, zone) {
  return x >= ZONES[zone].x0 && x <= ZONES[zone].x1;
}
