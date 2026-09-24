'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Media } from './content';
import s from './ps05.module.css';

export function CopyAction({ text, label = 'Скопировать текст' }: { text: string | (()=>string); label?: string }) {
 const [status,setStatus]=useState(''); const [fallback,setFallback]=useState<string|null>(null);
 const copy=async()=>{
  const value=typeof text==='function'?text():text;
  try { if(!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(value); setStatus('Скопировано'); }
  catch { setFallback(value); setStatus('Выделите и скопируйте текст вручную'); }
 };
 return <span className={s.copyAction}><button type="button" className={s.quiet} onClick={copy}>{label}</button><span role="status">{status}</span>{fallback!==null&&<label className={s.fallback}>Текст для копирования<textarea readOnly value={fallback} onFocus={e=>e.currentTarget.select()}/></label>}</span>;
}

export function Modal({ title, children, onClose, className='', labelledBy='ps05-dialog-title' }: { title: string; children: ReactNode; onClose: ()=>void; className?: string; labelledBy?: string }) {
 const ref=useRef<HTMLDialogElement>(null); const closeRef=useRef(onClose);
 useLayoutEffect(()=>{closeRef.current=onClose},[onClose]);
 useLayoutEffect(()=>{
  const dialog=ref.current!; const previous=document.activeElement as HTMLElement|null;
  dialog.showModal(); dialog.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});
  const overflow=document.documentElement.style.overflow;
  document.documentElement.style.overflow='hidden';
  return ()=>{dialog.close(); document.documentElement.style.overflow=overflow; previous?.focus({preventScroll:true});};
 },[]);
 return <dialog ref={ref} className={`${s.dialog} ${className}`} aria-labelledby={labelledBy} onCancel={e=>{e.preventDefault();closeRef.current()}}>
  <div className={s.dialogTop}><h2 id={labelledBy} tabIndex={-1}>{title}</h2><button type="button" className={s.iconButton} aria-label="Закрыть" onClick={onClose}>×</button></div>{children}
 </dialog>;
}

export function SafeMedia({ media, className='', eager=false }: { media: Media; className?:string; eager?:boolean }) {
 const [failed,setFailed]=useState(false);
 // eslint-disable-next-line @next/next/no-img-element -- Content-provided responsive image sizes; honest error fallback.
 return failed?<div className={`${s.mediaFallback} ${className}`} role="img" aria-label={media.alt}>{media.alt}</div>:<img className={className} src={media.src} srcSet={media.srcSet} sizes="(max-width: 1100px) 100vw, 56vw" width={media.width} height={media.height} alt={media.alt} loading={eager?'eager':'lazy'} onError={()=>setFailed(true)}/>;
}

export function useSystemMotion() {
 const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReduced(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[]);
 return reduced;
}
