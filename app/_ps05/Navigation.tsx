'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GRAPH_EDGES, HEADER_LINKS, SCREEN_NODES, SCREEN_NODE_BY_ID, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { isNodeUnlocked, type UnlockFlags } from '../visual-lab/photonic-skin-ps04-m5/graph-model';
import s from './ps05.module.css';

/** Delayed pointer intent; click pins the disclosure, Escape returns focus. */
function useDisclosure() {
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const pinned=useRef(false);
 const clear=()=>{if(timer.current)clearTimeout(timer.current)};
 const close=(restore=false)=>{clear();pinned.current=false;if(restore)trigger.current?.focus();setOpen(false)};
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)){pinned.current=false;setOpen(false)}};
  document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('pointerdown',outside);if(timer.current)clearTimeout(timer.current)};
 },[]);
 return {open,root,trigger,close,events:{
  onPointerEnter:(e:React.PointerEvent)=>{if(e.pointerType!=='mouse'||!matchMedia('(hover:hover)').matches)return;clear();timer.current=setTimeout(()=>setOpen(true),240)},
  onPointerLeave:()=>{clear();if(!pinned.current)timer.current=setTimeout(()=>{if(!root.current?.contains(document.activeElement))setOpen(false)},360)},
  onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true)}},
  onBlur:(e:React.FocusEvent)=>{if(!e.currentTarget.contains(e.relatedTarget as Node))close()},
 },reveal:()=>setOpen(true),toggle:()=>{clear();pinned.current=!open;setOpen(!open)}};
}

export function Header({active,navigate,theme,onTheme,reduced,manualReduced,onMotion}:{active:ScreenNodeId;navigate:(id:ScreenNodeId)=>void;theme:'light'|'dark';onTheme:(theme:'light'|'dark')=>void;reduced:boolean;manualReduced:boolean;onMotion:()=>void}) {
 const {open,root,trigger,close,events,toggle}=useDisclosure();
 const go=(id:ScreenNodeId)=>{close();navigate(id)};
 return <header ref={root} className={s.header} data-open={open} data-qa="m4-header" {...events}>
  <a href="#screen-01" className={s.wordmark} onClick={e=>{e.preventDefault();go('01')}}>mimicry<span>group</span><i aria-hidden="true"/></a>
  <button ref={trigger} type="button" className={s.menuToggle} aria-expanded={open} aria-controls="ps05-nav" onClick={toggle}>{open?'Закрыть меню':'Меню'}<span aria-hidden="true">{open?'−':'+'}</span></button>
  <nav id="ps05-nav" className={s.nav} hidden={!open} aria-label="Разделы сайта">
   <div className={s.navLinks}>{HEADER_LINKS.map((item,index)=><a key={item.group} href={`#screen-${item.target}`} aria-current={SCREEN_NODE_BY_ID[active].headerGroup===item.group?'page':undefined} onClick={e=>{e.preventDefault();go(item.target)}}><span className={s.meta}>0{index+1}</span>{item.label}<span aria-hidden="true">↗</span></a>)}</div>
   <div className={s.navSettings}><button type="button" onClick={()=>onTheme(theme==='light'?'dark':'light')} aria-label={theme==='light'?'Тёмная тема':'Светлая тема'}><span aria-hidden="true">{theme==='light'?'◐':'◑'}</span>{theme==='light'?'Тёмная тема':'Светлая тема'}</button><button type="button" onClick={onMotion} aria-pressed={reduced}>{manualReduced?'Движение: минимум':'Меньше движения'}<span aria-hidden="true">{reduced?'✓':'↔'}</span></button></div>
  </nav>
 </header>;
}

const label=(id:ScreenNodeId)=>id==='01'?'Главная':id==='03.3'?'Ваш запрос':SCREEN_NODE_BY_ID[id].title;
export function RouteGraph({active,unlock,navigate}:{active:ScreenNodeId;unlock:UnlockFlags;navigate:(id:ScreenNodeId)=>void}) {
 const {open,root,trigger,close,events,toggle,reveal}=useDisclosure();
 const point=(p:{x:number;y:number})=>({x:20+p.x*40,y:20+p.y*24});
 return <nav ref={root} className={s.graph} data-open={open} data-qa="m4-graph" aria-label="Прогресс маршрута, ортогональный граф экранов" {...events}>
  <button type="button" ref={trigger} className={s.graphToggle} aria-expanded={open} aria-controls="route-map" onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))reveal()}} onClick={toggle}><span aria-hidden="true" className={s.currentDot}/><span>{active} / {label(active)}</span><span aria-hidden="true">{open?'−':'+'}</span></button>
  <div id="route-map" className={s.graphPanel} hidden={!open}>
   <p className={s.eyebrow}>Маршрут / 18 экранов</p>
   <svg viewBox="0 0 280 232" className={s.routeDiagram} aria-hidden="true">{GRAPH_EDGES.map(edge=><path key={`${edge.from}-${edge.to}`} d={edge.path.map((p,i)=>{const q=point(p);return `${i?'L':'M'}${q.x} ${q.y}`}).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.2"/>)}{SCREEN_NODES.map(node=>{const p=point(node.graph);return <circle key={node.id} cx={p.x} cy={p.y} r={active===node.id?5:3.5} fill={active===node.id?'currentColor':'var(--surface)'} stroke="currentColor" strokeWidth="1.3" strokeDasharray={isNodeUnlocked(node.id,unlock)?undefined:'2 2'}/>})}</svg>
   <div className={s.graphLinks}>{SCREEN_NODES.map(node=>{const unlocked=isNodeUnlocked(node.id,unlock);return <button type="button" key={node.id} data-hit={node.id} data-locked={!unlocked} aria-current={active===node.id?'step':undefined} disabled={!unlocked} title={unlocked?label(node.id):node.id==='03.2'?'Сначала выберите задачу':'Сначала подтвердите состав'} style={node.competenceId?{'--accent':`var(--competence-${node.competenceId})`} as CSSProperties:undefined} onClick={()=>{close();navigate(node.id)}}><span className={s.nodeNumber}>{node.id}</span><span>{label(node.id)}{!unlocked&&<small>{node.id==='03.2'?'Выберите задачу':'Подтвердите состав'}</small>}</span><span aria-hidden="true">{active===node.id?'●':unlocked?'↗':'⌁'}</span></button>})}</div>
  </div>
 </nav>;
}
