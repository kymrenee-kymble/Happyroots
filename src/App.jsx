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
  water:    { label:"Water + Ferts",  icon:"💧", hue:"196", defaultDays:10,
              action:"Water thoroughly with Foliage Pro & Hydroguard (diluted). Check soil visually — water only when mix is dry.", scheduled:true },
  flush:    { label:"Flush (replaces Water)",  icon:"🚿", hue:"258", defaultDays:30,
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

const DEFAULT_SCHED = { waterDays:10, flushDays:30, topdressDays:30, foliarDays:14 };

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
  const defaults = { waterDays:10, flushDays:30, topdressDays:30, foliarDays:14 };
  if (plant.manualOverrides?.[key]) return plant.manualOverrides[key];
  const learned = learnedInterval(plant.logs||[], type, defaults[key]);
  const base = learned || plant.schedule?.[key] || defaults[key];
  // Apply pot/soil modifier to water interval only (flush/topdress are time-based, not dryness-based)
  if (type === "water" && !learned) {
    return Math.min(90, Math.max(2, Math.round(base * potModifier(plant))));
  }
  return base;
}

const todayStr  = () => new Date().toDateString();
const daysSince = d  => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : null;
const fmtDate   = d  => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "never";

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
    photos:[],         // array of {date, dataUrl} base64 images
  };
}

// Pot/soil modifier for water interval
// Terracotta dries ~30% faster than plastic; smaller pots dry faster
function potModifier(plant) {
  let mod = 1.0;
  if (plant.potMaterial === "terracotta") mod *= 0.72; // dries faster → shorter interval
  const size = parseInt(plant.potSize)||0;
  if (size > 0 && size <= 2)  mod *= 0.80; // tiny — dries very fast
  else if (size <= 4)         mod *= 0.90;
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
    // ── Water vs Flush logic ─────────────────────────────────────────────────
    // Flush replaces a watering session — never appears alongside it.
    //
    // Rule: when watering is due, check if it has been >= 30 days since the
    // last flush (measured from last flush date to today, not to last water).
    // If yes → show Flush instead of Water+Ferts.
    // If no  → show regular Water+Ferts.
    //
    // Example: water every 7d, flush threshold 30d
    //   Day 0:  Flush
    //   Day 7:  Water+Ferts
    //   Day 14: Water+Ferts
    //   Day 21: Water+Ferts
    //   Day 28: Water+Ferts  (only 28d since flush — not yet)
    //   Day 35: Flush        (35d since flush — threshold met on this watering)

    const waterThreshold = effectiveInterval(p, "water");
    const flushThreshold = 30; // always 30 days — not user-adjustable per the design

    const waterLast = lastLogOf(p, "water");
    const flushLast = lastLogOf(p, "flush");
    // Use last of either water or flush as the "last watered" date
    // (logging a flush counts as a watering session)
    const lastWaterSession = (waterLast && flushLast)
      ? (new Date(waterLast) > new Date(flushLast) ? waterLast : flushLast)
      : (waterLast || flushLast);

    const waterAge  = daysSince(lastWaterSession);
    const flushAge  = daysSince(flushLast); // days since last flush specifically

    const sessionLoggedToday = lastWaterSession && new Date(lastWaterSession).toDateString() === today;
    const waterDeferred = p.deferred?.["water"] && new Date(p.deferred["water"]) > new Date() && new Date(p.deferred["water"]).toDateString() !== today;
    const flushDeferred = p.deferred?.["flush"] && new Date(p.deferred["flush"]) > new Date() && new Date(p.deferred["flush"]).toDateString() !== today;

    // Is a watering session due?
    const waterDue    = waterAge !== null && waterAge >= waterThreshold;
    const waterUpcoming = !waterDue && waterAge !== null && waterAge >= waterThreshold * 0.75;
    // Has it been 30+ days since last flush? (null = never flushed → flush is due)
    const flushDue    = flushAge === null || flushAge >= flushThreshold;

    if (!sessionLoggedToday && !waterDeferred) {
      if (waterDue && flushDue && !flushDeferred) {
        // This watering session should be a flush
        tasks.push({ id:`${name}::flush`, plant:name, type:"flush",
          age:waterAge, threshold:waterThreshold,
          last:flushLast, overdue: waterAge > waterThreshold,
          due:true, upcoming:false, neverLogged:false, replacesWater:true });
      } else if (waterDue || waterUpcoming) {
        // Regular Water+Ferts session
        tasks.push({ id:`${name}::water`, plant:name, type:"water",
          age:waterAge, threshold:waterThreshold,
          last:lastWaterSession, overdue: waterAge > waterThreshold,
          due:waterDue, upcoming:waterUpcoming, neverLogged:false });
      }
    }

    // ── All other scheduled types (topdress, foliar) — unchanged logic ───────
    ["topdress"].forEach(type => {
      const threshold = effectiveInterval(p, type);
      const last = lastLogOf(p, type);
      const age  = daysSince(last);
      if (last && new Date(last).toDateString()===today) return;
      const def = p.deferred?.[type];
      if (def && new Date(def) > new Date() && new Date(def).toDateString()!==today) return;
      const overdue  = age!==null && age>threshold;
      const due      = age!==null && age>=threshold;
      const upcoming = !due && age!==null && age>=threshold*0.75;
      const neverLogged = age===null;
      if (overdue||due||upcoming||neverLogged)
        tasks.push({ id:`${name}::${type}`, plant:name, type, age, threshold, last, overdue, due, upcoming, neverLogged });
    });
  });
  tasks.sort((a,b)=>{
    const r=t=>t.overdue?0:t.due?1:t.neverLogged?2:3;
    return r(a)!==r(b) ? r(a)-r(b) : (b.age||0)-(a.age||0);
  });
  return tasks;
}

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

// Collapsible room section for Today view
function CollapsibleRoom({loc, groups, renderCards}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{borderRadius:12,border:`1px solid rgba(176,107,74,0.2)`,overflow:"hidden"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{
        width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 14px",background:`rgba(176,107,74,0.06)`,border:"none",
        fontFamily:"'Playfair Display',serif",fontSize:12,color:"#b06b4a",
        fontStyle:"italic",cursor:"pointer",textAlign:"left"
      }}>
        <span>📍 {loc} · {groups.length} plant{groups.length!==1?"s":""}</span>
        <span style={{fontSize:14,transition:"transform .2s",transform:open?"rotate(0)":"rotate(-90deg)"}}>▾</span>
      </button>
      {open&&<div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 8px"}}>{renderCards(groups)}</div>}
    </div>
  );
}

// One card per plant, showing ALL due actions for that plant
function PlantTaskCard({plantName, tasks, onDone, onDefer, onOpenPlant}){
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
          const status = isOD    ? `${task.age-task.threshold}d overdue`
            : task.due            ? `${task.age}d since last`
            : task.neverLogged    ? "never logged"
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

function PlantSheet({name,plant,onLog,onClose,onDelete,onSetLocation,onRename,onDeleteLog,onAddPhoto}){
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
    const defs={waterDays:10,flushDays:30,topdressDays:30,foliarDays:14};
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

        {/* Photo section */}
        {(plant.photos?.length > 0 || true) && (
          <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            {plant.photos?.slice(-1)[0] && (
              <img src={plant.photos.slice(-1)[0].dataUrl}
                alt="Latest photo"
                style={{width:72,height:72,objectFit:"cover",borderRadius:10,border:`1px solid ${BORDER}`,flexShrink:0}}
              />
            )}
            <div>
              {plant.photos?.length > 0 && (
                <div style={{fontSize:10,color:MUTED,marginBottom:4}}>{plant.photos.length} photo{plant.photos.length!==1?"s":" "} · last {fmtDate(plant.photos.slice(-1)[0]?.date)}</div>
              )}
              <label style={{background:SURF,border:`1px solid ${BORDER}`,borderRadius:20,padding:"5px 12px",fontSize:11,color:MUTED,fontFamily:FONT,cursor:"pointer",display:"inline-block"}}>
                📸 {plant.photos?.length?"Add photo":"Add first photo"}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                  const file=e.target.files?.[0];
                  if(!file) return;
                  const reader=new FileReader();
                  reader.onload=ev=>onAddPhoto(name,ev.target.result);
                  reader.readAsDataURL(file);
                  e.target.value="";
                }}/>
              </label>
            </div>
          </div>
        )}

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
              const col=pct===null?"#7a6a5a":pct>=1?"#e07050":pct>=.75?"#c4a060":"#8abd80";
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
                // Support both old format (l.note as object) and new flat format
                const product  = l.product || l.note?.product  || "";
                const nextDate = l.nextDate|| l.note?.nextDate || "";
                const noteText = typeof l.note==="string" ? l.note : (l.note?.note || "");
                return (
                  <div key={i} style={{fontSize:11,color:MUTED,borderLeft:`2px solid ${BORDER}`,paddingLeft:9,marginBottom:6,paddingBottom:4}}>
                    <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                      <span>{CARE[l.type]?.icon}</span>
                      <span style={{color:INK,fontWeight:600}}>{CARE[l.type]?.label}</span>
                      <span style={{color:MUTED,fontSize:10}}>{fmtDate(l.date)}</span>
                      <button onClick={()=>onDeleteLog(name, (plant.logs||[]).length-1-i)} style={{marginLeft:"auto",background:"transparent",border:"none",color:ROSE,fontSize:11,cursor:"pointer",padding:"0 2px",opacity:0.6,fontFamily:FONT}} title="Remove this log entry">✕</button>
                    </div>
                    {product  && <div style={{fontSize:10.5,color:INK,marginTop:3}}>🧪 {product}</div>}
                    {nextDate && <div style={{fontSize:10.5,color:SAGE_D,marginTop:2}}>📅 Next treatment: {fmtDate(nextDate)}</div>}
                    {noteText && <div style={{fontSize:10.5,color:MUTED,fontStyle:"italic",marginTop:2}}>"{noteText}"</div>}
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

// ═══════════════════════════════════════════════════════════════════════════════
// Google Drive — redirect-based OAuth (works on all browsers incl. mobile Safari)
// Flow: tap Connect → full-page redirect to Google → sign in → back to app with token
// ═══════════════════════════════════════════════════════════════════════════════

const GDRIVE_CLIENT_ID = "425465979045-j818osj85725uknva1o0mp0boabvtbrd.apps.googleusercontent.com";
const GDRIVE_API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY || "";
const GDRIVE_SCOPE     = "https://www.googleapis.com/auth/drive.appdata";
const GDRIVE_FILE      = "happyroots-data.json";

let _gapiReady   = false;
let _accessToken = null;

// ── Token management ──────────────────────────────────────────────────────────
function getStoredToken() {
  if (_accessToken) return _accessToken;
  try {
    const raw = localStorage.getItem("hr-token");
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw);
    if (Date.now() < exp) { _accessToken = token; return token; }
    localStorage.removeItem("hr-token");
  } catch {}
  return null;
}

function storeToken(token, expiresIn) {
  _accessToken = token;
  // Refresh 10 minutes before expiry so we never hit the window mid-session
  const exp = Date.now() + (expiresIn - 600) * 1000;
  try { localStorage.setItem("hr-token", JSON.stringify({ token, exp })); } catch {}
  try { localStorage.setItem("hr-authed", "1"); } catch {}
}

// ── OAuth redirect ────────────────────────────────────────────────────────────
function startOAuthRedirect() {
  const params = new URLSearchParams({
    client_id:              GDRIVE_CLIENT_ID,
    redirect_uri:           window.location.origin + "/",
    response_type:          "token",
    scope:                  GDRIVE_SCOPE,
    include_granted_scopes: "true",
  });
  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params;
}

// Call on every app load — extracts token from URL hash if returning from Google
function handleOAuthReturn() {
  if (!window.location.hash.includes("access_token")) return null;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const token = p.get("access_token");
  const exp   = parseInt(p.get("expires_in") || "3599");
  if (!token) return null;
  storeToken(token, exp);
  // Clean token from URL so it's not visible / accidentally re-used
  window.history.replaceState({}, "", window.location.pathname);
  return token;
}

// ── GAPI ──────────────────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise(r => {
    const s = document.createElement("script");
    s.src = src; s.onload = r;
    document.head.appendChild(s);
  });
}

async function initGapi() {
  if (_gapiReady) return;
  if (!window.gapi) await loadScript("https://apis.google.com/js/api.js");
  await new Promise(r => window.gapi.load("client", r));
  await window.gapi.client.init({
    apiKey: GDRIVE_API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
  _gapiReady = true;
}

// ── Drive file operations ─────────────────────────────────────────────────────
async function driveRead() {
  await initGapi();
  const token = getStoredToken();
  if (!token) throw new Error("no token");
  window.gapi.client.setToken({ access_token: token });
  const list = await window.gapi.client.drive.files.list({
    spaces: "appDataFolder",
    q: `name='${GDRIVE_FILE}'`,
    fields: "files(id)",
  });
  const files = list.result.files || [];
  if (!files.length) return null;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`,
    { headers: { Authorization: "Bearer " + token } }
  );
  if (!resp.ok) return null;
  return await resp.json();
}

async function driveWrite(payload) {
  await initGapi();
  const token = getStoredToken();
  if (!token) { console.log("driveWrite: no token"); return; }
  window.gapi.client.setToken({ access_token: token });
  const body = JSON.stringify({ ...payload, savedAt: new Date().toISOString() });
  const list = await window.gapi.client.drive.files.list({
    spaces: "appDataFolder",
    q: `name='${GDRIVE_FILE}'`,
    fields: "files(id)",
  });
  const files = list.result.files || [];
  if (files.length) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body,
    });
  } else {
    const meta = JSON.stringify({ name: GDRIVE_FILE, parents: ["appDataFolder"] });
    const form = new FormData();
    form.append("metadata", new Blob([meta], { type: "application/json" }));
    form.append("file",     new Blob([body], { type: "application/json" }));
    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
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
  const [sortBy,setSortBy]           = useState("name");
  const [filterLoc,setFilterLoc]     = useState("");
  const [toast,setToast]             = useState({msg:"",visible:false});
  const [driveStatus,setDriveStatus] = useState("idle");
  const [driveAuthed,setDriveAuthed] = useState(false);
  const [showDataMenu,setShowDataMenu] = useState(false);
  const [groupByLoc,setGroupByLoc]     = useState(false);
  const saveTimer  = useRef(null);
  const importRef  = useRef(null);
  const driveAuthRef = useRef(false);
  const isFirstLoad  = useRef(true);

  const showToast = (msg) => {
    setToast({msg, visible:true});
    setTimeout(() => setToast(t => ({...t, visible:false})), 2800);
  };

  // ── Local storage helpers ─────────────────────────────────────────────────
  const SKEY = "happyroots-plants";

  function localSave(p) {
    const savedAt = new Date().toISOString();
    const payload = JSON.stringify({ plants:p, savedAt });
    try { localStorage.setItem(SKEY, payload); } catch {}
    try { localStorage.setItem("happyroots-plants", payload); } catch {}
    try { localStorage.setItem("hr-session", payload); } catch {}
    try { localStorage.setItem("hoya-plants-stable", payload); } catch {}
  }

  function localLoad() {
    const keys = [SKEY, "hr-session", "hoya-plants-stable", "hoya-v5", "hoya-v4", "hoya-v3"];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const p = parsed?.plants || parsed;
        if (p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length > 0) return p;
      } catch {}
    }
    return null;
  }

  function localLoadChat() {
    try {
      const keys = ["happyroots-chat","hoya-chat-stable","hoya-v5-chat"];
      for (const k of keys) {
        const r = localStorage.getItem(k);
        if (r) return JSON.parse(r);
      }
    } catch {}
    return null;
  }

  // ── On mount: Drive is the source of truth, no merging ─────────────────────
  useEffect(()=>{
    (async()=>{
      const freshToken = handleOAuthReturn();
      if (freshToken) { driveAuthRef.current = true; setDriveAuthed(true); }
      const local = localLoad();
      const localCount = local ? Object.keys(local).length : 0;
      setPlants(local || initPlants());
      const token = getStoredToken();
      if (token) {
        driveAuthRef.current = true;
        setDriveAuthed(true);
        setDriveStatus("connecting");
        try {
          const data = await driveRead();
          if (data?.plants && Object.keys(data.plants).length > 0) {
            setPlants(data.plants);
            localSave(data.plants);
            setDriveStatus("saved");
            if (freshToken) showToast("☁️ Connected! " + Object.keys(data.plants).length + " plants loaded");
          } else {
            if (local && localCount > 0) {
              await driveWrite({ plants: local });
              showToast("☁️ Drive connected — " + localCount + " plants saved");
            } else if (freshToken) showToast("☁️ Drive connected — ready to save");
            setDriveStatus("saved");
          }
        } catch(e) {
          console.log("Drive load error:", e?.message||e);
          setDriveStatus("disconnected");
        }
      } else {
        setDriveStatus("disconnected");
      }
    })();
  },[]);

  // ── Connect Drive (redirect flow — works on all mobile browsers) ────────────
  function connectDrive() {
    // Save anything in memory before we navigate away
    if (plants) localSave(plants);
    showToast("Taking you to Google sign-in…");
    setTimeout(() => startOAuthRedirect(), 700);
  }

  // ── Persist: save locally always, Drive 2s after last change ───────────────
  // If the token has expired, saves the pending data to localStorage and
  // triggers a re-auth redirect. On return the load useEffect detects local
  // is newer than Drive and pushes it up automatically.
  const persist = useCallback(async (p, chat) => {
    if (!p || typeof p !== "object") return;
    // Always save locally first — this is the safety net
    localSave(p);
    try { localStorage.setItem("happyroots-chat", JSON.stringify((chat||[]).slice(-40))); } catch {}
    // Check token
    const token = getStoredToken();
    if (!token) {
      // Token expired — mark disconnected but data is safe in localStorage
      // User will need to reconnect; on reconnect the load useEffect will
      // detect local is newer and push it up to Drive automatically
      setDriveStatus("disconnected");
      showToast("⚠️ Drive token expired — tap Reconnect Drive to re-sync");
      return;
    }
    if (!driveAuthRef.current) { driveAuthRef.current = true; setDriveAuthed(true); }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDriveStatus("syncing");
    saveTimer.current = setTimeout(async () => {
      try {
        await driveWrite({ plants:p, chat:(chat||[]).slice(-40) });
        setDriveStatus("saved");
      } catch(e) {
        console.log("Drive write error:", e?.message||e);
        // Save to local so nothing is lost — user can reconnect to re-sync
        localSave(p);
        setDriveStatus("error");
        showToast("⚠️ Drive save failed — data saved locally. Tap Reconnect Drive");
      }
    }, 2000);
  }, [showToast]);

  useEffect(()=>{
    if(!plants) return;
    const today=todayStr();
    const all=buildTasks(plants);
    const active=[],done=[],deferred=[];
    all.forEach(t=>{
      const p=plants[t.plant];
      const last=lastLogOf(p,t.type);
      const lastDate = last ? new Date(last) : null;
      const now = new Date();
      if(last && lastDate.toDateString()===today){done.push(t);return;}
      if(last && lastDate > now){deferred.push(t);return;}
      active.push(t);
    });
    setTasks(active); setDoneTasks(done); setDeferred(deferred);
  },[plants]);

  // ── Auto-save whenever plants changes ─────────────────────────────────────
  // This is the canonical React pattern: derive saves from state, not from event handlers.
  // The isFirstLoad ref prevents saving the initial load back over itself.
  // Auto-save on every plants change
  useEffect(()=>{
    if(!plants) return;
    if(isFirstLoad.current){ isFirstLoad.current = false; return; }
    persist(plants, []);
  },[plants]);


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
        const newLog = {
          type,
          date: new Date().toISOString(),
          ...(typeof extra==="object" && extra!==null
            ? { note: extra.note||"", product: extra.product||"", nextDate: extra.nextDate||"" }
            : { note: typeof extra==="string" ? extra : "" }
          )
        };
        // Logging a flush clears both water and flush deferrals — it IS a watering session
        const clearTypes = type === "flush" ? [type, "water"] : [type];
        const newDeferred = { ...(p.deferred||{}) };
        clearTypes.forEach(t => { newDeferred[t] = null; });
        n = { ...prev, [plantName]: { ...p,
          logs: [...(p.logs||[]), newLog],
          deferred: newDeferred,
        }};
        showToast(`${CARE[type].icon} ${CARE[type].label} logged`);
        setLogModal(null);
      }
      return n;
    });
  }

  function deferTask(task, days=1) {
    setPlants(prev => {
      const p = prev[task.plant];
      const logs = [...(p.logs||[])];
      const lastIdx = logs.map(l=>l.type).lastIndexOf(task.type);
      if (lastIdx !== -1) {
        const lastLog = logs[lastIdx];
        const newDate = new Date(lastLog.date);
        newDate.setDate(newDate.getDate() + days);
        logs[lastIdx] = { ...lastLog, date: newDate.toISOString(), wetDays: (lastLog.wetDays||0)+days };
      } else {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        logs.push({ type: task.type, date: futureDate.toISOString(), note: "still wet", wetDays: days, synthetic: true });
      }
      return { ...prev, [task.plant]: { ...p, logs } };
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

  function deleteLog(plantName, logIndex) {
    setPlants(prev => {
      const p = prev[plantName];
      const logs = [...(p.logs||[])];
      logs.splice(logIndex, 1);
      return { ...prev, [plantName]: { ...p, logs } };
    });
    showToast("Log entry removed");
  }

  function addPhoto(plantName, dataUrl) {
    setPlants(prev => {
      const p = prev[plantName];
      const photos = [...(p.photos||[]), { date: new Date().toISOString(), dataUrl }];
      // Keep only last 10 photos per plant to avoid storage bloat
      if (photos.length > 10) photos.splice(0, photos.length - 10);
      return { ...prev, [plantName]: { ...p, photos } };
    });
    showToast("📸 Photo saved");
  }

  function exportData() {
    const payload = { plants, exportedAt: new Date().toISOString(), version: "stable" };
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
          localStorage.setItem("hoya-plants-stable", JSON.stringify({ plants: imported, savedAt: new Date().toISOString() }));
        persist(imported, []);
        showToast(`✅ Imported ${Object.keys(imported).length} plants`);
      } catch { showToast("⚠️ Couldn't read that file — is it a valid backup?"); }
    };
    reader.readAsText(file);
    setShowDataMenu(false);
  }


  if(!plants) return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",color:SAGE_D,fontFamily:SERIF,fontSize:15}}>
      Loading your collection…
    </div>
  );

  const overdueCt=tasks.filter(t=>t.overdue).length;
  const dueCt=tasks.filter(t=>t.due&&!t.overdue).length;
  const upcomingCt=tasks.filter(t=>t.upcoming||t.neverLogged).length;

  const groupByPlant = (taskList) => {
    const map={}, order=[];
    taskList.forEach(t=>{ if(!map[t.plant]){map[t.plant]=[];order.push(t.plant);} map[t.plant].push(t); });
    return order.map(name=>({name,tasks:map[name]}));
  };

  const groupByLocation = (plantGroups) => {
    const locMap={}, locOrder=[];
    plantGroups.forEach(g=>{
      const key=plants[g.name]?.location||"No location set";
      if(!locMap[key]){locMap[key]=[];locOrder.push(key);}
      locMap[key].push(g);
    });
    return locOrder.map(loc=>({loc,groups:locMap[loc]}));
  };

  const PlantSection = ({color,label,taskList}) => {
    const groups = groupByPlant(taskList);
    if (!groups.length) return null;
    const isMain = label.includes("Overdue")||label.includes("Due");
    const renderCards = (grps) => grps.map(({name,tasks:grpTasks})=>(
      <PlantTaskCard key={name} plantName={name} tasks={grpTasks}
        onDone={t=>setLogModal({plant:t.plant,type:t.type})}
        onDefer={(t,d)=>deferTask(t,d)}
        onOpenPlant={n=>setDetailPlant(n)}
      />
    ));
    return (
      <section style={{marginBottom:20}}>
        <div style={{fontSize:10,color,textTransform:"uppercase",letterSpacing:1.8,marginBottom:9,fontWeight:600,fontFamily:SERIF,fontStyle:"italic",display:"flex",alignItems:"center",gap:8}}>
          <span>{label} · {groups.length} plant{groups.length!==1?"s":""}</span>
          {isMain&&<button onClick={()=>setGroupByLoc(v=>!v)} style={{fontSize:9,color:groupByLoc?color:MUTED,background:groupByLoc?`${color}15`:"transparent",border:`1px solid ${groupByLoc?color:BORDER}`,borderRadius:10,padding:"1px 7px",fontFamily:FONT,cursor:"pointer"}}>
            📍 {groupByLoc?"grouped by room":"group by room"}
          </button>}
        </div>
        {groupByLoc&&isMain ? (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByLocation(groups).map(({loc,groups:lg})=>(
              <CollapsibleRoom key={loc} loc={loc} groups={lg} renderCards={renderCards}/>
            ))}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:7}}>{renderCards(groups)}</div>
        )}
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
              {(driveStatus==="disconnected"||driveStatus==="error") && (
                <button onClick={connectDrive} style={{fontSize:10,color:"#fff",background:TERRA,border:"none",borderRadius:10,padding:"3px 12px",fontFamily:FONT,cursor:"pointer",fontWeight:600}}>
                  ☁️ Reconnect Drive
                </button>
              )}
              {driveStatus==="idle" && !driveAuthed && (
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
          {(driveStatus === "disconnected" || driveStatus === "error") && (
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
            <PlantSection color="#f09070" label="⚠ Overdue"  taskList={tasks.filter(t=>t.overdue)} />
            <PlantSection color="#d4b060" label="Due Today"   taskList={tasks.filter(t=>t.due&&!t.overdue)} />
            <PlantSection color="#a09070" label="Coming Up"   taskList={tasks.filter(t=>t.upcoming||t.neverLogged)} />
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
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your collection…"
              style={{flex:1,background:CARD,border:`1px solid ${BORDER}`,borderRadius:20,padding:"9px 16px",color:INK,fontFamily:FONT,fontSize:12.5}}
            />
            <button onClick={()=>setAddModal(true)} style={{background:SAGE,border:`1px solid ${SAGE_D}`,borderRadius:20,padding:"9px 16px",fontSize:12,color:"#fff",fontFamily:FONT,fontWeight:600,flexShrink:0}}>
              + Add plant
            </button>
          </div>
          {/* Location filter */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>setFilterLoc("")} style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontFamily:FONT,cursor:"pointer",background:filterLoc===""?SAGE:SURF,color:filterLoc===""?"#fff":MUTED,border:`1px solid ${filterLoc===""?SAGE_D:BORDER}`}}>All</button>
            {[...new Set(Object.values(plants).map(p=>p.location||"").filter(Boolean))].sort().map(loc=>(
              <button key={loc} onClick={()=>setFilterLoc(l=>l===loc?"":loc)} style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontFamily:FONT,cursor:"pointer",background:filterLoc===loc?TERRA:SURF,color:filterLoc===loc?"#fff":MUTED,border:`1px solid ${filterLoc===loc?TERRA:BORDER}`}}>📍 {loc}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12,fontSize:10.5,color:MUTED,alignItems:"center"}}>
            <span>status: </span>
            {[["#8abd80","ok"],["#d4a040","soon"],["#e07050","due/overdue"]].map(([col,lbl])=>(
              <span key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:col,display:"inline-block"}}/>
                {lbl}
              </span>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {Object.keys(plants)
            .filter(n=>{
              if(search && !n.toLowerCase().includes(search.toLowerCase())) return false;
              if(filterLoc && (plants[n]?.location||"") !== filterLoc) return false;
              return true;
            })
            .sort((a,b)=>{
              const la=plants[a]?.location||"zzz", lb=plants[b]?.location||"zzz";
              return la===lb?a.localeCompare(b):la.localeCompare(lb);
            }).map(name=>{
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
                  {p.photos?.slice(-1)[0] && (
                    <img src={p.photos.slice(-1)[0].dataUrl} alt={name}
                      style={{width:40,height:40,objectFit:"cover",borderRadius:8,border:`1px solid ${BORDER}`,flexShrink:0}}
                    />
                  )}
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

      {/* CHAT */}

      {/* FAB */}
      {view!=="chat"&&(
        <button onClick={()=>setAddModal(true)} style={{position:"fixed",bottom:22,right:20,width:52,height:52,borderRadius:"50%",background:SAGE,border:`1.5px solid ${SAGE_D}`,fontSize:22,boxShadow:"0 4px 20px rgba(90,107,80,0.35)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",zIndex:40}} title="Add plant">＋</button>
      )}

      {detailPlant&&plants[detailPlant]&&(
        <PlantSheet name={detailPlant} plant={plants[detailPlant]}
          onLog={(name,type,extra)=>{
            if(type==="__override__"||type==="__meta__"){
              logCare(name,type,extra);          // silent saves, stay on sheet
            } else {
              setLogModal({plant:name,type}); // modal opens on top, sheet stays open
            }
          }}
          onClose={()=>setDetailPlant(null)}
          onDelete={deletePlant}
          onSetLocation={setPlantLocation}
          onRename={renamePlant}
          onDeleteLog={deleteLog}
          onAddPhoto={addPhoto}
        />
      )}
      {logModal&&<LogModal plant={logModal.plant} type={logModal.type} onLog={logCare} onClose={()=>setLogModal(null)}/>}
      {addModal&&<AddPlantModal onAdd={addPlant} onClose={()=>setAddModal(false)}/>}
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );
}
