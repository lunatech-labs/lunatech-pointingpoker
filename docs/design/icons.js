// Lucide's icons for both mockups, by lucide's name, copied from lucide-react; their licence is lucide-LICENSE.txt beside this file.
const icons = {
  pencil: [['path',{d:'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'}],['path',{d:'m15 5 4 4'}]],
  trash: [['path',{d:'M10 11v6'}],['path',{d:'M14 11v6'}],['path',{d:'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'}],['path',{d:'M3 6h18'}],['path',{d:'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'}]],
  link: [['path',{d:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'}],['path',{d:'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'}]],
  "log-out": [['path',{d:'m16 17 5-5-5-5'}],['path',{d:'M21 12H9'}],['path',{d:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'}]],
  menu: [['path',{d:'M4 5h16'}],['path',{d:'M4 12h16'}],['path',{d:'M4 19h16'}]],
  eye: [['path',{d:'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'}],['circle',{cx:'12',cy:'12',r:'3'}]],
  "rotate-ccw": [['path',{d:'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'}],['path',{d:'M3 3v5h5'}]],
  check: [['path',{d:'M20 6 9 17l-5-5'}]],
  x: [['path',{d:'M18 6 6 18'}],['path',{d:'m6 6 12 12'}]],
  "triangle-alert": [['path',{d:'m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'}],['path',{d:'M12 9v4'}],['path',{d:'M12 17h.01'}]],
  info: [['circle',{cx:'12',cy:'12',r:'10'}],['path',{d:'M12 16v-4'}],['path',{d:'M12 8h.01'}]],
  "arrow-right": [['path',{d:'M5 12h14'}],['path',{d:'m12 5 7 7-7 7'}]]
}
// Draws an icon as lucide-react renders it, less its class.
const icon = name => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
  icons[name].map(([tag, a]) => `<${tag}${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('')}></${tag}>`).join('')}</svg>`
