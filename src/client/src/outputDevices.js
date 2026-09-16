export function getPreferredBrowserOutputId(defaultOutputIds, browserOutputTargets, fallbackOutputId = "") {
  const outputIds = new Set(
    (Array.isArray(browserOutputTargets) ? browserOutputTargets : [])
      .map(output => output?.id)
      .filter(outputId => typeof outputId === "string")
  );
  const preferredOutputId = (Array.isArray(defaultOutputIds) ? defaultOutputIds : []).find(outputId =>
    outputIds.has(outputId)
  );
  return preferredOutputId ?? fallbackOutputId;
}

export function prioritizeBrowserOutput(outputId, defaultOutputIds, browserOutputTargets) {
  const validOutputIds = (Array.isArray(browserOutputTargets) ? browserOutputTargets : [])
    .map(output => output?.id)
    .filter(candidate => typeof candidate === "string");
  const currentDefaultOutputIds = Array.isArray(defaultOutputIds) ? defaultOutputIds : [];

  if (!validOutputIds.includes(outputId)) {
    return currentDefaultOutputIds.filter(candidate => validOutputIds.includes(candidate));
  }

  return [outputId, ...currentDefaultOutputIds.filter(candidate => candidate !== outputId && validOutputIds.includes(candidate))];
}
