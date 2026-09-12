import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('packages/core/package.json',root),'utf8'));
for(const field of ['dependencies','optionalDependencies','peerDependencies'])assert.deepEqual(manifest[field]??{}, {}, 'CORE_RUNTIME_DEPENDENCY');
const result=await build({entryPoints:[new URL('packages/core/dist/index.js',root).pathname],platform:'node',format:'esm',bundle:true,write:false,metafile:true,logLevel:'silent'});
const inputs=Object.keys(result.metafile.inputs);
assert.ok(inputs.length>0);
assert.ok(inputs.every(path=>/packages\/core\/dist\/(index|config|event|exporter|export-result|version)\.js$/.test(path)),'CORE_ROOT_UNEXPECTED_RUNTIME_MODULE');
for(const output of Object.values(result.metafile.outputs))for(const dependency of output.imports)assert.ok(['node:crypto','node:async_hooks'].includes(dependency.path),'CORE_ROOT_IO_OR_EXTERNAL_IMPORT');
for(const name of ['core','mcp','otel']){
 const pkg=JSON.parse(await readFile(new URL('packages/'+name+'/package.json',root),'utf8'));
 assert.equal(pkg.license,'MIT');assert.notEqual(pkg.private,true);
 for(const field of ['dependencies','peerDependencies','optionalDependencies'])for(const dependency of Object.keys(pkg[field]??{}))assert.ok(!dependency.startsWith('@pulse-cloud/'),'PRIVATE_CLOUD_DEPENDENCY');
}
process.stderr.write('Core runtime dependency graph passed / Core runtime bağımlılık grafiği doğrulandı\n');
