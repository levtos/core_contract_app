import {describe,it,expect} from 'vitest';
import {serviceState,type Service} from './api';
const base:Service={ready:true,publication_confirmed:true,persistence:'available',ha:'connected',bridge:'connected',mqtt:'disabled'};
describe('service state without changing contract quality',()=>{
  it('reports unconfirmed last publication',()=>expect(serviceState({...base,publication_confirmed:false})).toBe('stale'));
  it('keeps HA disconnect separate from readiness',()=>expect(serviceState({...base,ha:'disconnected'})).toBe('degraded'));
  it('shows readiness gate',()=>expect(serviceState({...base,ready:false})).toBe('blocked'));
});
