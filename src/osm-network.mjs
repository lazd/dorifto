export const osmRoadClasses = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
  'service',
  'track',
];

const tags = new Set([
  'highway',
  'oneway',
  'junction',
  'width',
  'service',
  'bridge',
  'tunnel',
  'layer',
  'amenity',
  'parking',
  'stop',
  'direction',
  'stop:direction',
  'type',
]);

export function isOsmNetworkTag(key) {
  return (
    tags.has(key) ||
    ['lanes', 'turn:lanes', 'maxspeed'].some(
      (prefix) => key === prefix || key.startsWith(`${prefix}:`),
    )
  );
}
