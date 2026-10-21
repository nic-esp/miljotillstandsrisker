import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_SECTIONS,sitePage,siteSection,siteHref,siteRouteKey,renderSiteHeader } from '../../_build/site_navigation.mjs';

test('analysis and detail destinations retain their owning main section',()=>{
  assert.equal(siteSection(sitePage('controls','analysis')).id,'controls');
  assert.equal(siteSection(sitePage('report','register','metod')).id,'report');
  for(const view of ['analysis','ranking','stats'])assert.equal(siteSection(view).id,'risks');
  assert.equal(siteSection('nodes').id,'process');
});
test('standalone Pages navigation resolves to the same app and reading destinations',()=>{
  const app='https://example.com/miljotillstandsrisker/';
  for(const [current,base] of [[app,''],[app+'data/','../'],[app+'report/','../'],[app+'ai-access.html','./']]){
    for(const section of SITE_SECTIONS)for(const [page] of section.items){
      const expected=new URL(siteHref(page,'','sammanfattning'),app).href;
      assert.equal(new URL(siteHref(page,base,'sammanfattning'),current).href,expected);
    }
    const html=renderSiteHeader({page:'control-analysis',base,firstChapter:'sammanfattning'});
    assert.equal((html.match(/data-site-section=/g)||[]).length,6);
    assert.match(html,/data-site-section="controls"[^>]*aria-current="true"/);
    assert.match(html,/data-site-page="control-analysis" aria-current="page"/);
  }
});
test('history preserves investigations without creating one entry per filter or keystroke',()=>{
  const key=s=>siteRouteKey('https://example.com/'+s);
  assert.equal(key(''),key('?view=risks'));
  assert.equal(key('?view=risks&q=a'),key('?view=risks&q=abc&top=1'));
  assert.equal(key('?view=controls&tab=analysis'),key('?view=controls&tab=analysis&selected=C1'));
  assert.notEqual(key('?view=controls'),key('?view=controls&tab=analysis'));
  assert.notEqual(key('?risk=R1'),key('?risk=R2'));
  assert.notEqual(key('?view=report&chapter=intro'),key('?view=report&chapter=metod'));
  assert.notEqual(key('?view=process&chart=B10'),key('?view=process&chart=B20'));
});
