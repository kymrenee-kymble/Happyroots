import { useState, useEffect, useCallback, useRef } from "react";

const STARTER_PLANTS = [
  "Aceh Big Leaf","Anncanajoe","Argentea Princess","Australis","Australis Lisa",
  "Bella Luis Bois","Bella Outer Variegated","Blashernaezi","Burtonaie Variegated",
  "Callistophylla","Camphorifolia","Carnosa Amore","Cebu","Chinghungensis Variegated",
  "Chouke","Clandestina Yellow","Clemensiorum","Clemensorium","Cominsii","Compacta",
  "Compacta Mauna Loa","Compacta Variegated","Coriacea Silver","Crassipetiolata",
  "Crassipetiolata Splash","Crassipetiolata x Michelle","Cumingiana","Cumingiana Albo Variegata",
  "Curtsii","Davidcumingii","Dennisii","Diversifolia Maharnai","DS-70 Variegated",
  "Elliptica","Elliptica Round Leaf","Endauensis","Erythroneura","Erythrostemma OP",
  "Erythrostemma Silver","Fitchii","Forbesii","Freckled Splash","Globulosa","Gunung Gading",
  "Hat Sam Paen","Heidi","Heuschkeliana Pink","Heuschkeliana Variegated","Hoya NOID",
  "Icensis","Kanyakumariana Variegated","Kast","Kerrii","Kerrii Outer Variegated",
  "Krimson Princess","Krimson Queen","Krinkle 8 Albomarginata","Krohniana Arctic",
  "Krohniana Black","Krohniana Green","Krohniana Super Silver",
  "Lacunosa Asami Inner Var","Lacunosa Variegated","Lacunosa Bruno","Lacunosa Golden Flame",
  "Lacunosa Illumi","Lacunosa Minara","Lacunosa Mint","Latifolia Dinner Plate",
  "Latifolia Pot of Gold","Leland Joseph","Linearis","Lobbii Orange","Macgillivrayi",
  "Macrophylla","Magic","Maliski","Mathilde","Mathilde Splash","Meliflua","Memoria",
  "Minibelle","Nabawanensis","NAP 16","Nicholsonaie","NS05-055","Obovata",
  "Obovata Inner Variegated","Obscura Cryptic Chrome","Pachyclada","Para Albo","Parasitica",
  "Parasitica Black Margin","Parasitica Silver Moon","Parviflora Splash","Pimenteliana Variegated",
  "Polyneura Inner Var","Polyneura Silver Broget","Pubera","Pubicalyx x carnosa",
  "Publicalyx Carnosa","Publicalyx Silver Splash","Ranauensis","Rangsan","Retusa","Rigida",
  "Rigidifolia","Rime Splash","Rosita","RP 013","Sabah","Sabah RP013","Serpens Silver",
  "Sigillatis","Silver Broget","Silver Dollar 20","Sp Lai Chau Splash","Sungwookii","Sunrise",
  "Super Silver","Surigaoensis","Tequila Sunrise","UT 073","Verticilata Lampung","Viola",
  "Walliniana","Walliniana Variegated","Wayetti","Wayetti Tricolor",
  "Waymaniae Kayla's Cloudy Sky","Wibergiae","Wilbur Graves","Yuna",
  "Priktai Russia","Sulawesiana Aff","Love Affair","Sigillatis Borneo",
  "Fischeriana Philippines","Cagayanensis Philippines","Iris Marie",
  "Callistophylla Josie","Finlaysonii Snow Splash"
];

const CARE = {
  water:    { label:"Water + Ferts",  icon:"💧", hue:"196", defaultDays:7,
              action:"Water thoroughly with Foliage Pro & Hydroguard (diluted). Check soil visually — water only when mix is dry.", scheduled:true },
  flush:    { label:"Flush (replaces Water)", icon:"🚿", hue:"258", defaultDays:30,
              action:"Plain water only today — skip Foliage Pro & Hydroguard. Flush until water runs freely from the bottom to clear salt buildup.", scheduled:true },
  topdress: { label:"Top Dress",      icon:"🪱", hue:"32",  defaultDays:30,
              action:"Apply a thin layer of earthworm castings to the soil surface. No watering needed immediately after.", scheduled:true },
  foliar:   { label:"Foliar Spray",   icon:"🌿", hue:"88",  defaultDays:null,
              action:"Spray foliage as needed. Avoid spraying during lights-on hours.", scheduled:false },
  pest:     { label:"Pest Treatment", icon:"🐛", hue:"0",   defaultDays:null,
              action:"Log product used and next follow-up date.", scheduled:false },
  note:     { label:"Note / Observation", icon:"📝", hue:"45", defaultDays:null,
              action:"Record anything worth remembering — new growth, stress signs, changes.", scheduled:false },
};

const DEFAULT_SCHED = { waterDays:7, flushDays:30, topdressDays:30, foliarDays:14 };

// Adaptive learning: weighted median of actual intervals
// - wet signals (defer days) push interval out: each deferred day adds 0.5d
// - early logs (logged before due) pull interval in naturally via shorter interval
// - recent log pairs weighted more heavily than old ones
// - activates after 3+ logs; blends 70% learned / 30% default
function learnedInterval(logs, type, defaultDays) {
  const typed = (logs||[]).filter(l=>l.type===type).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if (typed.length < 3) return null;
  const pairs = [];
  for (let i=1; i<typed.length; i++) {
    const d = Math.round((new Date(typed[i].date)-new Date(typed[i-1].date))/86400000);
    if (d<=0 || d>120) continue;
    const recency = 0.5 + (i / typed.length);         // 0.5–1.5, recent = higher
    const wetBoost = (typed[i-1].wetDays||0) * 0.5;  // deferred days push interval out
    const adjusted = Math.max(1, d + wetBoost);
    pairs.push({ val: adjusted, weight: recency });
  }
  if (pairs.length < 2) return null;
  pairs.sort((a,b)=>a.val-b.val);
  const totalW = pairs.reduce((s,x)=>s+x.weight, 0);
  let cum = 0, median = pairs[0].val;
  for (const {val,weight} of pairs) {
    cum += weight;
    if (cum >= totalW/2) { median = val; break; }
  }
  return Math.min(90, Math.max(3, Math.round(median*0.7 + defaultDays*0.3)));
}

function effectiveInterval(plant, type) {
  const key = type+"Days";
  const defaults = { waterDays:7, flushDays:30, topdressDays:30, foliarDays:14 };
  if (plant.manualOverrides?.[key]) return plant.manualOverrides[key];
  const learned = learnedInterval(plant.logs||[], type, defaults[key]);
  const base = learned || plant.schedule?.[key] || defaults[key];
  // Apply pot/soil modifier to water interval only (flush/topdress are time-based, not dryness-based)
  if (type === "water" && !learned) {
    return Math.min(90, Math.max(2, Math.round(base * potModifier(plant))));
  }
  return base;
}

const toPacific = d => new Date(new Date(d).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
const todayStr  = () => toPacific(new Date()).toDateString();
const daysSince = d => {
  if (!d) return null;
  const nowP  = toPacific(new Date());
  const thenP = toPacific(new Date(d));
  const nowDay  = new Date(nowP.getFullYear(),  nowP.getMonth(),  nowP.getDate());
  const thenDay = new Date(thenP.getFullYear(), thenP.getMonth(), thenP.getDate());
  return Math.floor((nowDay - thenDay) / 86400000);
};
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", timeZone:"America/Los_Angeles" }) : "never";

function lastLogOf(plant, type) {
  const logs = (plant.logs||[]).filter(l=>l.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return logs[0]?.date || null;
}

function mkPlant() {
  return {
    schedule:{...DEFAULT_SCHED}, logs:[], deferred:{}, manualOverrides:{},
    location:"", addedDate:new Date().toISOString(),
    // pot & soil metadata — used by adaptive learning
    potSize:"",        // e.g. "2 inch", "4 inch", "6 inch"
    potMaterial:"",    // "plastic" | "terracotta"
    soilPreset:"",     // "chunky" | "medium" | "fine" | "leca" | "custom"
    soilNotes:"",      // free text
  };
}

// Pot/soil modifier for water interval
// Terracotta dries ~30% faster than plastic; smaller pots dry faster
function potModifier(plant) {
  let mod = 1.0;
  if (plant.potMaterial === "terracotta") mod *= 0.72; // dries faster → shorter interval
  const size = parseInt(plant.potSize)||0;
  if (size > 0 && size <= 2)  mod *= 0.57; // tiny — ~4d on base 7d
  else if (size >= 8)         mod *= 1.15; // big pot holds moisture longer
  // Chunky mix dries faster; fine mix holds more water
  if      (plant.soilPreset === "Chunky Aroid")   mod *= 0.85; // drains fast
  else if (plant.soilPreset === "Medium Aroid")   mod *= 0.95;
  else if (plant.soilPreset === "Coir + Perlite") mod *= 1.05; // holds some moisture
  else if (plant.soilPreset === "Tree Fern Fiber") mod *= 0.90;
  else if (plant.soilPreset === "Cactus Mix")     mod *= 0.80; // very fast draining
  else if (plant.soilPreset === "Semi-hydro")     mod *= 0.72; // near-LECA behavior
  else if (plant.soilPreset === "Perlite")        mod *= 0.70; // fastest draining
  return mod;
}

function initPlants() {
  const p = {};
  STARTER_PLANTS.forEach(n => { p[n] = mkPlant(); });
  return p;
}

function buildTasks(plants) {
  const today = todayStr();
  const tasks = [];
  Object.entries(plants).forEach(([name, p]) => {
    // ── Water vs Flush rotation ──────────────────────────────────────────────
    // Flush replaces a watering session — never appears alongside it.
    // When watering is due AND it has been >=30d since last flush → show Flush.
    // Logging a flush counts as a watering session for interval purposes.
    const waterThreshold = effectiveInterval(p, "water");
    const flushThreshold = 30;
    const waterLast = lastLogOf(p, "water");
    const flushLast = lastLogOf(p, "flush");
    const lastWaterSession = (waterLast && flushLast)
      ? (new Date(waterLast) > new Date(flushLast) ? waterLast : flushLast)
      : (waterLast || flushLast);
    const waterAge  = daysSince(lastWaterSession);
    const flushAge  = daysSince(flushLast);
    const sessionLoggedToday = lastWaterSession && toPacific(new Date(lastWaterSession)).toDateString()===today;
    const waterDue      = waterAge!==null && waterAge>=waterThreshold;
    const waterUpcoming = !waterDue && waterAge!==null && waterAge>=waterThreshold*0.75;
    const flushDue      = flushAge===null || flushAge>=flushThreshold;
    // buildTasks only decides WHAT task type to show based on schedule.
    // Deferral filtering (active vs deferred) is handled by the useEffect,
    // which checks p.deferred[t.type] — so flush deferred → flush stays deferred,
    // not incorrectly replaced by a water-overdue task.
    if (!sessionLoggedToday) {
      if (lastWaterSession===null) {
        tasks.push({ id:`${name}::water`, plant:name, type:"water", age:null, threshold:waterThreshold,
          last:null, overdue:false, due:true, upcoming:false, neverLogged:false, daysUntilDue:0 });
      } else if (waterDue && flushDue) {
        tasks.push({ id:`${name}::flush`, plant:name, type:"flush", age:waterAge, threshold:waterThreshold,
          last:flushLast, overdue:waterAge>waterThreshold, due:true, upcoming:false, neverLogged:false,
          replacesWater:true, daysUntilDue:0 });
      } else if (waterDue || waterUpcoming) {
        tasks.push({ id:`${name}::water`, plant:name, type:"water", age:waterAge, threshold:waterThreshold,
          last:lastWaterSession, overdue:waterAge>waterThreshold, due:waterDue, upcoming:waterUpcoming,
          neverLogged:false, daysUntilDue:waterThreshold-waterAge });
      }
    }
    // ── Topdress ─────────────────────────────────────────────────────────────
    // Use addedDate as fallback so never-topdressed plants age naturally
    // instead of flooding "Never Logged". A plant added 31+ days ago will
    // appear as overdue; a new plant won't appear until it's within the window.
    ["topdress"].forEach(type => {
      const threshold = effectiveInterval(p, type);
      const last = lastLogOf(p, type);
      const baseline = last || p.addedDate || null;
      const age  = daysSince(baseline);
      if (last && toPacific(new Date(last)).toDateString()===today) return;
      const def = p.deferred?.[type];
      if (def && new Date(def) > new Date() && toPacific(new Date(def)).toDateString()!==today) return;
      const overdue  = age!==null && age>threshold;
      const due      = age!==null && age>=threshold;
      const upcoming = !due && age!==null && age>=threshold*0.75;
      const daysUntilDue = age!==null ? threshold-age : null;
      if (overdue||due||upcoming)
        tasks.push({ id:`${name}::${type}`, plant:name, type, age, threshold, last, overdue, due, upcoming, neverLogged:false, daysUntilDue });
    });
  });
  tasks.sort((a,b)=>{
    const r=t=>t.overdue?0:t.due?1:t.neverLogged?2:3;
    return r(a)!==r(b) ? r(a)-r(b) : (b.age||0)-(a.age||0);
  });
  return tasks;
}

const SYSTEM_PROMPT = `You are Kym's personal Hoya care assistant. Kym is an experienced Hoya collector near Seattle with 100+ plants under grow lights.

Care routine:
- Every watering: Foliage Pro + Hydroguard (diluted). Water only when soil visually dry (clear nursery pots, chunky mix).
- Monthly flush: plain water only, no fertilizer, flush until water runs from drainage.
- Monthly top dress: thin layer of earthworm castings on soil surface.
- Foliar spray as needed, not during lights-on hours.
- Pest treatments logged with product used and next follow-up date.

Adaptive learning: each plant's watering interval is learned from actual log history (weighted median). Pot material (terracotta dries ~30% faster than plastic), pot size, and soil mix (Chunky Aroid/Cactus Mix/Perlite drain fastest, Medium Aroid is middle, Coir+Perlite holds more moisture, Semi-hydro behaves like LECA) all modify the base interval before learning kicks in. Defer signals push intervals out; early watering pulls them in.

NEVER recommend neem oil — spots and dulls waxy Hoya leaves.
Preferred pest controls: Spinosad (Captain Jack's), insecticidal soap + rinse, diatomaceous earth, Bonide systemics, sulfur (applied evenings only, not during lights-on).
Sigillatis has repeated failure history — flag extra caution for that plant.
Plants have location, pot size, pot material, and soil mix fields — use them when giving care advice.
Be warm, direct, and treat Kym as a knowledgeable peer.`

// ── Palette: warm white, sage, terracotta, dusty rose ────────────────────────
const BG      = "#faf8f5";   // warm white
const SURF    = "#f3efe9";   // light parchment
const CARD    = "#ffffff";   // pure white cards
const SAGE    = "#7a8c6e";   // sage green — primary accent
const SAGE_D  = "#5a6b50";   // darker sage
const TERRA   = "#b06b4a";   // terracotta
const ROSE    = "#c17a7a";   // dusty rose
const CLAY    = "#c4a882";   // warm clay / tan
const MUTED   = "#9e9080";   // warm grey text
const INK     = "#3d3530";   // near-black for headings
const BORDER  = "rgba(122,140,110,0.18)"; // sage border
const FONT    = "'DM Sans',sans-serif";
const SERIF   = "'Playfair Display',serif";

function Toast({msg,visible}){
  return (
    <div style={{position:"fixed",bottom:88,left:"50%",transform:`translateX(-50%) translateY(${visible?0:10}px)`,
      background:"#fff",border:"1px solid rgba(122,140,110,0.35)",borderRadius:24,padding:"9px 20px",
      fontSize:12,color:INK,fontFamily:FONT,opacity:visible?1:0,transition:"all .28s ease",
      zIndex:600,boxShadow:"0 4px 24px rgba(61,53,48,0.12)",pointerEvents:"none",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

// One card per plant, showing ALL due actions for that plant
function PlantTaskCard({plantName, location, tasks, onDone, onDefer, onOpenPlant}){
  const [wetFor, setWetFor] = useState(null); // type currently showing defer picker

  // Highest urgency across all tasks for this plant drives the card style
  const hasOverdue  = tasks.some(t=>t.overdue);
  const hasDue      = tasks.some(t=>t.due && !t.overdue);
  const bar  = hasOverdue ? TERRA : hasDue ? CLAY : SAGE;
  const bg   = hasOverdue ? "rgba(176,107,74,0.06)" : hasDue ? "rgba(196,168,130,0.08)" : CARD;

  return (
    <div style={{background:bg, borderRadius:14, border:`1px solid ${bar}40`,
      borderLeft:`3px solid ${bar}`, animation:"fadeUp .22s ease both", overflow:"hidden",
      boxShadow:"0 1px 6px rgba(61,53,48,0.06)"}}>

      {/* Plant name row */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px 8px"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13.5,color:INK,fontWeight:600,fontFamily:SERIF,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{plantName}</div>
          {location&&<div style={{fontSize:10,color:SAGE_D,marginTop:1}}>📍 {location}</div>}
        </div>
        <button onClick={()=>onOpenPlant(plantName)} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:20,padding:"3px 11px",fontSize:10,color:MUTED,fontFamily:FONT,flexShrink:0,letterSpacing:0.3}}>
          details
        </button>
      </div>

      {/* One row per action */}
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {tasks.map(task=>{
          const c = CARE[task.type];
          const isOD = task.overdue;
          const isDue = task.due && !task.overdue;
          const accentColor = isOD ? "#f09070" : isDue ? `hsl(${c.hue},65%,68%)` : "#8a7a60";
          const status = isOD                        ? `${task.age-task.threshold}d overdue`
            : task.due && task.age===null              ? "never watered — water now"
            : task.due                                 ? `${task.age}d since last`
            : `in ~${task.threshold-task.age}d`;

          return (
            <div key={task.type}>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderTop:`1px solid ${BORDER}`}}>
                <span style={{fontSize:16,flexShrink:0,width:22,textAlign:"center"}}>{c.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:isOD?TERRA:isDue?SAGE_D:MUTED,fontWeight:600}}>{c.label}</div>
                  <div style={{fontSize:10,color:MUTED,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.action}</div>
                </div>
                <div style={{fontSize:10,color:isOD?TERRA:isDue?CLAY:MUTED,flexShrink:0,marginRight:6,fontStyle:"italic"}}>{status}</div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button
                    onClick={()=>setWetFor(wetFor===task.type?null:task.type)}
                    style={{
                      background:wetFor===task.type?`${SAGE}18`:SURF,
                      border:`1px solid ${wetFor===task.type?SAGE:BORDER}`,
                      borderRadius:20,padding:"4px 9px",fontSize:10,
                      color:wetFor===task.type?SAGE_D:MUTED,fontFamily:FONT}}>
                    defer
                  </button>
                  <button onClick={()=>onDone(task)}
                    style={{background:SAGE,border:`1px solid ${SAGE_D}`,
                      borderRadius:20,padding:"4px 12px",fontSize:10,
                      color:"#fff",fontFamily:FONT,fontWeight:600}}>
                    ✓ done
                  </button>
                </div>
              </div>
              {wetFor===task.type&&(
                <div style={{padding:"6px 14px 9px 46px",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",background:`${SURF}`}}>
                  <span style={{fontSize:10,color:MUTED}}>Check back in:</span>
                  {[1,2,3,5].map(d=>(
                    <button key={d} onClick={()=>{onDefer(task,d);setWetFor(null);}}
                      style={{background:"#fff",border:`1px solid ${BORDER}`,
                        borderRadius:20,padding:"3px 10px",fontSize:10.5,color:SAGE_D,fontFamily:FONT,fontWeight:600}}>
                      {d}d
                    </button>
                  ))}
                  <span style={{fontSize:9,color:MUTED,fontStyle:"italic"}}>updates schedule</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlantSheet({name,plant,onLog,onClose,onDelete,onSetLocation,onRename}){
  const [schedEdit,setSchedEdit]=useState({});
  const [savedMsg,setSavedMsg]=useState("");
  const [confirmDel,setConfirmDel]=useState(false);
  const [editingLoc,setEditingLoc]=useState(false);
  const [locDraft,setLocDraft]=useState(plant.location||"");
  const [editingName,setEditingName]=useState(false);
  const [nameDraft,setNameDraft]=useState(name);
  const locRef=useRef(null);
  const nameRef=useRef(null);
  const logs=[...(plant.logs||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);

  useEffect(()=>{ if(editingLoc) setTimeout(()=>locRef.current?.focus(),60); },[editingLoc]);
  useEffect(()=>{ if(editingName) setTimeout(()=>{ nameRef.current?.focus(); nameRef.current?.select(); },60); },[editingName]);

  const submitRename = () => {
    const t = nameDraft.trim();
    if (t && t !== name) onRename(name, t);
    setEditingName(false);
  };

  const intervals = Object.entries(CARE).map(([type,c])=>{
    const key=type+"Days";
    const defs={waterDays:7,flushDays:30,topdressDays:30,foliarDays:14};
    const learned=learnedInterval(plant.logs||[],type,defs[key]);
    const manual=plant.manualOverrides?.[key];
    const eff=manual||learned||plant.schedule?.[key]||defs[key];
    const n=(plant.logs||[]).filter(l=>l.type===type).length;
    return {type,c,key,eff,learned,manual,n,def:defs[key]};
  });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,53,48,0.35)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:"20px 20px 0 0",padding:22,width:"100%",maxWidth:520,maxHeight:"84vh",overflowY:"auto",boxShadow:"0 -4px 40px rgba(61,53,48,0.12)"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div style={{flex:1,minWidth:0,paddingRight:12}}>
            {!editingName ? (
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontFamily:SERIF,fontSize:19,color:INK,lineHeight:1.2}}>{name}</div>
                <button onClick={()=>{setNameDraft(name);setEditingName(true);}} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:20,padding:"2px 9px",fontSize:10,color:MUTED,fontFamily:FONT,flexShrink:0}}>rename</button>
              </div>
            ) : (
              <div style={{display:"flex",gap:7,alignItems:"center"}}>
                <input ref={nameRef} value={nameDraft} onChange={e=>setNameDraft(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter")submitRename(); if(e.key==="Escape")setEditingName(false); }}
                  style={{flex:1,background:SURF,border:`1px solid ${SAGE}`,borderRadius:7,padding:"6px 10px",color:INK,fontFamily:SERIF,fontSize:16,fontWeight:500}}
                />
                <button onClick={submitRename} style={{background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:7,padding:"6px 10px",fontSize:11,color:"#fff",fontFamily:FONT,fontWeight:600}}>save</button>
                <button onClick={()=>setEditingName(false)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"6px 8px",fontSize:11,color:MUTED,fontFamily:FONT}}>✕</button>
              </div>
            )}
            <div style={{fontSize:10.5,color:MUTED,marginTop:3,letterSpacing:0.2}}>
              {plant.addedDate?`Added ${fmtDate(plant.addedDate)}`:""}
              {plant.logs?.length?` · ${plant.logs.length} care logs`:""}
            </div>
            {/* Location row */}
            <div style={{marginTop:10}}>
              {!editingLoc ? (
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:plant.location?INK:MUTED}}>
                    📍 {plant.location||<span style={{fontStyle:"italic",color:MUTED}}>No location set</span>}
                  </span>
                  <button onClick={()=>{setLocDraft(plant.location||"");setEditingLoc(true);}} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:20,padding:"2px 9px",fontSize:10,color:SAGE_D,fontFamily:FONT}}>
                    {plant.location?"edit":"add location"}
                  </button>
                </div>
              ) : (
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <input ref={locRef} value={locDraft} onChange={e=>setLocDraft(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter"){onSetLocation(name,locDraft);setEditingLoc(false);} if(e.key==="Escape")setEditingLoc(false); }}
                    placeholder="e.g. Shelf A, Prop box, South window"
                    style={{flex:1,background:SURF,border:`1px solid ${SAGE}`,borderRadius:7,padding:"6px 10px",color:INK,fontFamily:FONT,fontSize:12}}
                  />
                  <button onClick={()=>{onSetLocation(name,locDraft);setEditingLoc(false);}} style={{background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:7,padding:"6px 10px",fontSize:11,color:"#fff",fontFamily:FONT,fontWeight:600}}>save</button>
                  <button onClick={()=>setEditingLoc(false)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"6px 8px",fontSize:11,color:MUTED,fontFamily:FONT}}>✕</button>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:MUTED,fontSize:22,cursor:"pointer",lineHeight:1,flexShrink:0,padding:"0 4px"}}>×</button>
        </div>

        {/* Log buttons */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:1.8,marginBottom:9,fontWeight:600,fontFamily:SERIF,fontStyle:"italic"}}>Log Care</div>
          {/* Scheduled care */}
          <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:8}}>
            {Object.entries(CARE).filter(([,c])=>c.scheduled).map(([type,c])=>{
              const last=lastLogOf(plant,type);
              const age=daysSince(last);
              const eff=effectiveInterval(plant,type);
              const pct=age!==null?age/eff:null;
              const col=pct===null?"#7a6a5a":pct>1?"#e07050":pct>=.75?"#c4a060":"#8abd80";
              return (
                <button key={type} onClick={()=>onLog(name,type)} style={{background:col==="#7a6a5a"?SURF:`${col}15`,border:`1px solid ${col==="#7a6a5a"?BORDER:`${col}40`}`,borderRadius:12,padding:"8px 13px",fontSize:11.5,color:col==="#7a6a5a"?MUTED:col,fontFamily:FONT,textAlign:"left",minWidth:80,boxShadow:"0 1px 3px rgba(61,53,48,0.05)"}}>
                  <div style={{fontWeight:600}}>{c.icon} {c.label}</div>
                  <div style={{fontSize:9.5,marginTop:3,opacity:.8}}>{age===null?"never":`${age}d ago`}</div>
                </button>
              );
            })}
          </div>
          {/* Unscheduled events */}
          <div style={{display:"flex",gap:7}}>
            {Object.entries(CARE).filter(([,c])=>!c.scheduled).map(([type,c])=>(
              <button key={type} onClick={()=>onLog(name,type)} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:12,padding:"7px 13px",fontSize:11,color:MUTED,fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>
                {c.icon} <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pot & Soil metadata */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:1.8,marginBottom:9,fontWeight:600,fontFamily:SERIF,fontStyle:"italic"}}>Pot & Soil</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:9.5,color:MUTED,marginBottom:4}}>Pot size (inches)</div>
              <input type="number" min="1" max="24"
                defaultValue={plant.potSize||""}
                placeholder="e.g. 4"
                onChange={e=>onLog(name,"__meta__",{potSize:e.target.value})}
                style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 9px",color:INK,fontFamily:FONT,fontSize:12}}
              />
            </div>
            <div>
              <div style={{fontSize:9.5,color:MUTED,marginBottom:4}}>Pot material</div>
              <select defaultValue={plant.potMaterial||""}
                onChange={e=>onLog(name,"__meta__",{potMaterial:e.target.value})}
                style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 9px",color:plant.potMaterial?INK:MUTED,fontFamily:FONT,fontSize:12,appearance:"none"}}>
                <option value="">— select —</option>
                <option value="plastic">Plastic / nursery pot</option>
                <option value="terracotta">Terracotta</option>
              </select>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:9.5,color:MUTED,marginBottom:5}}>Soil mix</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:7}}>
              {["Chunky Aroid","Medium Aroid","Coir + Perlite","Tree Fern Fiber","Cactus Mix","Semi-hydro","Perlite"].map(p=>(
                <button key={p} onClick={()=>onLog(name,"__meta__",{soilPreset:p})}
                  style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontFamily:FONT,cursor:"pointer",
                    background:plant.soilPreset===p?SAGE:SURF,
                    border:`1px solid ${plant.soilPreset===p?SAGE_D:BORDER}`,
                    color:plant.soilPreset===p?"#fff":MUTED}}>
                  {p}
                </button>
              ))}
            </div>
            <input defaultValue={plant.soilNotes||""} placeholder="Optional notes — e.g. perlite heavy, added orchid bark"
              onBlur={e=>onLog(name,"__meta__",{soilNotes:e.target.value})}
              style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 9px",color:INK,fontFamily:FONT,fontSize:11}}
            />
          </div>
          {(plant.potMaterial||plant.potSize||plant.soilPreset)&&(
            <div style={{fontSize:9.5,color:SAGE_D,background:`${SAGE}12`,border:`1px solid ${SAGE}30`,borderRadius:7,padding:"6px 10px"}}>
              💡 Water interval adjusted: {plant.potMaterial==="terracotta"?"terracotta dries faster · ":""}{parseInt(plant.potSize)<=2&&plant.potSize?"tiny pot · ":parseInt(plant.potSize)>=8&&plant.potSize?"large pot holds moisture · ":""}{plant.soilPreset?plant.soilPreset+" mix":""} base interval: {effectiveInterval(plant,"water")}d
            </div>
          )}
        </div>

        {/* Adaptive schedule cards */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:1.8,marginBottom:9,fontWeight:600,fontFamily:SERIF,fontStyle:"italic"}}>Learned Schedule</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {intervals.map(({type,c,eff,learned,manual,n,def})=>(
              <div key={type} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:10.5,color:TERRA,marginBottom:5,fontWeight:600}}>{c.icon} {c.label}</div>
                <div style={{fontSize:20,color:INK,fontWeight:700,letterSpacing:-0.5,lineHeight:1,fontFamily:SERIF}}>{eff}d</div>
                <div style={{fontSize:9,color:MUTED,marginTop:4,lineHeight:1.4}}>
                  {manual?"✏ manual override":learned?`🧠 learned · ${n} logs`:`default · needs ${3-n} more log${3-n!==1?"s":""}`}
                </div>
                {learned&&!manual&&<div style={{fontSize:9,color:"#6a5a4a",marginTop:1}}>was {def}d default · adapts with each log</div>}
                {!learned&&!manual&&n>0&&<div style={{fontSize:9,color:"#5a4a3a",marginTop:1}}>defers &amp; early logs teach the schedule</div>}
              </div>
            ))}
          </div>
          {/* Override collapsible */}
          <details style={{marginTop:10}}>
            <summary style={{fontSize:11,color:SAGE_D,cursor:"pointer",padding:"6px 0",userSelect:"none",display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:10}}>⚙</span> Override intervals manually
            </summary>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:9}}>
              {[{k:"waterDays",l:"💧 Water"},{k:"flushDays",l:"🚿 Flush"},{k:"topdressDays",l:"🪱 Top Dress"},{k:"foliarDays",l:"🌿 Foliar"}].map(({k,l})=>(
                <div key={k}>
                  <div style={{fontSize:9.5,color:MUTED,marginBottom:3}}>{l}</div>
                  <input type="number" defaultValue={plant.manualOverrides?.[k]||plant.schedule?.[k]||DEFAULT_SCHED[k]}
                    onChange={e=>setSchedEdit(p=>({...p,[k]:parseInt(e.target.value)||1}))}
                    style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 9px",color:INK,fontFamily:FONT,fontSize:12}}
                  />
                </div>
              ))}
            </div>
            <button onClick={()=>{
              if(Object.keys(schedEdit).length){
                onLog(name,"__override__",schedEdit);
                setSavedMsg("Saved ✓");
                setTimeout(()=>setSavedMsg(""),1500);
              }
            }} style={{marginTop:9,background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:20,padding:"7px 16px",fontSize:11,color:"#fff",fontFamily:FONT,fontWeight:600}}>
              {savedMsg||"Save overrides"}
            </button>
          </details>
        </div>

        {/* Log history */}
        {logs.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:1.8,marginBottom:9,fontWeight:600,fontFamily:SERIF,fontStyle:"italic"}}>Care History</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {logs.map((l,i)=>{
                const meta = l.note && typeof l.note==="object" ? l.note : null;
                const noteStr = typeof l.note==="string" ? l.note : null;
                return (
                  <div key={i} style={{fontSize:11,color:MUTED,borderLeft:`2px solid ${BORDER}`,paddingLeft:9,marginBottom:3}}>
                    <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                      <span>{CARE[l.type]?.icon}</span>
                      <span style={{color:INK,fontWeight:600}}>{CARE[l.type]?.label}</span>
                      <span style={{color:MUTED,fontSize:10}}>{fmtDate(l.date)}</span>
                    </div>
                    {meta?.product&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>Product: {meta.product}</div>}
                    {meta?.nextDate&&<div style={{fontSize:10,color:SAGE_D,marginTop:2}}>Next due: {fmtDate(meta.nextDate)}</div>}
                    {(meta?.note||noteStr)&&<div style={{fontSize:10,color:MUTED,fontStyle:"italic",marginTop:2}}>{meta?.note||noteStr}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Delete */}
        <div style={{borderTop:"1px solid rgba(196,137,90,0.1)",paddingTop:14}}>
          {!confirmDel ? (
            <button onClick={()=>setConfirmDel(true)} style={{background:"transparent",border:"1px solid rgba(193,122,122,0.3)",borderRadius:20,padding:"6px 14px",fontSize:11,color:ROSE,fontFamily:FONT}}>
              Remove plant…
            </button>
          ):(
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11.5,color:"#c47060"}}>Remove {name}?</span>
              <button onClick={()=>{onDelete(name);onClose();}} style={{background:`${ROSE}18`,border:`1px solid ${ROSE}`,borderRadius:20,padding:"6px 12px",fontSize:11,color:ROSE,fontFamily:FONT}}>Yes, remove</button>
              <button onClick={()=>setConfirmDel(false)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"6px 12px",fontSize:11,color:MUTED,fontFamily:FONT}}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddPlantModal({onAdd,onClose}){
  const [name,setName]=useState("");
  const ref=useRef(null);
  useEffect(()=>{setTimeout(()=>ref.current?.focus(),80);},[]);
  const submit=()=>{ const t=name.trim(); if(!t)return; onAdd(t); onClose(); };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,5,2,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(7px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:26,width:"100%",maxWidth:360,animation:"fadeUp .2s ease",boxShadow:"0 8px 40px rgba(61,53,48,0.12)"}}>
        <div style={{fontFamily:SERIF,fontSize:19,color:INK,marginBottom:5}}>Add a new plant 🌱</div>
        <div style={{fontSize:11.5,color:MUTED,marginBottom:16}}>Enter any name, cultivar, or ID</div>
        <input ref={ref} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="e.g. Hoya Kerrii Splash"
          style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:10,padding:"11px 15px",color:INK,fontFamily:FONT,fontSize:13,marginBottom:14}}
        />
        <div style={{display:"flex",gap:8}}>
          <button onClick={submit} style={{flex:1,background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:10,padding:"11px",fontSize:13,color:"#fff",fontFamily:FONT,fontWeight:600}}>Add to collection</button>
          <button onClick={onClose} style={{flex:1,background:SURF,border:`1px solid ${BORDER}`,borderRadius:10,padding:"11px",fontSize:13,color:MUTED,fontFamily:FONT}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LogModal({plant,type,onLog,onClose}){
  const c=CARE[type];
  const [note,setNote]=useState("");
  const [pestProduct,setPestProduct]=useState("");
  const [pestNextDate,setPestNextDate]=useState("");
  const isPest = type==="pest";
  const isNote = type==="note";

  const handleLog = () => {
    if (isPest) {
      const payload = { product:pestProduct, nextDate:pestNextDate, note };
      onLog(plant, type, payload);
    } else {
      onLog(plant, type, note);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,53,48,0.3)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:24,width:"100%",maxWidth:380,animation:"fadeUp .2s ease",boxShadow:"0 8px 40px rgba(61,53,48,0.12)"}}>
        <div style={{fontFamily:SERIF,fontSize:18,color:INK,marginBottom:3}}>{c.icon} {c.label}</div>
        <div style={{fontSize:12,color:MUTED,marginBottom:10}}>{plant}</div>
        {/* Action instruction for scheduled types */}
        {c.action && !isPest && !isNote && (
          <div style={{background:`${SAGE}0e`,border:`1px solid ${SAGE}28`,borderRadius:8,padding:"9px 12px",fontSize:11,color:SAGE_D,lineHeight:1.6,marginBottom:14}}>
            {c.action}
          </div>
        )}
        {/* Pest-specific fields */}
        {isPest && (
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:1.5,fontStyle:"italic"}}>Product used</div>
              <input value={pestProduct} onChange={e=>setPestProduct(e.target.value)}
                placeholder="e.g. Captain Jack's, sulfur, insecticidal soap"
                style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 11px",color:INK,fontFamily:FONT,fontSize:12}}
              />
            </div>
            <div>
              <div style={{fontSize:10,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:1.5,fontStyle:"italic"}}>Next treatment due</div>
              <input type="date" value={pestNextDate} onChange={e=>setPestNextDate(e.target.value)}
                style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 11px",color:INK,fontFamily:FONT,fontSize:12,colorScheme:"dark"}}
              />
            </div>
          </div>
        )}
        <textarea value={note} onChange={e=>setNote(e.target.value)}
          placeholder={isPest?"Optional notes — e.g. signs observed, dilution used":isNote?"What did you observe?":"Optional note — e.g. soil was nearly dry, slight wilt"}
          rows={isPest?2:3}
          style={{width:"100%",background:SURF,border:`1px solid ${BORDER}`,borderRadius:9,padding:"10px 13px",color:INK,fontFamily:FONT,fontSize:12,resize:"none",marginBottom:13}}
        />
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleLog} style={{flex:1,background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:10,padding:"11px",fontSize:13,color:"#fff",fontFamily:FONT,fontWeight:600}}>Log today</button>
          <button onClick={onClose} style={{flex:1,background:SURF,border:`1px solid ${BORDER}`,borderRadius:10,padding:"11px",fontSize:13,color:MUTED,fontFamily:FONT}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Google Drive API (real OAuth, not MCP) ───────────────────────────────────
const GDRIVE_CLIENT_ID = "425465979045-j818osj85725uknva1o0mp0boabvtbrd.apps.googleusercontent.com";
const GDRIVE_API_KEY   = "AIzaSyA4sN1gHadoYR1fn5V-M8KksiXj138Ke8I";
const GDRIVE_SCOPE     = "https://www.googleapis.com/auth/drive.appdata";
const GDRIVE_FILE      = "happyroots-data.json";
// Using appDataFolder — a hidden private folder only this app can see.
// No clutter in your Drive, no sharing concerns.

let _gapiReady = false;
let _tokenClient = null;
let _accessToken = null;

function loadGapiScript() {
  return new Promise(resolve => {
    if (window.gapi) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function loadGisScript() {
  return new Promise(resolve => {
    if (window.google?.accounts) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

async function initGapi() {
  if (_gapiReady) return;
  await loadGapiScript();
  await new Promise(resolve => window.gapi.load("client", resolve));
  await window.gapi.client.init({ apiKey: GDRIVE_API_KEY, discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
  _gapiReady = true;
}

async function getAccessToken(forcePrompt = false) {
  if (_accessToken && !forcePrompt) return _accessToken;
  await loadGisScript();
  return new Promise((resolve, reject) => {
    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GDRIVE_CLIENT_ID,
        scope: GDRIVE_SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(resp); return; }
          _accessToken = resp.access_token;
          // Remember that this user has authed so we try silently next time
          try { localStorage.setItem("hr-drive-authed", "1"); } catch {}
          setTimeout(() => { _accessToken = null; }, (resp.expires_in - 60) * 1000);
          resolve(_accessToken);
        },
      });
    } else {
      // Reuse existing client, just update callback
      _tokenClient.callback = (resp) => {
        if (resp.error) { reject(resp); return; }
        _accessToken = resp.access_token;
        try { localStorage.setItem("hr-drive-authed", "1"); } catch {}
        setTimeout(() => { _accessToken = null; }, (resp.expires_in - 60) * 1000);
        resolve(_accessToken);
      };
    }
    // Use empty prompt for silent re-auth if previously authed, otherwise show picker
    const prompt = forcePrompt ? "consent" : "";
    _tokenClient.requestAccessToken({ prompt });
  });
}

async function driveReadFile() {
  await initGapi();
  const token = await getAccessToken();
  // Find file in appDataFolder
  const list = await window.gapi.client.drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${GDRIVE_FILE}'`,
    fields: "files(id,name,modifiedTime)",
  });
  const files = list.result.files || [];
  if (!files.length) return null;
  const fileId = files[0].id;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function driveWriteFile(payload) {
  await initGapi();
  const token = await getAccessToken();
  const body = JSON.stringify({ ...payload, savedAt: new Date().toISOString() });

  // Check if file already exists
  const list = await window.gapi.client.drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${GDRIVE_FILE}'`,
    fields: "files(id)",
  });
  const files = list.result.files || [];

  if (files.length) {
    // Update existing file
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
  } else {
    // Create new file in appDataFolder
    const meta = JSON.stringify({ name: GDRIVE_FILE, parents: ["appDataFolder"] });
    const form = new FormData();
    form.append("metadata", new Blob([meta], { type: "application/json" }));
    form.append("file",     new Blob([body], { type: "application/json" }));
    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }
}

export default function App() {
  const [plants,setPlants]           = useState(null);
  const [view,setView]               = useState("today");
  const [tasks,setTasks]             = useState([]);
  const [doneTasks,setDoneTasks]     = useState([]);
  const [deferredTasks,setDeferred]  = useState([]);
  const [detailPlant,setDetailPlant] = useState(null);
  const [logModal,setLogModal]       = useState(null);
  const [addModal,setAddModal]       = useState(false);
  const [search,setSearch]           = useState("");
  const [locFilter,setLocFilter]     = useState("");
  const [chatMsgs,setChatMsgs]       = useState([]);
  const [chatInput,setChatInput]     = useState("");
  const [chatLoading,setChatLoading] = useState(false);
  const [toast,setToast]             = useState({msg:"",visible:false});
  const [driveStatus,setDriveStatus] = useState("idle"); // idle | connecting | syncing | saved | error
  const [driveAuthed,setDriveAuthed] = useState(false);
  const [showDataMenu,setShowDataMenu] = useState(false);
  const chatEnd = useRef(null);
  const saveTimer = useRef(null);
  const importRef = useRef(null);
  const driveAuthedRef = useRef(false); // ref so persist closure never goes stale



  const showToast = msg => { setToast({msg,visible:true}); setTimeout(()=>setToast(t=>({...t,visible:false})),2800); };

  // ── Stable local storage keys — never change these ────────────────────────
  const PLANTS_KEY  = "hoya-plants-stable";
  const CHAT_KEY    = "hoya-chat-stable";
  const LEGACY_KEYS = ["hoya-v5","hoya-v4","hoya-v3"];
  const LEGACY_CHAT = ["hoya-v5-chat","hoya-v4-chat","hoya-v3-chat"];

  function readLocal() {
    const allKeys = ["hr-session","hoya-plants-stable","hoya-v5","hoya-v4","hoya-v3"];
    for (const k of allKeys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) { console.log("key " + k + ": not found"); continue; }
        const parsed = JSON.parse(raw);
        const plants = (parsed && parsed.plants && typeof parsed.plants === "object") ? parsed.plants : parsed;
        if (plants && typeof plants === "object" && !Array.isArray(plants) && Object.keys(plants).length > 0) {
          console.log("✓ loaded " + Object.keys(plants).length + " plants from: " + k);
          if (k !== "hoya-plants-stable") {
            localStorage.setItem("hoya-plants-stable", JSON.stringify({ plants, savedAt: new Date().toISOString() }));
            console.log("migrated to stable key");
          }
          return plants;
        } else {
          console.log("key " + k + ": empty/invalid");
        }
      } catch(e) {
        console.log("key " + k + " error: " + String(e));
      }
    }
    return null;
  }

  function readLocalChat() {
    const allChatKeys = ["hoya-chat-stable","hoya-v5-chat","hoya-v4-chat","hoya-v3-chat"];
    for (const k of allChatKeys) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const d = JSON.parse(raw);
          if (k !== "hoya-chat-stable") localStorage.setItem("hoya-chat-stable", raw);
          return d;
        }
      } catch {}
    }
    return null;
  }

  // Load on mount: local first (instant), then Drive in background
  useEffect(()=>{
    (async()=>{
      // ── localStorage sanity check ──────────────────────────────────────────
      try {
        localStorage.setItem("hoya-test", "ok");
        const testVal = localStorage.getItem("hoya-test");
        console.log("✓ localStorage OK: " + testVal);
        // List all hoya keys
        for (let i=0; i<localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("hoya")) {
            const len = localStorage.getItem(k)?.length || 0;
            console.log("found: " + k + " (" + len + " chars)");
          }
        }
      } catch(e) {
        console.log("✗ localStorage BROKEN: " + String(e));
      }
      // 1. Load local immediately (synchronous localStorage)
      const local = readLocal();
      const localChat = readLocalChat();
      console.log(local ? ("✓ loaded " + Object.keys(local).length + " plants") : "⚠ no local data — starting fresh");
      setPlants(local || initPlants());
      if (localChat) setChatMsgs(localChat);

      // 2. Try Drive — always. Silent re-auth if previously connected.
      setDriveStatus("connecting");
      const prevAuthed = localStorage.getItem("hr-drive-authed") === "1";
      console.log(prevAuthed ? "previously authed — trying Drive" : "first time — need to connect Drive");
      try {
        const driveData = await driveReadFile();
        if (driveData?.plants) {
          setPlants(driveData.plants);
          if (driveData.chat) setChatMsgs(driveData.chat);
          try { localStorage.setItem("hr-session", JSON.stringify({ plants: driveData.plants, savedAt: driveData.savedAt })); } catch {}
          setDriveAuthed(true); driveAuthedRef.current = true;
          try { localStorage.setItem("hr-drive-authed","1"); } catch {}
          setDriveStatus("saved");
          console.log("✓ Drive loaded " + Object.keys(driveData.plants).length + " plants");
          showToast("☁️ Loaded from Google Drive");
        } else {
          setDriveAuthed(true); driveAuthedRef.current = true;
          setDriveStatus("idle");
          console.log("Drive connected, no file yet — will create on first save");
        }
      } catch(e) {
        console.log("Drive load error: " + (e?.message||String(e)));
        setDriveStatus("disconnected");
      }
    })();
  },[]);

  // Connect to Drive manually (triggers Google OAuth popup)
  async function connectDrive() {
    setDriveStatus("connecting");
    console.log("connectDrive: starting auth flow");
    try {
      await initGapi();
      console.log("GAPI ready, requesting token...");
      _accessToken = null;
      const token = await getAccessToken(true);
      console.log("✓ got token: " + token.slice(0,10) + "...");
      setDriveAuthed(true); driveAuthedRef.current = true;
      try { localStorage.setItem("hr-drive-authed","1"); } catch {}
      setDriveStatus("syncing");
      showToast("☁️ Signed in — loading your data…");
      console.log("loading from Drive...");
      const driveData = await driveReadFile();
      if (driveData?.plants) {
        const count = Object.keys(driveData.plants).length;
        console.log("✓ loaded " + count + " plants from Drive");
        setPlants(driveData.plants);
        if (driveData.chat) setChatMsgs(driveData.chat);
        try { localStorage.setItem("hr-session", JSON.stringify({ plants: driveData.plants, savedAt: driveData.savedAt })); } catch {}
        setDriveStatus("saved");
        showToast("☁️ Loaded " + count + " plants from Drive");
      } else {
        console.log("no Drive file yet — will create on first save");
        setDriveStatus("saved");
        showToast("☁️ Drive connected — ready to save");
      }
    } catch(e) {
      const msg = e?.error || e?.message || String(e);
      console.log("✗ Drive auth failed: " + msg);
      setDriveStatus("disconnected");
      if (msg.includes("popup") || msg.includes("blocked")) {
        showToast("⚠️ Popup blocked — allow popups for claude.ai");
      } else {
        showToast("⚠️ Drive connection failed: " + msg);
      }
    }
  }

  // Debounced persist: local immediately, Drive 4s later
  const persist = useCallback(async (p, chat) => {
    const KEY = "hoya-plants-stable"; // hardcoded — no closure dependency
    console.log("persist called: " + (p ? Object.keys(p).length + " plants" : "NULL"));
    if (!p || typeof p !== "object") { console.log("✗ persist: invalid data"); return; }
    const saved = { plants: p, savedAt: new Date().toISOString() };
    // ── Local save (synchronous localStorage) ────────────────────────────────
    try {
      const json = JSON.stringify(saved);
      localStorage.setItem(KEY, json);
      // Verify immediately
      const verify = localStorage.getItem(KEY);
      if (verify) {
        const vp = JSON.parse(verify);
        const count = vp?.plants ? Object.keys(vp.plants).length : "?";
        console.log("✓ saved & verified: " + count + " plants");
      } else {
        console.log("✗ save failed — key missing after write");
      }
    } catch(e) {
      console.log("✗ local save FAILED: " + String(e));
    }
    // ── Drive save (debounced 4s) ────────────────────────────────────────────
    if (!driveAuthedRef.current) {
      console.log("Drive not authed — local only");
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDriveStatus("syncing");
    saveTimer.current = setTimeout(async () => {
      try {
        await driveWriteFile({ plants: p, chat: (chat||[]).slice(-40), savedAt: saved.savedAt });
        setDriveStatus("saved");
        console.log("✓ Drive saved");
      } catch(e) {
        console.log("✗ Drive save FAILED: " + e);
        setDriveStatus("error");
      }
    }, 4000);
  }, []);

  useEffect(()=>{
    if(!plants) return;
    const today=todayStr();
    const all=buildTasks(plants);
    const active=[],done=[],deferred=[];
    all.forEach(t=>{
      const p=plants[t.plant];
      const last=lastLogOf(p,t.type);
      if(last&&toPacific(new Date(last)).toDateString()===today){done.push(t);return;}
      const def=p.deferred?.[t.type];
      if(def&&(toPacific(new Date(def)).toDateString()===today||new Date(def)>new Date())){deferred.push(t);return;}
      active.push(t);
    });
    setTasks(active); setDoneTasks(done); setDeferred(deferred);
  },[plants]);

  // ── Auto-save whenever plants changes ─────────────────────────────────────
  // This is the canonical React pattern: derive saves from state, not from event handlers.
  // The isFirstLoad ref prevents saving the initial load back over itself.
  const isFirstLoad = useRef(true);
  useEffect(()=>{
    if(!plants) return;
    if(isFirstLoad.current){ isFirstLoad.current = false; return; }
    console.log("plants changed → persist " + Object.keys(plants).length + " plants");
    persist(plants, chatMsgs);
  },[plants]);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[chatMsgs,chatLoading]);

  // ── All mutation functions follow the same pattern: ──────────────────────────
  // 1. Compute the full new plants object (don't rely on prev inside setPlants for persist)
  // 2. Call setPlants with it
  // 3. Call persist with it directly — no closures, no setTimeout, no stale state

  function logCare(plantName, type, extra="") {
    setPlants(prev => {
      let n;
      if (type === "__override__") {
        const p = prev[plantName];
        n = { ...prev, [plantName]: { ...p, manualOverrides: { ...(p.manualOverrides||{}), ...extra } } };
        showToast("Schedule updated");
      } else if (type === "__meta__") {
        const p = prev[plantName];
        n = { ...prev, [plantName]: { ...p, ...extra } };
        // silent
      } else {
        const p = prev[plantName];
        const clearTypes = type==="flush" ? [type,"water"] : [type];
        const newDeferred = {...(p.deferred||{})};
        clearTypes.forEach(t=>{ newDeferred[t]=null; });
        n = { ...prev, [plantName]: { ...p,
          logs: [...(p.logs||[]), { type, date: new Date().toISOString(), note: typeof extra==="string" ? extra : extra?.note||"", ...(typeof extra==="object" && extra!==null ? {pestData:extra} : {}) }],
          deferred: newDeferred,
        }};
        showToast(`${CARE[type].icon} ${CARE[type].label} logged`);
        setLogModal(null);
      }
      return n;
    });
  }

  function deferTask(task, days=1) {
    const until = new Date(); until.setDate(until.getDate()+days);
    setPlants(prev => {
      const p = prev[task.plant];
      const logs = [...(p.logs||[])];
      const lastIdx = logs.map(l=>l.type).lastIndexOf(task.type);
      if (lastIdx !== -1) logs[lastIdx] = { ...logs[lastIdx], wetDays: (logs[lastIdx].wetDays||0)+days };
      const n = { ...prev, [task.plant]: { ...p, logs, deferred: { ...(p.deferred||{}), [task.type]: until.toISOString() } } };
      return n;
    });
    showToast(`${task.plant} — checking back in ${days} day${days>1?"s":""} · schedule updated`);
  }

  function addPlant(name) {
    setPlants(prev => {
      if (prev[name]) return prev;
      const n = { ...prev, [name]: mkPlant() };
      return n;
    });
    showToast(`🌱 ${name} added to your collection`);
  }

  function deletePlant(name) {
    setPlants(prev => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
    showToast(`${name} removed`);
  }

  function renamePlant(oldName, newName) {
    if (!newName.trim() || newName === oldName) return;
    setPlants(prev => {
      if (prev[newName]) { showToast("A plant with that name already exists"); return prev; }
      const n = { ...prev };
      n[newName] = { ...n[oldName] };
      delete n[oldName];
      return n;
    });
    setDetailPlant(newName);
    showToast(`✏️ Renamed to ${newName}`);
  }

  function setPlantLocation(name, location) {
    setPlants(prev => {
      const n = { ...prev, [name]: { ...prev[name], location: location.trim() } };
      return n;
    });
    showToast(`📍 Location saved for ${name}`);
  }

  function exportData() {
    const payload = { plants, chat: chatMsgs.slice(-40), exportedAt: new Date().toISOString(), version: "stable" };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hoya-scheduler-backup.json"; a.click();
    URL.revokeObjectURL(url);
    showToast("📥 Backup downloaded");
    setShowDataMenu(false);
  }

  function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        const imported = data.plants || data; // support both wrapped and bare formats
        if (typeof imported !== "object" || Array.isArray(imported)) throw new Error("Invalid format");
        setPlants(imported);
        if (data.chat) setChatMsgs(data.chat);
        localStorage.setItem("hoya-plants-stable", JSON.stringify({ plants: imported, savedAt: new Date().toISOString() }));
        persist(imported, data.chat || chatMsgs);
        showToast(`✅ Imported ${Object.keys(imported).length} plants`);
      } catch { showToast("⚠️ Couldn't read that file — is it a valid backup?"); }
    };
    reader.readAsText(file);
    setShowDataMenu(false);
  }

  async function sendChat(msg){
    if(!msg.trim()||chatLoading) return;
    setChatLoading(true);
    const userMsg={role:"user",content:msg};
    const next=[...chatMsgs,userMsg];
    setChatMsgs(next); setChatInput("");
    const ctx=tasks.filter(t=>t.overdue||t.due).slice(0,20)
      .map(t=>{
        const p=plants[t.plant]||{};
        const meta=[];
        if(p.location) meta.push(p.location);
        if(p.potMaterial) meta.push(p.potMaterial);
        if(p.potSize) meta.push(`${p.potSize}"`);
        if(p.soilPreset) meta.push(`${p.soilPreset} mix`);
        return `${t.plant}${meta.length?` (${meta.join(", ")})`:""}: ${CARE[t.type].label} (${t.age!==null?`${t.age}d since last`:"never logged"})`;
      }).join("\n");
    const sys=SYSTEM_PROMPT+(ctx?`\n\nCurrently due/overdue:\n${ctx}`:"");
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,
          messages:next.map(m=>({role:m.role,content:m.content}))})
      });
      const data=await res.json();
      const reply=data.content?.map(b=>b.text||"").join("")||"No response.";
      const final=[...next,{role:"assistant",content:reply}];
      setChatMsgs(final);
      try { localStorage.setItem("hoya-chat-stable", JSON.stringify(final.slice(-40))); persist(plants||{}, final.slice(-40)); } catch {}
    } catch { setChatMsgs([...next,{role:"assistant",content:"Connection error — try again."}]); }
    setChatLoading(false);
  }

  if(!plants) return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",color:SAGE_D,fontFamily:SERIF,fontSize:15}}>
      Loading your collection…
    </div>
  );

  const overdueCt=tasks.filter(t=>t.overdue).length;
  const dueCt=tasks.filter(t=>t.due&&!t.overdue).length;
  const upcomingCt=tasks.filter(t=>t.upcoming||t.neverLogged).length;
  const allLocations=[...new Set(Object.values(plants).map(p=>p.location).filter(Boolean))].sort();

  // Group flat task list by plant name, preserving sort order of first occurrence
  const groupByPlant = (taskList) => {
    const map = {};
    const order = [];
    taskList.forEach(t => {
      if (!map[t.plant]) { map[t.plant] = []; order.push(t.plant); }
      map[t.plant].push(t);
    });
    return order.map(name => ({ name, tasks: map[name] }));
  };

  const PlantSection = ({color,label,taskList}) => {
    const groups = groupByPlant(taskList);
    if (!groups.length) return null;
    return (
      <section style={{marginBottom:20}}>
        <div style={{fontSize:10,color,textTransform:"uppercase",letterSpacing:2,marginBottom:9,fontWeight:700}}>{label} · {groups.length} plant{groups.length!==1?"s":""}</div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {groups.map(({name,tasks:grpTasks})=>(
            <PlantTaskCard key={name} plantName={name} tasks={grpTasks}
              location={plants[name]?.location||""}
              onDone={t=>setLogModal({plant:t.plant,type:t.type})}
              onDefer={(t,d)=>deferTask(t,d)}
              onOpenPlant={name=>{setDetailPlant(name);}}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:BG,color:INK,fontFamily:FONT,paddingBottom:84}} onClick={()=>setShowDataMenu(false)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(122,140,110,0.3);border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        button{transition:opacity .14s,transform .1s;cursor:pointer}
        button:hover{opacity:.82}button:active{transform:scale(.97)}
        input,textarea{outline:none}
        details summary{list-style:none;cursor:pointer}
        details summary::-webkit-details-marker{display:none}
      `}</style>

      {/* HEADER */}
      <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(250,248,245,0.95)",backdropFilter:"blur(14px)",borderBottom:`1px solid ${BORDER}`,padding:"15px 18px 12px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontFamily:SERIF,fontSize:21,color:INK,letterSpacing:0.2,lineHeight:1.1,marginBottom:4}}>🌿 HappyRoots</div>
            <div style={{fontSize:10.5,color:MUTED,display:"flex",alignItems:"center",gap:6}}>
              {Object.keys(plants).length} plants
              {driveStatus==="connecting"    && <span style={{color:"#a09060",fontSize:9.5,animation:"pulse 1.4s infinite"}}>☁️ connecting…</span>}
              {driveStatus==="syncing"       && <span style={{color:"#a09060",fontSize:9.5,animation:"pulse 1.4s infinite"}}>☁️ saving…</span>}
              {driveStatus==="saved"         && <span style={{color:"#8abd80",fontSize:9.5}}>☁️ Drive synced</span>}
              {driveStatus==="error"         && <span style={{color:"#e07050",fontSize:9.5}} title="Drive error — data saved locally">⚠️ local only</span>}
              {(driveStatus==="disconnected"||driveStatus==="idle") && !driveAuthed && (
                <button onClick={connectDrive} style={{fontSize:10,color:"#fff",background:TERRA,border:"none",borderRadius:10,padding:"3px 12px",fontFamily:FONT,cursor:"pointer",fontWeight:600}}>
                  ☁️ Connect Drive
                </button>
              )}
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end",marginTop:2}}>
            {overdueCt>0  && <span style={{background:`${TERRA}18`,color:TERRA,border:`1px solid ${TERRA}50`,borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>{overdueCt} overdue</span>}
            {dueCt>0      && <span style={{background:`${CLAY}22`,color:TERRA,border:`1px solid ${CLAY}60`,borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>{dueCt} due today</span>}
            {doneTasks.length>0 && <span style={{background:`${SAGE}15`,color:SAGE_D,border:`1px solid ${SAGE}40`,borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>{doneTasks.length} done ✓</span>}
            {overdueCt===0&&dueCt===0&&doneTasks.length===0 && <span style={{background:`${SAGE}12`,color:SAGE_D,border:`1px solid ${SAGE}30`,borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:600}}>all clear ✓</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:5}}>
            {[["today","Today"],["all","All Plants"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{
                padding:"6px 15px",borderRadius:20,fontSize:12,
                background:view===v?"rgba(196,137,90,0.2)":"transparent",
                color:view===v?"#fff":MUTED,
                border:`1px solid ${view===v?"rgba(196,137,90,0.38)":BORDER}`,
                fontFamily:FONT,fontWeight:view===v?700:400,letterSpacing:0.3
              }}>{l}</button>
            ))}
          </div>
          {/* Data menu */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowDataMenu(v=>!v)} style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:20,padding:"6px 12px",fontSize:11,color:MUTED,fontFamily:FONT}} title="Backup &amp; restore">
              ⋯
            </button>
            {showDataMenu&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:8,zIndex:100,minWidth:170,boxShadow:"0 8px 32px rgba(61,53,48,0.12)"}}>
                <button onClick={exportData} style={{display:"block",width:"100%",background:"transparent",border:"none",padding:"8px 12px",fontSize:12,color:INK,fontFamily:FONT,textAlign:"left",borderRadius:7,cursor:"pointer"}}>
                  📥 Download backup
                </button>
                <button onClick={()=>importRef.current?.click()} style={{display:"block",width:"100%",background:"transparent",border:"none",padding:"8px 12px",fontSize:12,color:INK,fontFamily:FONT,textAlign:"left",borderRadius:7,cursor:"pointer"}}>
                  📤 Restore from file
                </button>
                <input ref={importRef} type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
                <div style={{borderTop:"1px solid rgba(196,137,90,0.1)",margin:"4px 0"}}/>
                <div style={{padding:"4px 12px",fontSize:10,color:MUTED}}>Data stored in Google Drive</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TODAY */}
      {view==="today" && (
        <div style={{padding:"16px 16px 0"}}>
          {!driveAuthed && driveStatus !== "connecting" && (
            <div style={{background:`${TERRA}10`,border:`1px solid ${TERRA}30`,borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>☁️</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:TERRA,fontWeight:600,fontFamily:SERIF}}>Connect Google Drive to save your data</div>
                <div style={{fontSize:11,color:MUTED,marginTop:2}}>Your changes won't persist between sessions without Drive.</div>
              </div>
              <button onClick={connectDrive} style={{background:TERRA,border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#fff",fontFamily:FONT,fontWeight:600,flexShrink:0}}>
                Connect
              </button>
            </div>
          )}
          {tasks.length===0&&doneTasks.length===0&&deferredTasks.length===0 ? (
            <div style={{textAlign:"center",padding:"72px 24px",animation:"fadeUp .3s ease"}}>
              <div style={{fontSize:56,marginBottom:16}}>🌿</div>
              <div style={{fontFamily:SERIF,fontSize:22,color:INK,marginBottom:10}}>All caught up!</div>
              <div style={{fontSize:13,color:MUTED,lineHeight:1.8,fontStyle:"italic"}}>Nothing due or overdue today.<br/>Enjoy your plants.</div>
            </div>
          ):<>
            <PlantSection color="#f09070" label="⚠ Overdue"     taskList={tasks.filter(t=>t.overdue)} />
            <PlantSection color="#d4b060" label="Due Today"      taskList={tasks.filter(t=>t.due&&!t.overdue)} />
            <PlantSection color="#c4a060" label="Due Tomorrow"   taskList={tasks.filter(t=>!t.due&&!t.overdue&&t.daysUntilDue===1)} />
            <PlantSection color="#a09070" label="Coming Up"      taskList={tasks.filter(t=>!t.due&&!t.overdue&&t.upcoming&&t.daysUntilDue!==1)} />
            {doneTasks.length>0&&(
              <section style={{marginBottom:20}}>
                <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:2,marginBottom:9,fontWeight:700}}>Done Today ✓</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {groupByPlant(doneTasks).map(({name,tasks:grp})=>(
                    <div key={name} style={{background:CARD,border:`1px solid ${SAGE}25`,borderLeft:`3px solid ${SAGE}60`,borderRadius:11,padding:"9px 14px",opacity:0.7,boxShadow:"0 1px 4px rgba(61,53,48,0.05)"}}>
                      <div style={{fontSize:13,color:INK,fontWeight:600,marginBottom:4,fontFamily:SERIF}}>{name}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {grp.map(t=>(
                          <span key={t.type} style={{fontSize:10.5,color:SAGE_D,background:`${SAGE}15`,borderRadius:20,padding:"2px 9px"}}>
                            {CARE[t.type]?.icon} {CARE[t.type]?.label} ✓
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {deferredTasks.length>0&&(
              <section style={{marginBottom:20}}>
                <div style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:2,marginBottom:9,fontWeight:700}}>Deferred</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {groupByPlant(deferredTasks).map(({name,tasks:grp})=>(
                    <div key={name} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:11,padding:"9px 14px",boxShadow:"0 1px 4px rgba(61,53,48,0.05)"}}>
                      <div style={{fontSize:13,color:INK,fontWeight:600,marginBottom:5,fontFamily:SERIF}}>{name}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {grp.map(t=>{
                          const def=plants[t.plant]?.deferred?.[t.type];
                          return (
                            <div key={t.type} style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:13}}>{CARE[t.type]?.icon}</span>
                              <span style={{fontSize:11,color:MUTED,flex:1}}>{CARE[t.type]?.label} · back {fmtDate(def)}</span>
                              <button onClick={()=>setLogModal({plant:t.plant,type:t.type})} style={{background:`${TERRA}15`,border:`1px solid ${TERRA}40`,borderRadius:20,padding:"3px 9px",fontSize:10,color:TERRA,fontFamily:FONT,fontWeight:600}}>do it now</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>}
        </div>
      )}

      {/* ALL PLANTS */}
      {view==="all" && (
        <div style={{padding:16}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your collection…"
              style={{flex:1,background:CARD,border:`1px solid ${BORDER}`,borderRadius:20,padding:"9px 16px",color:INK,fontFamily:FONT,fontSize:12.5}}
            />
            <button onClick={()=>setAddModal(true)} style={{background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:20,padding:"9px 16px",fontSize:12,color:"#fff",fontFamily:FONT,fontWeight:600,flexShrink:0}}>
              + Add plant
            </button>
          </div>
          {allLocations.length>0&&(
            <div style={{marginBottom:10}}>
              <select value={locFilter} onChange={e=>setLocFilter(e.target.value)}
                style={{width:"100%",background:CARD,border:`1px solid ${locFilter?SAGE:BORDER}`,borderRadius:12,padding:"8px 14px",
                  color:locFilter?INK:MUTED,fontFamily:FONT,fontSize:12,appearance:"none",
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239e9080' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center",paddingRight:34}}>
                <option value="">📍 All locations</option>
                {allLocations.map(l=><option key={l} value={l}>📍 {l}</option>)}
              </select>
            </div>
          )}
          <div style={{display:"flex",gap:10,marginBottom:12,fontSize:10.5,color:MUTED,alignItems:"center"}}>
            <span>status: </span>
            {[["#8abd80","ok"],["#d4a040","soon"],["#e07050","overdue"]].map(([col,lbl])=>(
              <span key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:col,display:"inline-block"}}/>
                {lbl}
              </span>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {Object.keys(plants).filter(n=>(!search||n.toLowerCase().includes(search.toLowerCase()))&&(!locFilter||plants[n].location===locFilter)).sort().map(name=>{
              const p=plants[name];
              const dot=type=>{
                const eff=effectiveInterval(p,type);
                const age=daysSince(lastLogOf(p,type));
                const col=age===null?"#4a3828":age>=eff?"#e07050":age>=eff*.75?"#d4a040":"#8abd80";
                return <span key={type} style={{width:7,height:7,borderRadius:"50%",background:col,boxShadow:age!==null&&age>=eff?`0 0 5px ${col}`:"none",display:"inline-block",flexShrink:0}}/>;
              };
              const lc=(p.logs||[]).length;
              return (
                <div key={name} onClick={()=>setDetailPlant(name)} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 15px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .15s",boxShadow:"0 1px 4px rgba(61,53,48,0.05)"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:INK,fontWeight:500,fontFamily:SERIF,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                    {p.location&&<div style={{fontSize:10,color:SAGE_D,marginTop:2}}>📍 {p.location}</div>}
                  </div>
                  {lc>0&&<div style={{fontSize:9.5,color:MUTED,flexShrink:0}}>{lc} log{lc!==1?"s":""}</div>}
                  <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>{["water","flush","topdress"].map(dot)}</div>
                  <span style={{color:MUTED,fontSize:13}}>›</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={()=>setAddModal(true)} style={{position:"fixed",bottom:22,right:20,width:52,height:52,borderRadius:"50%",background:SAGE,border:`1.5px solid ${SAGE_D}`,fontSize:22,boxShadow:"0 4px 20px rgba(90,107,80,0.35)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",zIndex:40}} title="Add plant">＋</button>


      {detailPlant&&plants[detailPlant]&&(
        <PlantSheet name={detailPlant} plant={plants[detailPlant]}
          onLog={(name,type,extra)=>{
            if(type==="__override__"||type==="__meta__"){
              logCare(name,type,extra);          // silent saves, stay on sheet
            } else {
              setDetailPlant(null);              // close sheet, open log modal
              setLogModal({plant:name,type});
            }
          }}
          onClose={()=>setDetailPlant(null)} onDelete={deletePlant} onSetLocation={setPlantLocation} onRename={renamePlant}
        />
      )}
      {logModal&&<LogModal plant={logModal.plant} type={logModal.type} onLog={logCare} onClose={()=>setLogModal(null)}/>}
      {addModal&&<AddPlantModal onAdd={addPlant} onClose={()=>setAddModal(false)}/>}
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );
}
