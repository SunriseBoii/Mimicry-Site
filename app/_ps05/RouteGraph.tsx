'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { graphDistance, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { isNodeUnlocked, type UnlockFlags } from '../visual-lab/photonic-skin-ps04-m5/graph-model';
import { graphPosition, routeBounds, routeLabel, routeLabelPlacement, routeNeighborhood, routePoint, ROUTE_GRAPH, type GraphPosition } from './route-graph';
import s from './ps05.module.css';

export function RouteGraph({scene,unlock,navigate}:{scene:GraphPosition;unlock:UnlockFlags;navigate:(id:ScreenNodeId)=>void}) {
 const [expanded,setExpanded]=useState(false),[mobile,setMobile]=useState(false);
 const root=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null),viewport=useRef<HTMLDivElement>(null);
 const {center,provisional,selecting}=graphPosition(scene);
 const column=mobile?ROUTE_GRAPH.mobileColumn:ROUTE_GRAPH.column;
 const local=routeBounds(center,false,column),full=routeBounds(center,true,column);
 const bounds=expanded?full:local;
 const {nodes,edges}=routeNeighborhood(center,expanded);
 useEffect(()=>{
  const query=matchMedia('(max-width:600px)'),sync=()=>setMobile(query.matches);sync();
  query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);
 },[]);
 useEffect(()=>{
  if(!expanded)return;
  const close=(restore:boolean)=>{setExpanded(false);if(restore)trigger.current?.focus({preventScroll:true});};
  const outside=(event:PointerEvent)=>{
   // Native scrollbar events may be retargeted to <html>. They are selection, not dismissal.
   if(event.clientX>=document.documentElement.clientWidth||event.clientY>=document.documentElement.clientHeight)return;
   if(!root.current?.contains(event.target as Node))close(false);
  };
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close(true);}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[expanded]);
 useEffect(()=>{
  // The compact viewport never inherits a full-map scroll offset.
  if(!expanded&&viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}
 },[expanded]);
 const toggle=()=>{setExpanded(!expanded);if(expanded)trigger.current?.focus({preventScroll:true});};
 const choose=(id:ScreenNodeId,button:HTMLButtonElement)=>{
  if(!isNodeUnlocked(id,unlock))return;
  setExpanded(false);
  if(id===scene.displayed){trigger.current?.focus({preventScroll:true});return;}
  // Release the map's focus so the existing arrival handler owns focus transfer.
  button.blur();navigate(id);
 };
 const style={'--map-width':`${bounds.width}px`,'--map-height':`${bounds.height}px`,'--map-duration':`${ROUTE_GRAPH.duration}ms`} as CSSProperties;
 return <nav ref={root} className={s.routeGraph} style={style} data-qa="m4-graph" data-expanded={expanded} data-center={center} data-provisional={provisional} data-selecting={selecting} aria-label="Карта экранов">
  <button ref={trigger} type="button" className={s.mapToggle} aria-label={expanded?'Свернуть карту':'Показать всю карту'} title={expanded?'Свернуть карту':'Показать всю карту'} aria-expanded={expanded} aria-controls="route-map" onClick={toggle}>
   <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
  </button>
  <div ref={viewport} id="route-map" className={s.mapViewport} data-scene-input="local" role="group" aria-label={expanded?'Полная карта':'Ближайшие экраны'} tabIndex={expanded?0:undefined}>
   <div className={s.mapSpace} style={{width:bounds.width,height:bounds.height}}>
    <div className={s.mapPlane} style={{transform:`translate(${-bounds.x}px, ${-bounds.y}px)`}}>
     <svg className={s.mapEdges} width="1" height="1" aria-hidden="true">
      {edges.map(edge=>{
       const distance=Math.max(graphDistance(center,edge.from),graphDistance(center,edge.to));
       const d=edge.path.map((p,i)=>{const {x,y}=routePoint(p,column);return `${i?'L':'M'}${x} ${y}`;}).join(' ');
       return <path key={`${edge.from}-${edge.to}`} data-edge={`${edge.from}-${edge.to}`} d={d} fill="none" stroke="currentColor" strokeWidth="1" style={{opacity:expanded?.36:[.7,.52,.3,.16][distance]}}/>;
      })}
     </svg>
     {nodes.map(node=>{
      const unlocked=isNodeUnlocked(node.id,unlock),selected=node.id===center,displayed=node.id===scene.displayed;
      const distance=graphDistance(center,node.id),p=routePoint(node.graph,column),label=routeLabel(node.id);
      const hint=unlocked?'':node.id==='03.2'?' — сначала выберите задачу':' — сначала подтвердите состав';
      return <button key={node.id} type="button" className={s.mapNode} style={{left:p.x,top:p.y,'--ring-opacity':expanded?1:[1,.78,.5,.3][distance]} as CSSProperties} data-hit={node.id} data-selected={selected} data-preview={selected&&provisional} data-displayed={displayed} data-placement={routeLabelPlacement(node.id)} data-distance={distance} disabled={!unlocked} aria-current={displayed?'step':undefined} aria-label={label+hint} title={label+hint} onClick={event=>choose(node.id,event.currentTarget)}>
       <span className={s.mapDot} aria-hidden="true"/>
       <span className={s.mapLabel}><span aria-hidden="true" className={s.mapLabelReserve}>{label}</span><span>{label}</span></span>
      </button>;
     })}
    </div>
   </div>
  </div>
 </nav>;
}
