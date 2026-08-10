export type ParsedOllamaModelId = Readonly<{
  immutableModelId: string;
  actualTag: string;
  pinnedDigest: string;
}>;

export type OllamaCatalogTransport = (
  endpoint: string,
) => Promise<Readonly<{ status: number; body: unknown }>>;

const ACTUAL_TAG =
  '[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?';
const IMMUTABLE_ID = new RegExp(`^ollama:(${ACTUAL_TAG})@([a-f0-9]{12})$`);

export function parseOllamaImmutableModelId(
  value: string,
): ParsedOllamaModelId {
  const match = IMMUTABLE_ID.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `immutableModelId must be ollama:<actual-tag>@<12-hex-digest>: ${value}`,
    );
  }
  return {
    immutableModelId: value,
    actualTag: match[1],
    pinnedDigest: match[2],
  };
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${location}: must be an object`);
  return value as Record<string, unknown>;
}

export async function defaultOllamaCatalogTransport(
  endpoint: string,
): Promise<Readonly<{ status: number; body: unknown }>> {
  const response = await fetch(`${endpoint}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(30_000),
  });
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch (error) {
    throw new Error('Ollama /api/tags response is not JSON', { cause: error });
  }
  return { status: response.status, body };
}

/** Verifies exact installed tag/digest bindings before any inference call. */
export async function verifyInstalledOllamaModels(
  endpoint: string,
  immutableModelIds: readonly string[],
  transport: OllamaCatalogTransport = defaultOllamaCatalogTransport,
): Promise<readonly ParsedOllamaModelId[]> {
  const parsed = [...new Set(immutableModelIds)].map(
    parseOllamaImmutableModelId,
  );
  const byTag = new Map<string, ParsedOllamaModelId>();
  for (const model of parsed) {
    const previous = byTag.get(model.actualTag);
    if (previous && previous.pinnedDigest !== model.pinnedDigest)
      throw new Error(`Ollama tag ${model.actualTag}: conflicting digest pins`);
    byTag.set(model.actualTag, model);
  }
  const result = await transport(endpoint);
  if (result.status < 200 || result.status >= 300)
    throw new Error(`Ollama /api/tags HTTP ${result.status}`);
  const root = record(result.body, 'Ollama /api/tags response');
  if (!Array.isArray(root.models))
    throw new Error('Ollama /api/tags response.models: must be an array');
  for (const expected of byTag.values()) {
    const matches = root.models.filter((rawModel) => {
      const model = record(rawModel, 'Ollama /api/tags model');
      return (
        model.name === expected.actualTag || model.model === expected.actualTag
      );
    });
    if (matches.length !== 1)
      throw new Error(
        `Ollama tag ${expected.actualTag}: expected exactly one installed model, found ${matches.length}`,
      );
    const installed = record(matches[0], `Ollama tag ${expected.actualTag}`);
    if (
      typeof installed.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(installed.digest)
    ) {
      throw new Error(
        `Ollama tag ${expected.actualTag}: invalid installed digest`,
      );
    }
    const actualDigest = installed.digest.slice(0, 12);
    if (actualDigest !== expected.pinnedDigest) {
      throw new Error(
        `Ollama tag ${expected.actualTag}: digest drift; expected ${expected.pinnedDigest}, installed ${actualDigest}`,
      );
    }
  }
  return parsed;
}
