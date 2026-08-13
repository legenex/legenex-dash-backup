function normalizeHost(h){h=String(h||'').toLowerCase();if(h.startsWith('[')&&h.endsWith(']'))h=h.slice(1,-1);if(h.endsWith('.'))h=h.slice(0,-1);return h;}
function isPrivateIpv4(host){const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);if(!m)return false;const a=+m[1],b=+m[2];if(a===0||a===127||a===10)return true;if(a===169&&b===254)return true;if(a===192&&b===168)return true;if(a===172&&b>=16&&b<=31)return true;if(a===100&&b>=64&&b<=127)return true;return false;}
function isPrivateIpv6(host){if(!host.includes(':'))return false;if(host==='::1'||host==='::')return true;if(/^fe[89ab]/.test(host))return true;if(/^f[cd]/.test(host))return true;const mp=host.match(/^::ffff:(.+)$/);if(mp)return mp[1].includes('.')?isPrivateIpv4(mp[1]):true;return false;}
function isPrivateHost(host){if(!host)return true;if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.internal'))return true;if(host==='metadata.google.internal'||host==='metadata')return true;return isPrivateIpv4(host)||isPrivateIpv6(host);}
async function isBlockedTarget(rawUrl){let u;try{u=new URL(rawUrl);}catch{return true;}if(u.protocol!=='http:'&&u.protocol!=='https:')return true;const host=normalizeHost(u.hostname);if(isPrivateHost(host))return true;return false;} // DNS branch skipped (no Deno) - matches runtime fallback

const cases = [
  ['http://127.0.0.1/',true],
  ['http://169.254.169.254/latest/meta-data/',true],
  ['http://2130706433/',true],            // decimal -> 127.0.0.1
  ['http://0x7f000001/',true],            // hex -> 127.0.0.1
  ['http://0177.0.0.1/',true],            // octal
  ['http://127.0.0.1./',true],            // trailing dot IPv4
  ['http://metadata.google.internal./',true], // trailing dot name (reviewer bypass)
  ['http://[::1]/',true],                 // IPv6 loopback (reviewer dead-code bypass)
  ['http://[::ffff:127.0.0.1]/',true],    // mapped
  ['http://[::ffff:7f00:1]/',true],       // mapped hex
  ['http://[fd00::1]/',true],             // ULA
  ['http://[fe80::1]/',true],             // link-local
  ['http://100.64.0.1/',true],            // CGNAT
  ['http://192.168.1.1/',true],
  ['http://10.0.0.5/',true],
  ['http://172.20.0.1/',true],
  ['ftp://example.com/',true],            // bad scheme
  ['http://localhost/',true],
  ['http://foo.internal/',true],
  ['https://api.legenex.com/functions/leads',false], // legit public - allowed
  ['https://example.com/webhook',false],  // legit public - allowed
];
let fail=0;
for (const [url,exp] of cases){
  const got = await isBlockedTarget(url);
  const ok = got===exp;
  if(!ok)fail++;
  console.log(`${ok?'PASS':'FAIL'}  blocked=${got} expect=${exp}  ${url}`);
}
console.log(`\n${fail===0?'ALL PASS':fail+' FAILURES'} (${cases.length} cases)`);
process.exit(fail?1:0);
