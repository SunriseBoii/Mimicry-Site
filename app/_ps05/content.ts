import type { CompetenceId } from '../_brand/color-system';
export interface Media { src: string; alt: string; width: number; height: number; srcSet?: string }
export interface CaseStudy { id: string; title: string; context: string; task: string; role: string; result: string; competencies: CompetenceId[]; cover?: Media; gallery?: Media[]; video?: { src: string; poster: string }; publicationApproved: boolean; fixture?: boolean }
export interface TeamMember { id: string; name: string; role: string; contribution: string; portrait?: Media }
export interface Organization { id: string; name: string; context: string; logo?: Media }
export interface Testimonial { id: string; quote: string; author: string; role: string; company: string; attributionApproved: boolean }
// Publish only verified material with publication permission. Empty arrays are intentional.
export const siteContent: { cases: CaseStudy[]; team: TeamMember[]; partners: Organization[]; clients: Organization[]; testimonials: Testimonial[]; presentation: { href: string; label: string } | null; contact: { href: string; label: string } | null; privacy: { href: string; consent: string } | null } = {
  cases: [], team: [], partners: [], clients: [], testimonials: [], presentation: null, contact: null, privacy: null,
};
// Isolated local review data: never presented as an agency project.
export const REVIEW_CASE: CaseStudy = { id: 'layout-study', title: 'От идеи к общему опыту', context: 'Макет для сравнения переходов A / B. Не выполненный проект.', task: 'Проверить, как читаются контекст, задача и подробности одного материала.', role: 'Поля роли команды и состава работ подключаются из реестра кейсов.', result: 'Здесь будет подтверждённый результат и его источник. Демонстрационный макет не содержит коммерческих утверждений.', competencies: ['event','video','digital','merch'], publicationApproved: false, fixture: true };
export const REVIEW_CONTENT: typeof siteContent = {
 ...siteContent,
 team: [{id:'sample-person',name:'Имя участника',role:'Роль в команде',contribution:'Демонстрационная карточка: здесь будет вклад человека в проекты.'}],
 partners: [{id:'sample-partner',name:'Название партнёра',context:'Демонстрационная карточка: здесь будет направление сотрудничества.'}],
 clients: [{id:'sample-client',name:'Название компании',context:'Демонстрационная карточка: здесь будет подтверждённый контекст работы.'}],
 testimonials: [{id:'sample-quote',quote:'Здесь будет согласованный отзыв о совместной работе.',author:'Имя автора',role:'Роль',company:'Компания',attributionApproved:true}],
};
