import { GRAPH_EDGES, SCREEN_NODES, SCREEN_NODE_BY_ID, graphDistance, type GraphPoint, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import type { SceneSnapshot } from './scene-navigation';

/** Presentation only. Coordinates/edges remain owned by the canonical topology. */
export const ROUTE_GRAPH = { radius:3, column:40, mobileColumn:29, row:64, labelWidth:64, padding:8, duration:210 } as const;
export const routeLabel=(id:ScreenNodeId)=>id==='01'?'Главная':id==='03.2'?'Состав':SCREEN_NODE_BY_ID[id].title;
export type GraphPosition = Pick<SceneSnapshot,'displayed'|'preview'|'confirmed'|'selecting'>;
export function graphPosition(scene:GraphPosition) {
 const center=scene.preview??scene.confirmed??scene.displayed;
 return {center,provisional:scene.preview!==null||scene.confirmed!==null,selecting:scene.selecting};
}
export function routeNeighborhood(center:ScreenNodeId,expanded=false) {
 const nodes=SCREEN_NODES.filter(node=>expanded||graphDistance(center,node.id)<=ROUTE_GRAPH.radius);
 const ids=new Set(nodes.map(node=>node.id));
 return {nodes,edges:GRAPH_EDGES.filter(edge=>ids.has(edge.from)&&ids.has(edge.to))};
}
export function routePoint(point:GraphPoint,column:number=ROUTE_GRAPH.column) {return {x:point.x*column,y:point.y*ROUTE_GRAPH.row};}
/** Horizontal roots lift their label clear of both incoming vertical and outgoing horizontal edges. */
export function routeLabelPlacement(id:ScreenNodeId) {
 const node=SCREEN_NODE_BY_ID[id];
 return node.axis==='vertical'?'side':node.chapterIndex===0?'root':node.chapterIndex!%2?'below':'above';
}
export function routeBounds(center:ScreenNodeId,expanded=false,column:number=ROUTE_GRAPH.column) {
 const {nodes,edges}=routeNeighborhood(center,expanded);
 const points=[...nodes.map(n=>n.graph),...edges.flatMap(e=>e.path)].map(p=>routePoint(p,column));
 // Fixed label/touch reserves; changing weight never changes geometry.
 const left=Math.min(...nodes.map(n=>routePoint(n.graph,column).x-(n.graph.x===0?14:ROUTE_GRAPH.labelWidth/2)));
 const top=Math.min(...nodes.map(n=>routePoint(n.graph,column).y-({side:22,root:56,above:38,below:22}[routeLabelPlacement(n.id)])));
 const right=Math.max(...nodes.map(n=>routePoint(n.graph,column).x+(n.graph.x===0?ROUTE_GRAPH.labelWidth+16:ROUTE_GRAPH.labelWidth/2)));
 const bottom=Math.max(...points.map(p=>p.y+22),...nodes.map(n=>routePoint(n.graph,column).y+(routeLabelPlacement(n.id)==='below'?38:22)));
 return {x:left-ROUTE_GRAPH.padding,y:top-ROUTE_GRAPH.padding,width:right-left+2*ROUTE_GRAPH.padding,height:bottom-top+2*ROUTE_GRAPH.padding};
}
