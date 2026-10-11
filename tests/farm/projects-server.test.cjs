/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS module loader isolates server-only dependencies for authorization tests. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const ts=require('typescript');
const id='00000000-0000-4000-8000-000000000003';
let user={id:'verified-owner'};let calls=[];
const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{id},error:null};},from:()=>({select:()=>({eq:async(key,value)=>{calls.push({key,value});return {data:[],error:null};}})})};
const file=path.resolve('src/lib/farm/projects-server.ts');const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));
loaded.require=(name)=>name==='server-only'?{}:name==='@/lib/supabase/server'?{getUser:async()=>user}:name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:require(name);
loaded._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const api=loaded.exports;
test('signed-out calls cannot reach privileged reads or RPCs',async()=>{
 user=null;calls=[];assert.deepEqual(await api.loadOwnerProjects(),[]);
 await assert.rejects(api.runProjectCommand('buy',{requestId:id,leaderId:id,catalogueId:'garden'}),/เข้าสู่ระบบ/);assert.equal(calls.length,0);user={id:'verified-owner'};
});
test('reads and commands derive their owner from the verified session',async()=>{
 calls=[];await api.loadOwnerProjects();assert.deepEqual(calls[0],{key:'user_id',value:'verified-owner'});
 await api.runProjectCommand('buy',{requestId:id,leaderId:id,catalogueId:'garden',userId:'attacker',passed:true});
 assert.equal(calls[1].args.p_user,'verified-owner');assert.equal('passed' in calls[1].args,false);
});
test('unknown commands and malformed teams never reach SQL',async()=>{
 calls=[];await assert.rejects(api.runProjectCommand('checkpoint_result',{projectId:id,passed:true}));
 await assert.rejects(api.runProjectCommand('team',{projectId:id,leaderId:id,helperIds:['invalid']}));assert.equal(calls.length,0);
});
