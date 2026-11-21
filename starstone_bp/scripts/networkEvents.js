// Pure callback boundary: importing controllers never accesses the world.
const discoveries = new Set();
let sourceHandler, powerResolver, powerResolverSteps;
export function subscribeNetworkDiscovery(listener) {
    discoveries.add(listener);
    return () => discoveries.delete(listener);
}
export function notifyNetworkDiscovered(network, dimension) {
    for (const listener of discoveries) listener(network, dimension);
}
let topologyHandler;
export function configureNetworkPersistence({ sourceChanged, resolvePower, resolvePowerSteps, topologyChanged }) {
    sourceHandler = sourceChanged;
    powerResolver = resolvePower;
    powerResolverSteps = resolvePowerSteps;
    topologyHandler = topologyChanged;
}
// Block state at an indexed position changed without an index change.
export function topologyChanged(dimension, location) {
    topologyHandler?.(dimension, location);
}
export function sourceChanged(dimension, location, on) {
    return sourceHandler ? sourceHandler(dimension, location, Boolean(on)) : false;
}
export function resolveNetworkPower(network, dimension) {
    return powerResolver?.(network, dimension);
}
// The same, as a generator (yields between slices of a big network); falls back to the synchronous resolver.
export function* resolveNetworkPowerSteps(network, dimension) {
    if (powerResolverSteps) return yield* powerResolverSteps(network, dimension);
    return powerResolver?.(network, dimension);
}
