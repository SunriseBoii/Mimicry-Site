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
export function RouteGraph({active,preview,target,unlock,navigate}:{active:ScreenNodeId;preview:ScreenNodeId|null;target:ScreenNodeId|null;unlock:UnlockFlags;navigate:(id:ScreenNodeId)=>void}) {
 const links=useRef<HTMLDivElement>(null);
 useEffect(()=>{const list=links.current,button=list?.querySelector<HTMLElement>('[aria-current]');if(list&&button&&innerWidth<=1100){const x=button.offsetLeft-list.offsetLeft;list.scrollTo({left:Math.max(0,x-list.clientWidth/2+button.offsetWidth/2),behavior:'auto'});}},[active]);
 const point=(id:ScreenNodeId)=>{const n=SCREEN_NODE_BY_ID[id];return {x:10+(n.chapterIndex?14:0),y:16+n.index*29};};
 return <nav className={s.graph} data-qa="m4-graph" aria-label="Прогресс маршрута, ортогональный граф экранов">
  <div id="route-map" className={s.graphPanel}>
   <svg viewBox="0 0 200 522" className={s.routeDiagram} aria-hidden="true">{GRAPH_EDGES.map(edge=>{const a=point(edge.from),b=point(edge.to);return <path key={edge.from+'-'+edge.to} d={`M${a.x} ${a.y} V${b.y} H${b.x}`} fill="none" stroke="currentColor" strokeWidth="1"/>})}</svg>
   <div ref={links} className={s.graphLinks}>{SCREEN_NODES.map(node=>{const unlocked=isNodeUnlocked(node.id,unlock);return <button type="button" key={node.id} data-hit={node.id} data-preview={preview===node.id} data-target={target===node.id} data-locked={!unlocked} aria-current={active===node.id?'step':undefined} aria-label={label(node.id)+(!unlocked?(node.id==='03.2'?' — сначала выберите задачу':' — сначала подтвердите состав'):'')} disabled={!unlocked} title={unlocked?label(node.id):node.id==='03.2'?'Сначала выберите задачу':'Сначала подтвердите состав'} style={{'--indent':node.chapterIndex?'14px':'0px',...(node.competenceId?{'--accent':`var(--competence-${node.competenceId})`}:{})} as CSSProperties} onClick={()=>navigate(node.id)}><span className={s.currentDot} aria-hidden="true"/><span className={s.nodeNumber}>{node.id}</span><span>{label(node.id)}</span>{!unlocked&&<span aria-hidden="true">⌁</span>}</button>})}</div>
  </div>
 </nav>;
}
