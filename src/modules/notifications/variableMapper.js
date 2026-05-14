function getPath(obj, path) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function buildVariables(payload, variableMap) {
  const merged = { ...(payload || {}) };

  if (variableMap && typeof variableMap === "object") {
    for (const [templateVar, sourcePath] of Object.entries(variableMap)) {
      const resolved = getPath(payload, sourcePath);
      if (resolved !== undefined) {
        merged[templateVar] = resolved;
      }
    }
  }

  return merged;
}

module.exports = {
  buildVariables,
  getPath,
};
