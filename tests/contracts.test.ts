import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
addFormats(ajv);
const schema = read('../contracts/event-v1.schema.json');
ajv.addSchema(schema, 'event-v1.schema.json');
const validEvent = ajv.compile(schema);
const validBatch = ajv.compile(read('../contracts/batch-v1.schema.json'));

describe('strict public wire contract', () => {
  it('keeps the packaged wire schemas identical to the public source contract', () => {
    for (const filename of ['event-v1.schema.json', 'batch-v1.schema.json']) {
      expect(read(`../packages/core/contracts/${filename}`)).toEqual(read(`../contracts/${filename}`));
    }
  });
  it('validates all eight positive events and the batch', () => {
    const batch = read('./fixtures/golden-events.json');
    expect(validBatch(batch), JSON.stringify(validBatch.errors)).toBe(true);
    for (const event of batch.events) expect(validEvent(event), JSON.stringify(validEvent.errors)).toBe(true);
  });
  it('rejects every supplied privacy/tenant/duration/client negative', () => {
    for (const test of read('./fixtures/negative-events.json')) {
      expect(validEvent(test.event), test.name).toBe(false);
    }
  });
  it('rejects extra batch keys, empty and oversized batches', () => {
    const event = read('./fixtures/golden-events.json').events[0];
    expect(validBatch({ schema_version: 1, events: [], organization_id: 'forbidden' })).toBe(false);
    expect(validBatch({ schema_version: 1, events: [] })).toBe(false);
    expect(validBatch({ schema_version: 1, events: Array.from({ length: 101 }, () => event) })).toBe(false);
  });
});
