import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validatePulseEvent, runExporterConformance } from '../packages/core/src/conformance.js';
import type { PulseExporter } from '../packages/core/src/types.js';
const read = (name: string) => JSON.parse(readFileSync(new URL('../'+name, import.meta.url), 'utf8'));
const ajv = new Ajv2020({strict: true});
(addFormats as unknown as (ajv: Ajv2020) => void)(ajv);
const schema=read('contracts/event-v1.schema.json'); ajv.addSchema(schema);
const valid=ajv.compile(schema);
const events=read('contracts/fixtures/events.json').events;
for (const event of events) { assert.equal(valid(event),true); assert.equal(validatePulseEvent(event),true); }
for (const {event} of read('contracts/fixtures/negative-events.json')) { assert.equal(valid(event),false); assert.equal(validatePulseEvent(event),false); }
const seen = new Set<string>();
// Independent sink uses only the open batch interface; no core factory/private imports.
const exporter: PulseExporter = { export(batch) { const accepted: string[]=[]; const duplicates: string[]=[]; for(const event of batch) { if(seen.has(event.event_id)) duplicates.push(event.event_id); else { seen.add(event.event_id); accepted.push(event.event_id); } } return {accepted,duplicates,rejected:[]}; } };
assert.equal((await runExporterConformance(exporter,events[0])).passed,true);
const ack=ajv.compile(read('contracts/ack-v1.schema.json'));
for (const fixture of read('contracts/fixtures/acknowledgements.json')) assert.equal(ack(fixture.body),fixture.schema_valid,fixture.name);
process.stderr.write('Public conformance passed / Açık sözleşme doğrulaması başarılı\n');
