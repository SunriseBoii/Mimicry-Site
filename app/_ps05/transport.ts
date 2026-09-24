import type { CompetenceId } from '../_brand/color-system';
import type { BuilderTaskId } from '../visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-ids';
export interface Inquiry { source: 'project' | 'competency' | 'general'; task: BuilderTaskId | null; competencies: readonly CompetenceId[]; brief: string; name: string; channel: string; consent: boolean; requestId: string }
export interface Receipt { accepted: true; receiptId: string; test?: boolean }
export type InquiryTransport = (payload: Inquiry, signal: AbortSignal) => Promise<Receipt>;
export function validateInquiry(payload: Pick<Inquiry, 'name' | 'channel' | 'brief' | 'consent'>, requireConsent: boolean) {
  const errors: Partial<Record<'name' | 'channel' | 'brief' | 'consent', string>> = {};
  if (payload.name.trim().length < 2) errors.name = 'Укажите имя — не менее двух букв.';
  const channel = payload.channel.trim();
  const digits = channel.replace(/\D/g, '');
  const phone = /^\+?[\d ()-]+$/.test(channel) && digits.length >= 10 && digits.length <= 15;
  const telegram = /^@[a-zA-Z][\w]{4,31}$/.test(channel);
  if (!phone && !telegram) errors.channel = 'Введите телефон с кодом страны или Telegram в формате @username (от 5 символов).';
  if (!payload.brief.trim()) errors.brief = 'Добавьте несколько слов о задаче.';
  if (requireConsent && !payload.consent) errors.consent = 'Подтвердите согласие перед отправкой.';
  return errors;
}
export const unavailableTransport: InquiryTransport = async () => { throw new Error('Отправка пока недоступна. Сохраните текст запроса, чтобы вернуться к нему позже.'); };
/** Connect a same-origin, server-owned endpoint; it must validate, rate-limit and deduplicate requestId. */
export function createHttpTransport(endpoint: string): InquiryTransport {
  return async (payload, signal) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': payload.requestId }, body: JSON.stringify(payload), signal });
    if (!response.ok) throw new Error('Не удалось отправить запрос. Проверьте соединение и попробуйте ещё раз.');
    const receipt = await response.json() as Partial<Receipt>;
    if (receipt.accepted !== true || typeof receipt.receiptId !== 'string' || !receipt.receiptId) throw new Error('Сервис не подтвердил получение. Попробуйте ещё раз с тем же запросом.');
    return { accepted: true, receiptId: receipt.receiptId };
  };
}
/** Explicit local review only; no network and no personal data persisted/logged. */
export function createTestTransport(failFirst = false): InquiryTransport {
  let calls = 0;
  return async (_payload, signal) => {
    calls += 1;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, 350);
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, {once:true});
    });
    if (failFirst && calls === 1) throw new Error('Тестовый отказ сети. Данные сохранены — повторите отправку.');
    return { accepted: true, receiptId: 'local-review', test: true };
  };
}
