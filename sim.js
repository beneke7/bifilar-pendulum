// ================================================================
// BIFILAR PENDULUM - SIM.JS
//
// Small physics module for the live rig. Units are metres, seconds,
// radians. The equation and constants are the project ground truth.
// ================================================================

export const G = 9.81;

export function omega0(L, ell, f, g = G) {
  return Math.sqrt((3 * g * f * f) / ell);
}

export function T0(L, ell, f, g = G) {
  return (2 * Math.PI) / omega0(L, ell, f, g);
}

export function lift(theta, L, ell, f) {
  const d = (f * L) / 2;
  const s = Math.sin(theta / 2);
  return ell - Math.sqrt(Math.max(0, ell * ell - 4 * d * d * s * s));
}

function accel(theta, thetaDot, w0, k, gamma) {
  const s = Math.sin(theta / 2);
  const geom = Math.min(k * k * s * s, 0.999);
  return -(w0 * w0 * Math.sin(theta)) / Math.sqrt(1 - geom) - 2 * gamma * thetaDot;
}

export function step(state, dt) {
  const w0 = state.w0 ?? omega0(state.L, state.ell, state.f, state.g ?? G);
  const k = state.k ?? (state.f * state.L) / state.ell;
  const gamma = state.gamma ?? 0;

  const a1 = accel(state.theta, state.thetaDot, w0, k, gamma);
  const v1 = state.thetaDot;
  const a2 = accel(state.theta + v1 * dt / 2, state.thetaDot + a1 * dt / 2, w0, k, gamma);
  const v2 = state.thetaDot + a1 * dt / 2;
  const a3 = accel(state.theta + v2 * dt / 2, state.thetaDot + a2 * dt / 2, w0, k, gamma);
  const v3 = state.thetaDot + a2 * dt / 2;
  const a4 = accel(state.theta + v3 * dt, state.thetaDot + a3 * dt, w0, k, gamma);
  const v4 = state.thetaDot + a3 * dt;

  state.theta += (dt / 6) * (v1 + 2 * v2 + 2 * v3 + v4);
  state.thetaDot += (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
  return state;
}

export function periodAt(A, w0, k) {
  const state = { theta: A, thetaDot: 0, w0, k, gamma: 0 };
  const dt = Math.min(0.002, (2 * Math.PI / w0) / 2000);
  let last = state.theta;
  let firstCrossing = null;
  let t = 0;

  for (let i = 0; i < 200000; i++) {
    step(state, dt);
    t += dt;
    if (last < 0 && state.theta >= 0 && state.thetaDot > 0) {
      if (firstCrossing === null) firstCrossing = t;
      else return t - firstCrossing;
    }
    last = state.theta;
  }
  return NaN;
}

const checkW0 = omega0(1.2, 1.6, 1);
const checkT = periodAt(0.001, checkW0, 1.2 / 1.6);
console.assert(Math.abs(checkT - 2 * Math.PI / checkW0) < 0.01, 'small-angle period self-check');
