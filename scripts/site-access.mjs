// A deliberate visitor gate for a public static site, not server authentication.
export function addSiteAccess(html,config,base='') {
  if(config?.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(config.passwordSha256)||!Number.isFinite(config.sessionHours)||config.sessionHours<=0||config.sessionHours>24)throw Error('Ogiltig konfiguration för lösenordsrutan');
  if(html.includes('id="site-access-gate"'))throw Error('Lösenordsrutan är redan tillagd');
  const head=`<meta name="site-access-digest" content="${config.passwordSha256}"><meta name="site-access-hours" content="${config.sessionHours}">
<style>html[data-access-locked] body>:not(#site-access-gate){display:none!important}html:not([data-access-locked]) #site-access-gate{display:none!important}</style>
<link rel="stylesheet" href="${base}assets/site-access.css"><script type="module" src="${base}assets/site-access.js"></script>`;
  const gate=`<section id="site-access-gate" aria-labelledby="site-access-title"><div class="site-access-card"><div class="site-access-brand"><img src="${base}assets/cardinal-wordmark.svg" alt="Cardinal" width="172" height="40"></div><div class="site-access-content"><h1 id="site-access-title">Miljötillståndsrisker</h1><p>Ange lösenordet för att öppna webbplatsen.</p><form id="site-access-form" method="post"><label for="site-access-password">Lösenord</label><input id="site-access-password" type="password" autocomplete="current-password" required aria-describedby="site-access-error"><p id="site-access-error" role="status" aria-live="polite"></p><button type="submit">Öppna webbplatsen</button></form><noscript>JavaScript behöver vara aktiverat för att öppna webbplatsen.</noscript></div></div></section>`;
  if(!/<html\b/i.test(html)||!/<head\b[^>]*>/i.test(html)||!/<body\b[^>]*>/i.test(html))throw Error('HTML-sida saknar dokumentstruktur');
  return html.replace(/<html\b/i,'<html data-access-locked="true"').replace(/<head\b[^>]*>/i,match=>match+head).replace(/<body\b[^>]*>/i,match=>match+gate);
}
