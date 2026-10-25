import type { PhysicsPluginContext } from './physics-plugin';

export const driftMinimumSpeed = 5;
export const driftMinimumAngle = 0.3;
export const carContactSeparation = 0.25;

export function createRunStatistics(
  { Ammo, dispatcher, vehicleBody }: PhysicsPluginContext,
  opponents: ReadonlySet<number>,
) {
  const player = Ammo.getPointer(vehicleBody);
  const cones = new Set<number>();
  const contacts = new Map<number, number>();
  const stats = {
    driftTime: 0,
    carContacts: 0,
    timeInFirst: 0,
    get conesHit() {
      return cones.size;
    },
    hitCone(id: number) {
      cones.add(id);
    },
    reset() {
      stats.driftTime = stats.carContacts = stats.timeInFirst = 0;
      cones.clear();
      contacts.clear();
    },
    update(dt: number, motion: { speed: number; slipAngle: number }, leading = false) {
      if (leading) stats.timeInFirst += dt;
      if (motion.speed >= driftMinimumSpeed && Math.abs(motion.slipAngle) >= driftMinimumAngle)
        stats.driftTime += dt;
      if (!opponents.size) return;
      for (const [opponent, elapsed] of contacts) {
        if (elapsed + dt >= carContactSeparation) contacts.delete(opponent);
        else contacts.set(opponent, elapsed + dt);
      }
      for (let i = 0; i < dispatcher.getNumManifolds(); i++) {
        const manifold = dispatcher.getManifoldByIndexInternal(i);
        const first = Ammo.getPointer(manifold.getBody0());
        const second = Ammo.getPointer(manifold.getBody1());
        const opponent = first === player ? second : second === player ? first : null;
        if (opponent === null || !opponents.has(opponent)) continue;
        for (let j = 0; j < manifold.getNumContacts(); j++) {
          if (manifold.getContactPoint(j).getDistance() > 0) continue;
          if (!contacts.has(opponent)) stats.carContacts++;
          contacts.set(opponent, 0);
          break;
        }
      }
    },
  };
  return stats;
}
