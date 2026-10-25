import type { ConfigurationState } from './configuration-state';

export function speedInUnit(speedMps: number, unit: ConfigurationState['speedUnit']) {
  return Math.abs(speedMps) * (unit === 'kmh' ? 3.6 : 1 / 0.44704);
}
