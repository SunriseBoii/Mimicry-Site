import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_EDGES, SCREEN_NODES, graphDistance } from '../app/visual-lab/photonic-skin-ps04-m5/topology';
import { isNodeUnlocked } from '../app/visual-lab/photonic-skin-ps04-m5/graph-model';
import { graphPosition, routeBounds, routeNeighborhood, routePoint } from '../app/_ps05/route-graph';
import { SceneNavigation } from '../app/_ps05/scene-navigation';
import { canonicalLayout, type ScrollHost } from '../app/visual-lab/photonic-skin-ps04-m5/scroll-controller';

test('NAV: compact neighborhoods use undirected structural distance, never click reachability',()=>{
 for(const center of SCREEN_NODES){
  const local=routeNeighborhood(center.id),ids=new Set(local.nodes.map(n=>n.id));
  for(const node of SCREEN_NODES)assert.equal(ids.has(node.id),graphDistance(center.id,node.id)<=3);
  assert.ok(local.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));
  assert.ok(local.nodes.length<=7);
 }
 assert.deepEqual(routeNeighborhood('01').nodes.map(n=>n.id),['01','02','03.1','03.2']);
 assert.deepEqual(routeNeighborhood('08').nodes.map(n=>n.id),['06.2','06.3','07','08']);
 assert.equal(isNodeUnlocked('08',{competencies:false,brief:false}),true);
 assert.equal(routeNeighborhood('01').nodes.some(n=>n.id==='08'),false);
});
test('NAV: all three horizontal chains and their orthogonal returns retain canonical coordinates',()=>{
 for(const chapter of ['03','05','06']){
  const row=SCREEN_NODES.filter(n=>n.chapterId===chapter).map(n=>routePoint(n.graph));
  assert.equal(new Set(row.map(p=>p.y)).size,1);
  for(let i=1;i<row.length;i++)assert.ok(row[i].x>row[i-1].x);
 }
 for(const edge of GRAPH_EDGES)for(let i=1;i<edge.path.length;i++){
  const a=routePoint(edge.path[i-1]),b=routePoint(edge.path[i]);assert.ok(a.x===b.x||a.y===b.y);
 }
});
test('NAV: disclosure changes visibility only; full layout and node coordinates do not follow preview',()=>{
 const full=routeBounds('01',true);
 for(const node of SCREEN_NODES){
  assert.deepEqual(routeBounds(node.id,true),full);
  assert.deepEqual(routeNeighborhood(node.id,true),{nodes:SCREEN_NODES,edges:GRAPH_EDGES});
  for(const local of routeNeighborhood(node.id).nodes)assert.equal(local,SCREEN_NODES.find(n=>n.id===local.id));
 }
 assert.equal(isNodeUnlocked('03.2',{competencies:false,brief:false}),false);
 assert.equal(isNodeUnlocked('03.3',{competencies:true,brief:false}),false);
});
function fixture(ready=true){
 let now=0;const snapshots:ReturnType<SceneNavigation['snapshot']>[]=[],layout=canonicalLayout(900,{competencies:true,brief:true});
 const host={scrollY:0,innerWidth:1440,innerHeight:900,scrollTo({top}:ScrollToOptions){this.scrollY=top??0;},addEventListener(){},removeEventListener(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},setTimeout(){return 1},clearTimeout(){}} satisfies ScrollHost;
 const scene=new SceneNavigation({host:()=>host,layout:()=>layout,now:()=>now,notify:()=>snapshots.push(scene.snapshot()),blocked:()=>false,reduced:()=>false,ready:()=>ready});
 return {scene,snapshots,step:(time:number)=>{now=time;scene.tick(now);},drag:(id:typeof SCREEN_NODES[number]['id'])=>{host.scrollY=layout.byId[id]!.start+100;scene.nativeScroll();}};
}
test('NAV: latest preview wins immediately, including reverse movement and a held pause',()=>{
 const {scene,drag,step}=fixture();
 for(const id of ['02','05.7','04','06.3'] as const){drag(id);assert.equal(graphPosition(scene.snapshot()).center,id);assert.equal(scene.snapshot().displayed,'01');}
 step(5000);assert.equal(graphPosition(scene.snapshot()).center,'06.3');assert.equal(scene.snapshot().arrival,0);
});
test('NAV: release retains confirmed position through GPU preparation and changes ring only at arrival',()=>{
 const {scene,drag,step,snapshots}=fixture(false);drag('05.7');scene.release();
 step(1499);assert.equal(scene.snapshot().transition.progress,0);assert.equal(scene.snapshot().displayed,'01');
 assert.deepEqual(graphPosition(scene.snapshot()),{center:'05.7',provisional:true,selecting:false});
 step(1500);step(2100);assert.deepEqual(graphPosition(scene.snapshot()),{center:'05.7',provisional:false,selecting:false});
 assert.ok(snapshots.every(s=>graphPosition(s).center==='05.7'));
});
test('NAV: released choice during an existing transition has no intermediate return in any publish',()=>{
 const {scene,drag,step,snapshots}=fixture();scene.request('02');scene.nativeScroll();step(100);drag('07');scene.release();
 const since=snapshots.length;assert.equal(scene.snapshot().confirmed,'07');assert.equal(scene.snapshot().target,'02');
 step(600);step(1200);assert.equal(scene.snapshot().displayed,'07');assert.equal(scene.snapshot().arrival,2);
 assert.ok(snapshots.slice(since).every(s=>graphPosition(s).center==='07'));
});
test('NAV: returning to the displayed range clears preview without arrival or a new transition',()=>{
 const {scene,drag}=fixture();drag('05.7');drag('01');scene.release();
 assert.deepEqual(graphPosition(scene.snapshot()),{center:'01',provisional:false,selecting:false});assert.equal(scene.snapshot().arrival,0);assert.equal(scene.busy(),false);
});
test('NAV: ordinary commands keep local neighborhood at displayed until actual arrival',()=>{
 const {scene,step}=fixture();scene.request('05.7');step(250);assert.equal(graphPosition(scene.snapshot()).center,'01');step(600);assert.equal(graphPosition(scene.snapshot()).center,'05.7');
});
