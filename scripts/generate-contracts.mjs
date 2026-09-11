import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
async function output(path, text) {
  if (check) {
    if (await readFile(new URL(path, root), 'utf8') !== text) throw new Error('GENERATED_CONTRACT_DRIFT');
  } else await writeFile(new URL(path, root), text);
}
function type(schema) {
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(' | ');
  if (schema.anyOf) return schema.anyOf.map(type).join(' | ');
  if (schema.type === 'array') return `readonly (${type(schema.items)})[]`;
  if (schema.type === 'object') return '{\n' + Object.entries(schema.properties).map(([key, value]) => `  readonly ${key}${schema.required?.includes(key) ? '' : '?'}: ${type(value)};`).join('\n') + '\n}';
  if (['string','number','boolean','null'].includes(schema.type)) return schema.type;
  throw new Error('UNSUPPORTED_SCHEMA_TYPE');
}
const event = await read('contracts/event-v1.schema.json');
// JSON Schema owns required fields and unions. Cross-field constraints remain schema validation.
await output('packages/core/src/event.generated.ts', '// Generated from contracts/event-v1.schema.json; do not edit.\nexport type PulseEvent = '+type(event)+';\n');
for (const filename of ['event-v1.schema.json','batch-v1.schema.json','ack-v1.schema.json']) {
  await output('packages/core/contracts/'+filename, JSON.stringify(await read('contracts/'+filename),null,2)+'\n');
}
for (const name of ['core','mcp']) {
  const manifest = await read('packages/'+name+'/package.json');
  await output('packages/'+name+'/src/version.ts', '// Generated deterministically from package.json; do not edit.\nexport const PACKAGE_VERSION = '+JSON.stringify(manifest.version)+' as const;\n');
}
