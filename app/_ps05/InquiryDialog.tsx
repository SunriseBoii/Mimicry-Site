'use client';
import { useEffect, useRef, useState } from 'react';
import type { BuilderFlowState, ContactDraft } from '../visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow';
import { CAPABILITIES, orderedCapabilities, TASKS } from './catalog';
import { siteContent } from './content';
import { type Inquiry, type InquiryTransport, validateInquiry } from './transport';
import { CopyAction, Modal } from './primitives';
import s from './ps05.module.css';

export function InquiryDialog({ inquiry, contact, onContact, onClose, onSuccess, transport, available, testMode }: {
 inquiry: Pick<Inquiry,'source'|'task'|'competencies'|'brief'>; contact: ContactDraft; onContact:(contact:ContactDraft)=>void; onClose:()=>void; onSuccess:(test:boolean)=>void; transport:InquiryTransport; available:boolean; testMode:boolean;
}) {
 const [errors,setErrors]=useState<ReturnType<typeof validateInquiry>>({}); const [error,setError]=useState(''); const [pending,setPending]=useState(false);
 const inFlight=useRef(false); const abort=useRef<AbortController|null>(null); const requestId=useRef<string|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const submit=async()=>{
  if(inFlight.current) return;
  const payload={...inquiry,...contact,requestId:requestId.current??crypto.randomUUID()}; requestId.current=payload.requestId;
  const invalid=validateInquiry(payload,!!siteContent.privacy); setErrors(invalid); setError('');
  if(Object.keys(invalid).length){ requestAnimationFrame(()=>document.querySelector<HTMLElement>('dialog [aria-invalid="true"]')?.focus()); return; }
  if(!available) return;
  abort.current=new AbortController(); inFlight.current=true;setPending(true);
  try{const receipt=await transport(payload,abort.current.signal); if(!abort.current.signal.aborted) onSuccess(!!receipt.test);}
  catch(reason){if(!abort.current.signal.aborted) setError(reason instanceof Error?reason.message:'Не удалось отправить запрос. Попробуйте снова.');}
  finally{inFlight.current=false;if(!abort.current?.signal.aborted)setPending(false);}
 };
 return <Modal title="Давайте познакомимся" onClose={onClose}>
  {testMode&&<p className={s.reviewNote}>Тестовая отправка: данные остаются в браузере, письма не отправляются.</p>}
  <p className={s.eyebrow}>{inquiry.source==='project'?'Собранный проект':inquiry.source==='competency'?'Обращение по компетенции':'Новый разговор'}</p>
  {inquiry.task&&<p>{TASKS[inquiry.task].title}</p>}
  <p className={s.muted}>{orderedCapabilities(inquiry.competencies).map(id=>CAPABILITIES[id].name).join(' · ')}</p>
  <details className={s.requestPreview}><summary>Запрос, который будет отправлен</summary><p>{inquiry.brief}</p></details>
  <form noValidate onSubmit={e=>{e.preventDefault();void submit()}} aria-busy={pending}>
   <label className={s.field}>Как вас зовут<input aria-label="Как вас зовут" name="name" autoComplete="name" value={contact.name} maxLength={120} disabled={pending} aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined} onChange={e=>{requestId.current=null;onContact({...contact,name:e.target.value})}}/>{errors.name&&<span id="name-error" className={s.error}>{errors.name}</span>}</label>
   <label className={s.field}>Телефон или Telegram<input aria-label="Телефон или Telegram" name="channel" autoComplete="tel" placeholder="+7 … или @username" value={contact.channel} maxLength={80} disabled={pending} aria-invalid={!!errors.channel} aria-describedby="channel-help channel-error" onChange={e=>{requestId.current=null;onContact({...contact,channel:e.target.value})}}/><small id="channel-help">Один удобный способ связи — на ваш выбор.</small><span id="channel-error" className={s.error}>{errors.channel}</span></label>
   {siteContent.privacy&&<label className={s.consent}><input type="checkbox" checked={contact.consent} onChange={e=>onContact({...contact,consent:e.target.checked})}/><span>{siteContent.privacy.consent} <a href={siteContent.privacy.href}>Политика обработки данных</a></span></label>}
   {errors.consent&&<p className={s.error} role="alert">{errors.consent}</p>}
   {error&&<p className={s.error} role="alert">{error}</p>}
   {!available&&<p className={s.notice}>Отправка пока недоступна. Скопируйте запрос, чтобы сохранить его.{siteContent.contact&&<> Связаться с нами: <a href={siteContent.contact.href}>{siteContent.contact.label}</a>.</>}</p>}
   <div className={s.actionRow}><button className={s.primary} type="submit" disabled={!available||pending}>{pending?'Отправляем…':testMode?'Отправить тестовый запрос':'Отправить запрос'}<span aria-hidden="true">↗</span></button><CopyAction text={inquiry.brief}/></div>
  </form>
 </Modal>;
}

export function projectInquiry(flow:BuilderFlowState):Pick<Inquiry,'source'|'task'|'competencies'|'brief'> {
 return {source:'project',task:flow.confirmed?.taskId??null,competencies:flow.confirmed?.competencies??[],brief:flow.briefText};
}
