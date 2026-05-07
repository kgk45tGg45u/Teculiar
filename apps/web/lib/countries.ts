const countryCodes =
  "AF,AX,AL,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BH,BD,BB,BY,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,CV,KH,CM,CA,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CU,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,SZ,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IM,IL,IT,JM,JP,JE,JO,KZ,KE,KI,KP,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MD,MC,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,NC,NZ,NI,NE,NG,NU,NF,MK,MP,NO,OM,PK,PW,PS,PA,PG,PY,PE,PH,PN,PL,PT,PR,QA,RE,RO,RU,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,US,UM,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW".split(",");

const callingCodes: Record<string, string> = {
  AD: "+376", AE: "+971", AF: "+93", AG: "+1", AI: "+1", AL: "+355", AM: "+374", AO: "+244", AR: "+54", AS: "+1",
  AT: "+43", AU: "+61", AW: "+297", AX: "+358", AZ: "+994", BA: "+387", BB: "+1", BD: "+880", BE: "+32", BF: "+226",
  BG: "+359", BH: "+973", BI: "+257", BJ: "+229", BL: "+590", BM: "+1", BN: "+673", BO: "+591", BQ: "+599", BR: "+55",
  BS: "+1", BT: "+975", BW: "+267", BY: "+375", BZ: "+501", CA: "+1", CC: "+61", CD: "+243", CF: "+236", CG: "+242",
  CH: "+41", CI: "+225", CK: "+682", CL: "+56", CM: "+237", CN: "+86", CO: "+57", CR: "+506", CU: "+53", CV: "+238",
  CW: "+599", CX: "+61", CY: "+357", CZ: "+420", DE: "+49", DJ: "+253", DK: "+45", DM: "+1", DO: "+1", DZ: "+213",
  EC: "+593", EE: "+372", EG: "+20", EH: "+212", ER: "+291", ES: "+34", ET: "+251", FI: "+358", FJ: "+679", FK: "+500",
  FM: "+691", FO: "+298", FR: "+33", GA: "+241", GB: "+44", GD: "+1", GE: "+995", GF: "+594", GG: "+44", GH: "+233",
  GI: "+350", GL: "+299", GM: "+220", GN: "+224", GP: "+590", GQ: "+240", GR: "+30", GT: "+502", GU: "+1", GW: "+245",
  GY: "+592", HK: "+852", HN: "+504", HR: "+385", HT: "+509", HU: "+36", ID: "+62", IE: "+353", IL: "+972", IM: "+44",
  IN: "+91", IO: "+246", IQ: "+964", IR: "+98", IS: "+354", IT: "+39", JE: "+44", JM: "+1", JO: "+962", JP: "+81",
  KE: "+254", KG: "+996", KH: "+855", KI: "+686", KM: "+269", KN: "+1", KP: "+850", KR: "+82", KW: "+965", KY: "+1",
  KZ: "+7", LA: "+856", LB: "+961", LC: "+1", LI: "+423", LK: "+94", LR: "+231", LS: "+266", LT: "+370", LU: "+352",
  LV: "+371", LY: "+218", MA: "+212", MC: "+377", MD: "+373", ME: "+382", MF: "+590", MG: "+261", MH: "+692", MK: "+389",
  ML: "+223", MM: "+95", MN: "+976", MO: "+853", MP: "+1", MQ: "+596", MR: "+222", MS: "+1", MT: "+356", MU: "+230",
  MV: "+960", MW: "+265", MX: "+52", MY: "+60", MZ: "+258", NA: "+264", NC: "+687", NE: "+227", NF: "+672", NG: "+234",
  NI: "+505", NL: "+31", NO: "+47", NP: "+977", NR: "+674", NU: "+683", NZ: "+64", OM: "+968", PA: "+507", PE: "+51",
  PF: "+689", PG: "+675", PH: "+63", PK: "+92", PL: "+48", PM: "+508", PR: "+1", PS: "+970", PT: "+351", PW: "+680",
  PY: "+595", QA: "+974", RE: "+262", RO: "+40", RS: "+381", RU: "+7", RW: "+250", SA: "+966", SB: "+677", SC: "+248",
  SD: "+249", SE: "+46", SG: "+65", SH: "+290", SI: "+386", SK: "+421", SL: "+232", SM: "+378", SN: "+221", SO: "+252",
  SR: "+597", SS: "+211", ST: "+239", SV: "+503", SX: "+1", SY: "+963", SZ: "+268", TC: "+1", TD: "+235", TG: "+228",
  TH: "+66", TJ: "+992", TK: "+690", TL: "+670", TM: "+993", TN: "+216", TO: "+676", TR: "+90", TT: "+1", TV: "+688",
  TW: "+886", TZ: "+255", UA: "+380", UG: "+256", US: "+1", UY: "+598", UZ: "+998", VA: "+39", VC: "+1", VE: "+58",
  VG: "+1", VI: "+1", VN: "+84", VU: "+678", WF: "+681", WS: "+685", YE: "+967", YT: "+262", ZA: "+27", ZM: "+260", ZW: "+263"
};

export function countriesForLocale(locale: string) {
  const display = new Intl.DisplayNames([locale === "de" ? "de" : "en"], { type: "region" });
  return countryCodes
    .map((code) => ({ code, flag: flagFor(code), name: display.of(code) ?? code, phone: callingCodes[code] ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function flagFor(code: string) {
  return code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
