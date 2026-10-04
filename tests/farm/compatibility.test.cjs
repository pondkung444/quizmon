const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function component(relative) {
  const filename = path.resolve(relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports.default;
}
const FarmRoster = component('src/components/farm/FarmRoster.tsx');
const PetActions = component('src/components/CollectionPetActions.tsx');
test('the residence lists every owned individual, including duplicate species', () => {
  const html = renderToStaticMarkup(React.createElement(FarmRoster,{pets:[
    {id:'one',nickname:'ตัวแรก',speciesName:'ช้างพฤกษ์',imagePath:'/pets/egg2_stage4_balance_B.png'},
    {id:'two',nickname:'ตัวที่สอง',speciesName:'ช้างพฤกษ์',imagePath:'/pets/egg2_stage4_balance_B.png'}
  ]}));
  assert.ok(html.includes('href="/collection/one"'));
  assert.ok(html.includes('href="/collection/two"'));
  assert.ok(html.includes('ตัวแรก'));
  assert.ok(html.includes('ตัวที่สอง'));
});
test('existing detail actions retain rename, adventure and raid entry/resume/reward paths', () => {
  const render = (dungeonState,raidState) => renderToStaticMarkup(React.createElement(PetActions,{petId:'owned-qmon',dungeonState,raidState}));
  const ready = render({status:'ready'},{status:'ready'});
  assert.ok(ready.includes('href="/collection/owned-qmon/name"'));
  assert.ok(ready.includes('href="/adventure?pet=owned-qmon"'));
  assert.ok(ready.includes('href="/raid?pet=owned-qmon"'));
  const traveling = render({status:'own_traveling'},{status:'own_run'});
  assert.ok(traveling.includes('href="/adventure"'));
  assert.ok(traveling.includes('href="/raid"'));
  const claim = render({status:'own_claimable'},{status:'no_ticket'});
  assert.ok(claim.includes('รับของจากผจญภัย'));
  assert.ok(claim.includes('href="/adventure"'));
  assert.ok(!claim.includes('href="/raid?'));
  const blocked = render({status:'blocked_other_pet',otherPetName:'ตัวอื่น'},{status:'blocked_other_pet',otherPetName:'ตัวอื่น'});
  assert.ok(!blocked.includes('href="/adventure?'));
  assert.ok(!blocked.includes('href="/raid?'));
});
