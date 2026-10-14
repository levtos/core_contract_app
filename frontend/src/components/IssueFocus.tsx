import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Focus the actual field after its lazy page/tab/editor has mounted. */
export function IssueFocus() {
  const location = useLocation();
  useEffect(() => {
    const pointer = new URLSearchParams(location.search).get('focus');
    if (!pointer) return;
    let observer: MutationObserver | undefined;
    const focus = () => {
      const field = [...document.querySelectorAll<HTMLElement>('[data-field-pointer]')].find((element) => element.dataset.fieldPointer === pointer) ?? [...document.querySelectorAll<HTMLElement>('[data-pointer]')].find((element) => element.dataset.pointer === pointer);
      if (!field) return false;
      const target = field.querySelector<HTMLElement>('input,select,textarea,button,[tabindex]') ?? field;
      if (target.closest('[hidden]')) return false;
      field.scrollIntoView?.({ block: 'center' });
      if (!target.hasAttribute('tabindex') && target === field) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      observer?.disconnect();
      return true;
    };
    if (!focus()) {
      observer = new MutationObserver(focus);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, [location.key, location.search]);
  return null;
}
