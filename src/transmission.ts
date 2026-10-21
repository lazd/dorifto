export const redlineRpm = 7200;
export const downshiftRpm = 4000;
const ratios = [2.97, 2.10, 1.46, 1.00, 0.80, 0.63];
const finalDrive = 3.692;
const reverseRatio = 3.369;

export class TransmissionTCU {
  getRatio(gear: number): number {
    if (gear === -1) return reverseRatio * finalDrive;
    if (!Number.isInteger(gear) || gear < 1 || gear > ratios.length) {
      throw new Error(`Invalid transmission gear: ${gear}`);
    }
    return ratios[gear - 1] * finalDrive;
  }

  remapThrottle(pedal: number): number {
    return Math.sqrt(pedal);
  }

  determineGear(gear: number, rpm: number, liftingOffThrottle: boolean): number {
    if (rpm < downshiftRpm && gear > 1) return gear - 1;
    if (!liftingOffThrottle && rpm >= redlineRpm && gear < ratios.length) return gear + 1;
    return gear;
  }
}
