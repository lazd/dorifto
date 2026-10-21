export const vehicleSettings = {
  massKg: 1450,
  // Chassis-local meters: +X right, +Y up, +Z forward. Moving Z forward
  // increases front axle load; moving Y down lowers the center of mass.
  centerOfMass: { x: 0, y: 0, z: 0 },
  inertiaKgM2: { pitch: 2400, yaw: 2600, roll: 700 },
  damping: { linear: 0.02, angular: 0.05 },
  collisionMarginM: 0.025,
  spawnHeightM: 0.8,
  suspension: {
    restLengthM: 0.28,
    mountHeightOffsetM: 0.28,
    stiffness: 35,
    dampingRelaxation: 2.8,
    dampingCompression: 4.5,
    maxForceN: 12000,
    bulletRollInfluence: 0.06,
    antiRollStiffness: 12000,
    antiRollMaxLoadFraction: 0.4,
    lateralForceHeightFraction: 0.5,
  },
  brakes: { frontTorqueNm: 1900, rearTorqueNm: 1300, handbrakeTorqueNm: 4500 },
  differential: { coupling: 8, maxTorqueNm: 250 },
  drag: {
    coefficient: 0.31,
    airDensityKgM3: 1.225,
    frontalAreaM2: 2.0, // Estimated projected area, not a measured model silhouette.
    linearResistance: 8,
  },
  engineInertiaKgM2: 0.35,
  wheelInertiaKgM2: 2,
};
