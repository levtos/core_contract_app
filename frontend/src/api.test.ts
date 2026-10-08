import {describe,it,expect,vi,afterEach} from 'vitest';
import {request,serviceState,type Service} from './api';
const base:Service={ready:true,publication_confirmed:true,persistence:'available',ha:'connected',bridge:'connected',mqtt:'disabled'};
describe('service state without changing contract quality',()=>{
  it('reports unconfirmed last publication',()=>expect(serviceState({...base,publication_confirmed:false})).toBe('stale'));
  it('keeps HA disconnect separate from readiness',()=>expect(serviceState({...base,ha:'disconnected'})).toBe('degraded'));
  it('shows readiness gate',()=>expect(serviceState({...base,ready:false})).toBe('blocked'));
});
afterEach(()=>vi.unstubAllGlobals());
it('preserves safe validation details for the administrator',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'invalid_request',details:[{location:['sources',0,'freshness'],type:'missing'}]}),{status:400,headers:{'Content-Type':'application/json'}})));
  await expect(request('registry/drafts/test/validate','POST',{})).rejects.toThrow('freshness');
});
