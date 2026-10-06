import{$ as e,O as t,d as n,g as r,l as i,s as a,t as o,yt as s}from"./AppIcon-CKbX1XDu.js";import{q as c}from"./api-r8COXsSQ.js";import{C as l}from"./index-kMINi_ba.js";var u=`#5b3a4a`,d=`stroke="${u}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`,f=e=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${e}</svg>`,p=(e,t)=>`<path d="M${e} ${t-4} v8 M${e-4} ${t} h8" stroke="#ffb84d" stroke-width="2.2" stroke-linecap="round"/>`,m={personal:f(`
    <circle cx="40" cy="15" r="8" fill="#ffd866" ${d}/>
    <text x="40" y="19" text-anchor="middle" font-size="10" font-weight="700" font-family="sans-serif" fill="#8a5a00">฿</text>
    <rect x="9" y="22" width="44" height="32" rx="9" fill="#ffc2d4" ${d}/>
    <path d="M53 32 h-12 a5 5 0 0 0 0 10 h12 Z" fill="#ff9fbf" ${d}/>
    <circle cx="42" cy="37" r="2" fill="${u}"/>
    <path d="M17 31 q4 3 8 0" fill="none" ${d}/>
  `),freelancer:f(`
    <rect x="13" y="14" width="38" height="26" rx="4" fill="#cfe6ff" ${d}/>
    <path d="M32 33 l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 Z" fill="#ff8fb3"/>
    <path d="M7 46 h50 l-4 6 h-42 Z" fill="#e3d9ff" ${d}/>
    ${p(54,12)}
  `),sme:f(`
    <rect x="12" y="28" width="40" height="26" rx="3" fill="#fff4e0" ${d}/>
    <path d="M8 28 l5 -12 h38 l5 12 Z" fill="#ffd3a8" ${d}/>
    <path d="M18 16 l-3 12 M27 16 l-1 12 M37 16 l1 12 M46 16 l3 12" ${d}/>
    <rect x="27" y="38" width="10" height="16" rx="2" fill="#a8d8b0" ${d}/>
    <rect x="16" y="34" width="7" height="7" rx="1.5" fill="#cfe6ff" ${d}/>
    <rect x="41" y="34" width="7" height="7" rx="1.5" fill="#cfe6ff" ${d}/>
  `),company:f(`
    <path d="M32 6 v8" ${d}/>
    <path d="M32 6 l9 3 l-9 3 Z" fill="#ff8fb3" ${d}/>
    <rect x="18" y="14" width="28" height="42" rx="3" fill="#d9e8ff" ${d}/>
    <g fill="#ffffff" ${d}>
      <rect x="23" y="20" width="6" height="6" rx="1"/><rect x="35" y="20" width="6" height="6" rx="1"/>
      <rect x="23" y="31" width="6" height="6" rx="1"/><rect x="35" y="31" width="6" height="6" rx="1"/>
    </g>
    <rect x="28" y="44" width="8" height="12" rx="1.5" fill="#ffd866" ${d}/>
  `),investor:f(`
    <path d="M32 40 V22" ${d}/>
    <path d="M32 30 q-12 -2 -12 -12 q12 0 12 12 Z" fill="#a8e0a0" ${d}/>
    <path d="M32 24 q10 -2 11 -12 q-11 1 -11 12 Z" fill="#c6efb8" ${d}/>
    <circle cx="46" cy="22" r="6" fill="#ffd866" ${d}/>
    <path d="M18 40 h28 l-4 16 h-20 Z" fill="#ffb48a" ${d}/>
    <path d="M16 40 h32" ${d}/>
  `),trader:f(`
    <rect x="8" y="10" width="48" height="44" rx="8" fill="#f1ecff" ${d}/>
    <path d="M20 22 v24 M32 18 v26 M44 14 v22" ${d}/>
    <rect x="16" y="30" width="8" height="10" rx="2" fill="#ff9f9f" ${d}/>
    <rect x="28" y="24" width="8" height="14" rx="2" fill="#a8e0a0" ${d}/>
    <rect x="40" y="18" width="8" height="12" rx="2" fill="#a8e0a0" ${d}/>
    ${p(52,44)}
  `)},h=[`innerHTML`],g=r({__name:`ModeIcon`,props:{mode:{},size:{default:22}},setup(r){let u=r,d=l(),f=a(()=>d.siteStyle.value===`cute`),p=a(()=>c(u.mode).icon);return(a,c)=>f.value?(t(),n(`span`,{key:0,class:`mode-art`,style:s({width:`${r.size*2}px`,height:`${r.size*2}px`}),"aria-hidden":`true`,innerHTML:e(m)[r.mode]},null,12,h)):(t(),i(o,{key:1,name:p.value,size:r.size},null,8,[`name`,`size`]))}});export{g as t};