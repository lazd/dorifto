const radians = Math.PI / 180;
// Phone motion and gyro bias need frequent correction from the vehicle's GPS course.
const gyroNoise = 4 * radians;
const gpsNoiseFloor = 2 * radians;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const meanAngle = (angles) =>
  Math.atan2(
    angles.reduce((sum, angle) => sum + Math.sin(angle), 0),
    angles.reduce((sum, angle) => sum + Math.cos(angle), 0),
  );
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Scalar heading Kalman filter: gyro prediction, GPS drift correction, and gated compass updates.
 * All angles use world yaw (positive left from north); output stays unwrapped for interpolation.
 */
export function fuseHeading(times, yawRates, compass, fixes) {
  const gps = fixes.filter(
    (fix) =>
      fix.speed >= 3 &&
      Number.isFinite(fix.heading) &&
      Number.isFinite(fix.headingAccuracy) &&
      fix.headingAccuracy > 0 &&
      fix.headingAccuracy <= 30 * radians,
  );
  if (!gps.length || !yawRates.some(Number.isFinite)) {
    console.warn('  Skipping heading: no usable GPS bearings or mounted gyroscope readings');
    return undefined;
  }
  // Calibrate the mount and magnetic/true-north offset together on fast, straight sections.
  const offsets = [];
  let g = 0;
  let calibratedFix = -1;
  for (let i = 0; i < times.length; i++) {
    while (g < gps.length - 1 && gps[g + 1].time <= times[i]) g++;
    const fix = gps[g];
    if (
      compass[i] !== null &&
      Number.isFinite(yawRates[i]) &&
      Math.abs(yawRates[i]) < 0.03 &&
      fix.speed >= 10 &&
      Math.abs(fix.time - times[i]) < 0.15 &&
      g !== calibratedFix
    ) {
      offsets.push(wrap(fix.heading - compass[i]));
      calibratedFix = g;
    }
  }
  let offset = 0;
  let compassVariance = Infinity;
  if (offsets.length >= 5) {
    const center = meanAngle(offsets);
    offset = center + median(offsets.map((angle) => wrap(angle - center)));
    const scatter = Math.sqrt(
      offsets.reduce((sum, angle) => sum + wrap(angle - offset) ** 2, 0) / offsets.length,
    );
    // Poorly calibrated compass data must not pull a good gyro/GPS estimate off course.
    if (scatter <= 15 * radians) compassVariance = Math.max(10 * radians, scatter) ** 2;
    console.log(
      `  Compass calibration: ${offsets.length} straight fixes, offset ${(offset / radians).toFixed(1)}°, ` +
        `scatter ${(scatter / radians).toFixed(1)}°${Number.isFinite(compassVariance) ? '' : ' (compass rejected)'}`,
    );
  } else console.warn('  Compass ignored: fewer than five straight GPS comparisons');

  let heading = gps[0].heading;
  let variance = (15 * radians) ** 2;
  let previousRate = null;
  g = 0;
  const update = (measurement, noise, gate) => {
    const innovation = wrap(measurement - heading);
    if (Math.abs(innovation) > gate) return;
    const gain = variance / (variance + noise);
    heading += gain * innovation;
    variance *= 1 - gain;
  };
  const headings = [];
  const variances = [];
  const predictions = [];
  const predictedVariances = [];
  for (let i = 0; i < times.length; i++) {
    const dt = i ? times[i] - times[i - 1] : 0;
    const rate = yawRates[i];
    if (Number.isFinite(rate)) {
      heading += ((rate + (previousRate ?? rate)) / 2) * dt;
      variance += gyroNoise ** 2 * dt;
      previousRate = rate;
    } else {
      previousRate = null;
      variance += (10 * radians) ** 2 * dt;
    }
    predictions.push(heading);
    predictedVariances.push(variance);
    while (g < gps.length && gps[g].time <= times[i]) {
      const fix = gps[g++];
      update(fix.heading, Math.max(gpsNoiseFloor, fix.headingAccuracy) ** 2, Math.PI);
    }
    if (compass[i] !== null && Number.isFinite(compassVariance))
      // Compass samples are correlated; scale noise so resampling doesn't multiply confidence.
      update(compass[i] + offset, compassVariance / Math.max(dt, 0.01), 20 * radians);
    headings.push(heading);
    variances.push(variance);
  }
  // Offline Rauch-Tung-Striebel smoothing spreads sparse corrections across gyro predictions.
  for (let i = headings.length - 2; i >= 0; i--) {
    const gain = variances[i] / predictedVariances[i + 1];
    headings[i] += gain * wrap(headings[i + 1] - predictions[i + 1]);
  }
  return headings;
}
