'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CaseStudy } from './content';
import { CAPABILITIES } from './catalog';
import { CopyAction, Modal, SafeMedia } from './primitives';
import s from './ps05.module.css';

export function CaseCover({ item, detail=false }: {item:CaseStudy;detail?:boolean}) {
 return <div className={s.caseCover} data-cover={item.id} data-detail={detail}>
  {item.cover?<SafeMedia media={item.cover} eager={detail}/>:<><span>{item.fixture?'МАКЕТ / НЕ РЕАЛЬНЫЙ КЕЙС':'MIMICRY GROUP / ПРОЕКТ'}</span><strong>{item.title}</strong><div aria-hidden="true" className={s.coverLines}><i/><i/><i/><i/></div><span className={s.coverBottom}>{item.competencies.map(id=>CAPABILITIES[id].name).join(' / ')}</span></>}
 </div>;
}
export function CaseCard({ item, onOpen }: {item:CaseStudy;onOpen:(item:CaseStudy,trigger:HTMLElement)=>void}) {
 return <article className={s.caseCard}><button type="button" onClick={e=>onOpen(item,e.currentTarget)} aria-label={`Открыть: ${item.title}`}><CaseCover item={item}/><div className={s.caseCaption}><div><h3>{item.title}</h3><p>{item.context}</p></div><span aria-hidden="true">↗</span></div></button></article>;
}
function animateCover(from: HTMLElement,to:HTMLElement, duration=420) {
 const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
 if(!a.width||!b.width) return ()=>{};
 const clone=to.cloneNode(true) as HTMLElement;
 clone.setAttribute('aria-hidden','true');clone.removeAttribute('id');clone.dataset.transitionCover='true';
 Object.assign(clone.style,{position:'fixed',left:`${b.left}px`,top:`${b.top}px`,width:`${b.width}px`,height:`${b.height}px`,margin:'0',zIndex:'100',pointerEvents:'none',transformOrigin:'top left',visibility:'visible'});
 // Stay inside the modal's top layer so the shared cover is visible above its backdrop.
 const host=to.closest('dialog')??from.closest('dialog')??document.body;host.appendChild(clone);
 const fromVisibility=from.style.visibility,toVisibility=to.style.visibility;
 from.style.visibility='hidden';to.style.visibility='hidden';
 const animation=clone.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width},${a.height/b.height})`,opacity:1},{transform:'none',opacity:1}],{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
 const cleanup=()=>{animation.cancel();clone.remove();from.style.visibility=fromVisibility;to.style.visibility=toVisibility};
 animation.onfinish=cleanup;return cleanup;
}
export function CaseDetail({ item, variant, reduced, origin, onClose }: {item:CaseStudy;variant:'A'|'B';reduced:boolean;origin:HTMLElement|null;onClose:()=>void}) {
 const content=useRef<HTMLDivElement>(null);const cancel=useRef<()=>void>(()=>{});const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useLayoutEffect(()=>{
  const cover=content.current?.querySelector<HTMLElement>('[data-cover]');const source=origin?.querySelector<HTMLElement>('[data-cover]');
  if(variant==='B'&&!reduced&&cover&&source) cancel.current=animateCover(source,cover);
  const resize=()=>cancel.current();window.addEventListener('resize',resize);
  return()=>{cancel.current();window.removeEventListener('resize',resize);if(timer.current)clearTimeout(timer.current)};
 },[origin,reduced,variant]);
 useEffect(()=>{if(reduced)cancel.current()},[reduced]);
 const close=()=>{
  cancel.current(); if(timer.current){clearTimeout(timer.current);onClose();return;}
  const cover=content.current?.querySelector<HTMLElement>('[data-cover]');const source=origin?.querySelector<HTMLElement>('[data-cover]');
  if(variant==='B'&&!reduced&&cover&&source&&source.getBoundingClientRect().top>=0){cancel.current=animateCover(cover,source,260);timer.current=setTimeout(onClose,260)}else onClose();
 };
 return <Modal title={item.title} onClose={close} className={s.caseDialog} labelledBy="case-title"><div ref={content}>
  {item.fixture&&<p className={s.reviewNote}>Демонстрационный материал для проверки интерфейса. Не работа агентства.</p>}
  <CaseCover item={item} detail/>
  <p className={s.lead}>{item.context}</p><div className={s.caseFacts}>{[['Задача',item.task],['Наша роль',item.role],['Результат',item.result]].map(([title,text])=><section key={title}><h3>{title}</h3><p>{text}</p></section>)}</div>
  {item.gallery?.map(media=><SafeMedia key={media.src} media={media} className={s.galleryImage}/>)}
  {item.video&&<video controls preload="none" poster={item.video.poster} className={s.galleryImage}><source src={item.video.src}/><p>Видео недоступно.</p></video>}
  <CopyAction label="Скопировать ссылку" text={()=>{const url=new URL(location.href);url.searchParams.set('case',item.id);return url.toString()}}/>
 </div></Modal>;
}
