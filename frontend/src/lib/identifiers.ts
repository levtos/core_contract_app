import { t as uiText } from '@/i18n';
export const ID_LIMIT = 128;
export function validIdentifier(value: string): boolean {
  return value.length <= ID_LIMIT && /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*$/.test(value);
}
export const ID_HINT = uiText("lib.identifiers.hochstens_128_zeichen_a_z_oder_a_z_zuerst_nur_di_f5ba89");
