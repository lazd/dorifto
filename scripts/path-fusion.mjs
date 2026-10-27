const headingNoise = (4 * Math.PI) / 180;

/** Road-relative lateral Kalman filter and offline smoother. Positive offset is route-left. */
export function fuseRoadOffsets(times, speeds, headings, roadHeadings, fixes, width, reverse) {
  const limit = Math.max(0, width / 2 - 1);
  const bound = (value) => Math.max(-limit, Math.min(limit, value));
  const lane = ((reverse ? 1 : -1) * width) / 4;
  const laneVariance = (width / 8) ** 2;
  const laneSign = reverse ? 1 : -1;
  let offset = lane;
  let variance = laneVariance;
  let fixIndex = 0;
  let rejected = 0;
  let crossingFixes = 0;
  let lastCrossingFix = -Infinity;
  let crossings = 0;
  const estimates = [];
  const variances = [];
  const predictions = [];
  const predictedVariances = [];
  const update = (measurement, noise) => {
    const gain = variance / (variance + noise);
    offset += gain * (measurement - offset);
    variance *= 1 - gain;
  };
  for (let i = 0; i < times.length; i++) {
    const dt = i ? times[i] - times[i - 1] : 0;
    const lateralSpeed = speeds[i] * Math.sin(headings[i] - roadHeadings[i]);
    offset += lateralSpeed * dt;
    variance += ((speeds[i] * headingNoise) ** 2 + 0.25) * dt;
    predictions.push(offset);
    predictedVariances.push(variance);
    while (fixIndex < fixes.length && fixes[fixIndex].time <= times[i]) {
      const fix = fixes[fixIndex++];
      const noise = fix.accuracy ** 2;
      // Require a two-sigma GPS interval wholly across the centerline and on the road.
      // Several consecutive fixes must agree; gyro integration is not crossing evidence.
      const oncoming = -laneSign * fix.offset;
      const crossing = oncoming - 2 * fix.accuracy > 0 && oncoming + 2 * fix.accuracy < width / 2;
      crossingFixes = crossing ? (fix.time - lastCrossingFix <= 2 ? crossingFixes + 1 : 1) : 0;
      if (crossing) lastCrossingFix = fix.time;
      if (crossingFixes === 3) crossings++;
      if (
        (!crossing || crossingFixes >= 3) &&
        Math.abs(fix.offset - offset) <= 3 * Math.sqrt(variance + noise)
      )
        update(fix.offset, noise);
      else rejected++;
    }
    // Treat lane position as a prior, not an exact rail. Its uncertainty is time-scaled
    // so resampling doesn't strengthen it. Reliable crossings temporarily remove the prior.
    const crossingSupported = crossingFixes >= 3 && times[i] - lastCrossingFix <= 2;
    if (dt && !crossingSupported) update(lane, laneVariance / dt);
    // The road constrains only the edges, not the lane center.
    if (dt && Math.abs(offset) > limit) update(bound(offset), 1 / dt);
    offset = bound(offset);
    estimates.push(offset);
    variances.push(variance);
  }
  for (let i = estimates.length - 2; i >= 0; i--) {
    const gain = variances[i] / predictedVariances[i + 1];
    estimates[i] = bound(estimates[i] + gain * (estimates[i + 1] - predictions[i + 1]));
  }
  // GPS/road errors are correlated over multiple samples, not independent 10 Hz movements.
  const sigma = 0.6;
  let first = 0;
  const smoothed = times.map((time) => {
    while (times[first] < time - 3 * sigma) first++;
    let sum = 0;
    let weights = 0;
    for (let j = first; j < times.length; j++) {
      if (times[j] > time + 3 * sigma) break;
      const weight = Math.exp(-0.5 * ((times[j] - time) / sigma) ** 2);
      sum += weight * estimates[j];
      weights += weight;
    }
    return sum / weights;
  });
  if (rejected) console.warn(`  Rejected ${rejected} lateral GPS outliers`);
  console.log(`  Lane prior relaxed for ${crossings} GPS-supported crossing sequences`);
  console.log(
    `  Fused road offsets: ${Math.min(...smoothed).toFixed(1)} to ${Math.max(...smoothed).toFixed(1)} m from center`,
  );
  return smoothed;
}
