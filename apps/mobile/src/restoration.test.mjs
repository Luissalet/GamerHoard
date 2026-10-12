import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {selectBackend} from './lib/backendMode.ts';
import {buildContext} from './copilotContext.ts';

const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(import.meta.url);
const ts=require('typescript');
const emptySeed={profile:{handle:null},shows:[],movies:[],recent:[],lists:[],reviews:[],badges:[]};
function modules(stubs={}) {
  const cache=new Map();
  function load(file) {
    file=path.resolve(file);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    const imports=name=>{
      if(name in stubs)return stubs[name];
      if(name.endsWith('seed.json'))return emptySeed;
      if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));
      return require(name);
    };
    new Function('exports','require','module',code)(module.exports,imports,module);
    return module.exports;
  }
  return name=>load(path.join(import.meta.dirname,name));
}
function browserStorage() {
  const rows=new Map();
  return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k),key:i=>[...rows.keys()][i]??null,get length(){return rows.size}};
}

test('historical Supabase, native local and browser memory coexist with shared web mode',()=>{
  assert.equal(selectBackend('supabase','web'),'supabase');
  assert.equal(selectBackend('supabase','ios'),'supabase');
  assert.equal(selectBackend('local','web'),'local');
  assert.equal(selectBackend('memory','web'),'memory');
  assert.equal(selectBackend('local','android'),'local');
  assert.equal(selectBackend('','web'),'localapi');
  assert.equal(selectBackend('localapi','ios'),'local');
});

test('restored list context reads a real list and keeps pending rename; missing list stays empty',()=>{
  const reg={editor:{kind:'list',fields:{name:'Pending name'}}};
  const ctx=buildContext({pathname:'/list/17',list:{id:17,name:'Saved name',item_count:2,is_public:0},backend:'localapi',registered:reg});
  assert.equal(ctx.active_objects[0].object_id,'17');
  assert.equal(ctx.view.editor.fields.name,'Pending name');
  assert.equal(ctx.view.backend,'localapi');
  assert.deepEqual(buildContext({pathname:'/list/new'}).active_objects,[]);
  assert.deepEqual(buildContext({pathname:'/list/999',list:null}).active_objects,[]);
});

test('original browser collections persist list/movie changes across adapter instances',async()=>{
  const old=globalThis.localStorage;globalThis.localStorage=browserStorage();
  try {
    const {MemorySource}=modules()('db/memory.ts');
    const data=new MemorySource();await data.ready();
    const id=await data.createList('Original list');
    await data.addMovie({uuid:'private-movie',title:'Private movie',watched:false});
    await data.addToList(id,{kind:'movie',uuid:'private-movie'});
    await data.renameList(id,'Renamed list');
    const reopened=new MemorySource();await reopened.ready();
    assert.equal((await reopened.getListById(id)).name,'Renamed list');
    assert.equal((await reopened.getListItems(id))[0].title,'Private movie');
    await reopened.removeFromList(id,{kind:'movie',uuid:'private-movie'});
    assert.equal((await reopened.getListItems(id)).length,0);
    await reopened.deleteList(id);assert.equal(await reopened.getListById(id),null);
  } finally {globalThis.localStorage=old}
});

test('shared native games and original browser lists both write and survive reopening',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gamer-restoration-'));
  const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
  const env={HOARD_EVENTS:'0',HOARD_HUB_URL:'http://127.0.0.1:1',HOARD_FAUSTUS_URL:'http://127.0.0.1:1'};
  process.env.HOARD_EVENTS='0';process.env.HOARD_HUB_URL='http://127.0.0.1:1';process.env.HOARD_FAUSTUS_URL='http://127.0.0.1:1';
  const {createApp}=await import(pathToFileURL(path.join(root,'server/app.mjs')));
  const {app,library}=createApp({libraryPath:path.join(dir,'library.json'),dataDir:dir,serveStatic:false,env});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  globalThis.fetch=(url,...args)=>{
    const target=String(url).startsWith('/')?base+url:String(url);
    if(new URL(target).origin!==base)throw Error('Private test refuses an external connection');
    return oldFetch(target,...args);
  };
  globalThis.localStorage=browserStorage();
  try {
    const response=await fetch('/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Native game',rawgId:17,state:'playing'})});
    assert.equal(response.status,201);
    const {LocalApiSource}=modules()('db/localapi.ts');
    const data=new LocalApiSource();await data.ready();
    const id=await data.createList('Shared game list');
    await data.addToList(id,{kind:'series',tvdb:17});
    assert.equal((await data.getListItems(id))[0].title,'Native game');
    await data.setShowNotes(17,'Persisted through native API');
    const reopen=new LocalApiSource();await reopen.ready();
    assert.equal((await reopen.getListById(id)).name,'Shared game list');
    assert.equal((await reopen.getShowById(17)).notes,'Persisted through native API');
    assert.ok(fs.readFileSync(path.join(dir,'library.json'),'utf8').includes('Persisted through native API'));
    await assert.rejects(reopen.setProgress(17,1,1,1),/DLC completion/);
    await reopen.clearData();
    assert.equal((await reopen.getLists()).length,0);
    assert.equal((await reopen.getShows()).length,1,'clearing browser collections preserves shared games');
    const afterClear=await reopen.createList('New after clear');
    const third=new LocalApiSource();await third.ready();
    assert.equal((await third.getListById(afterClear)).name,'New after clear');
  } finally {
    globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage;
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('restored Supabase adapter reads and writes the selected profile without changing another profile',async()=>{
  // Contract fixture for the historical client, not a real cloud database.
  const tables={
    app_profile:[{profile_id:'private-user',handle:'QA profile'}],
    app_shows:[{profile_id:'private-user',tvdb_id:17,title:'Cloud game',state:'watching',notes:'old'},
      {profile_id:'other-user',tvdb_id:17,title:'Other game',state:'watching',notes:'unchanged'}],
    app_lists:[],
  };
  function query(table) {
    const filters=[];let operation='select',payload,single=false;
    const builder={
      select:()=>builder,order:()=>builder,range:()=>builder,
      eq:(key,value)=>{filters.push([key,value]);return builder},
      update:value=>{operation='update';payload=value;return builder},
      upsert:value=>{operation='upsert';payload=value;return builder},
      insert:value=>{operation='insert';payload=value;return builder},
      single:()=>{single=true;return builder},maybeSingle:()=>{single=true;return builder},
      then(resolve,reject) {
        const rows=tables[table]??(tables[table]=[]);
        if(operation==='insert')rows.push({id:rows.length+1,...payload});
        if(operation==='upsert'&&!rows.some(r=>r.profile_id===payload.profile_id))rows.push({...payload});
        const selected=rows.filter(row=>filters.every(([key,value])=>row[key]===value));
        if(operation==='update')for(const row of selected)Object.assign(row,payload);
        return Promise.resolve({data:single?selected.at(-1)??null:selected,error:null}).then(resolve,reject);
      },
    };return builder;
  }
  const client={auth:{getUser:async()=>({data:{user:{id:'private-user'}},error:null})},from:query};
  const {SupabaseSource}=modules({'../lib/supabase':{supabase:client},'../i18n':{__esModule:true,default:{t:key=>key}}})('db/supabase.ts');
  const data=new SupabaseSource();await data.ready();
  assert.equal((await data.getProfile()).handle,'QA profile');
  assert.equal((await data.getShows())[0].title,'Cloud game');
  await data.setShowNotes(17,'New cloud notes');
  await data.setShowState(17,'archived');
  assert.equal(tables.app_shows[0].notes,'New cloud notes');
  assert.equal(tables.app_shows[0].state,'archived');
  assert.equal(tables.app_shows[1].notes,'unchanged');
  assert.equal(tables.app_shows[1].state,'watching');
  const id=await data.createList('Cloud list');
  assert.equal(id,1);
  assert.equal(tables.app_lists[0].profile_id,'private-user');
});
