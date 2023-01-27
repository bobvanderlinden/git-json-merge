const { promises: fs } = require("fs");
const xdiff = require("xdiff");
const YAML = require("js-yaml");
const TOML = require("@iarna/toml");

const encoding = "utf-8";

const formats = {
  json: {
    parse: (text) => JSON.parse(text),
    stringify: (value) => JSON.stringify(value, null, 2),
  },
  yaml: {
    parse: (text) => YAML.load(text),
    stringify: (value) => YAML.dump(value),
  },
  toml: TOML,
};

/**
 * Add __id__ fields recursively. The value of __id__ is the result of identifierFn.
 */
function addIdentifiers(value, identifierFn) {
  if (value === null) {
    return value;
  }
  if (value instanceof Array) {
    return value.map((value) => {
      if (value === null || typeof value !== "object") {
        return value;
      }
      return {
        __id__: identifierFn(value),
        ...addIdentifiers(value, identifierFn),
      };
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        addIdentifiers(value, identifierFn),
      ])
    );
  }
  return value;
}

/**
 * Remove __id__ fields that were previously added by addIdentifiers.
 */
function removeIdentifiers(value) {
  if (value === null) {
    return value;
  }
  if (value instanceof Array) {
    return value.map((value) => {
      if (value === null || typeof value !== "object") {
        return value;
      }
      if ("__id__" in value) {
        const { __id__, ...strippedValue } = value;
        return removeIdentifiers(strippedValue);
      }
      return removeIdentifiers(value);
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        removeIdentifiers(value),
      ])
    );
  }
  return value;
}

async function readFormattedFile({ file, format }) {
  const content = await fs.readFile(file, { encoding });
  return format.parse(content);
}

async function writeFormattedFile({ file, format, content }) {
  await fs.writeFile(file, format.stringify(content), { encoding });
}

async function mergeFile({
  oursFile,
  baseFile,
  theirsFile,
  format,
  identifierFn,
}) {
  const [ours, base, theirs] = await Promise.all(
    [oursFile, baseFile, theirsFile].map((file) =>
      readFormattedFile({ file, format })
    )
  );
  const mergedContent = merge({ ours, base, theirs, identifierFn });
  await writeFormattedFile({ file: oursFile, format, content: mergedContent });
}

function merge({ ours, base, theirs, identifierFn }) {
  ours = addIdentifiers(ours, identifierFn);
  base = addIdentifiers(base, identifierFn);
  theirs = addIdentifiers(theirs, identifierFn);
  const basicMergedResult = basicMerge({ ours, base, theirs });
  return removeIdentifiers(basicMergedResult);
}

function basicMerge({ ours, base, theirs }) {
  const diff = xdiff.diff3(ours, base, theirs);

  if (diff) {
    return xdiff.patch(base, diff);
  }

  return base;
}

module.exports = {
  formats,
  mergeFile,
  merge,
};
