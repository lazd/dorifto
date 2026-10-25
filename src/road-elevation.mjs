/** Reject short DEM obstacles (bridges, vegetation, cliffs) mistaken for roadway. */
export function cleanRoadElevation(heights, spacing) {
  const result = [...heights];
  if (!(spacing > 0)) throw new Error('Road elevation spacing must be positive');
  const grade = (i) => (heights[i + 1] - heights[i]) / spacing;
  for (let i = 0; i < heights.length - 2; i++) {
    if (grade(i) <= 0.35) continue;
    let start = i;
    while (start > 0 && grade(start - 1) > 0.1 && (i - start) * spacing < 100) start--;
    let falling = false;
    for (let end = i + 1; end < heights.length && (end - start) * spacing <= 300; end++) {
      if (end < heights.length - 1 && grade(end) < -0.35) falling = true;
      if (!falling || Math.abs(heights[end] - heights[start]) > (end - start) * spacing * 0.15)
        continue;
      if (end < heights.length - 1 && grade(end) < -0.1) continue;
      let peak = 0;
      for (let j = start + 1; j < end; j++) {
        const baseline =
          heights[start] + ((heights[end] - heights[start]) * (j - start)) / (end - start);
        peak = Math.max(peak, heights[j] - baseline);
      }
      if (peak < 10) break;
      for (let j = start + 1; j < end; j++)
        result[j] =
          heights[start] + ((heights[end] - heights[start]) * (j - start)) / (end - start);
      i = end;
      break;
    }
  }
  return result;
}
