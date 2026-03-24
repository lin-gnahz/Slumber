// ─── Tabs ───────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ─── Web Audio Context ───────────────────────────
let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS requires resume() inside every user-gesture handler
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// iOS Safari: keep the context alive by resuming on every touch.
// The context suspends automatically when the page is backgrounded.
function unlockAudio() {
  if (!audioCtx) return; // not created yet — that's fine, toggleSound will create it
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('touchstart', unlockAudio, { passive: true });
document.addEventListener('touchend',   unlockAudio, { passive: true });

// ─── Sound State ─────────────────────────────────
const sounds = {};
const soundVolumes = {};
const soundPlaying = {};
const SOUND_KEYS = ['rain','rainglass','ocean','wind','fire','stream','birds','crickets','owl','bowl','whitenoise','underwater'];
SOUND_KEYS.forEach(k => { sounds[k]=null; soundVolumes[k]=0.6; soundPlaying[k]=false; });

// ─── Noise Buffer Helpers ────────────────────────
// Keep buffers short (4s max) — mobile CPUs are slow.
// Loop is seamless because noise has no recognisable pattern.
function makeWhiteBuf(ctx, secs = 4) {
  const len = ctx.sampleRate * Math.min(secs, 4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function makePinkBuf(ctx, secs = 4) {
  const len = ctx.sampleRate * Math.min(secs, 4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    d[i] = (b0+b1+b2+b3+b4+b5+w*0.5362) / 8;
  }
  return buf;
}
function noiseSrc(ctx, buf) {
  const s = ctx.createBufferSource(); s.buffer=buf; s.loop=true; return s;
}
function bpf(ctx, freq, Q) {
  const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=Q; return f;
}
function lpf(ctx, freq) {
  const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=freq; return f;
}
function hpf(ctx, freq) {
  const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=freq; return f;
}
function gain(ctx, val) {
  const g=ctx.createGain(); g.gain.value=val; return g;
}
function slowLFO(ctx, rate, depth, target) {
  const lfo=ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=rate;
  const lg=ctx.createGain(); lg.gain.value=depth;
  lfo.connect(lg); lg.connect(target); lfo.start();
  return lfo;
}

// ════════════════════════════════════════════════
// SOUND SYNTH FUNCTIONS
// ════════════════════════════════════════════════

// 1. Heavy Rain
function createRain(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const buf=makePinkBuf(ctx,16);
  const s1=noiseSrc(ctx,buf); const f1=bpf(ctx,380,0.45); const g1=gain(ctx,0.42);
  const lf1=slowLFO(ctx,0.008,90,f1.frequency);
  const lf1g=slowLFO(ctx,0.012,0.09,g1.gain);
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1,lf1,lf1g);
  const s2=noiseSrc(ctx,buf); const f2=bpf(ctx,780,0.6); const g2=gain(ctx,0.07);
  const lf2=slowLFO(ctx,0.006,0.035,g2.gain);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf2);
  const s3=noiseSrc(ctx,buf); const f3=lpf(ctx,48); const g3=gain(ctx,0.15);
  s3.connect(f3);f3.connect(g3);g3.connect(master);s3.start();nodes.push(s3);
  return {gainNode:master,nodes};
}

// 2. Rain on Glass — high-frequency ticking with resonant filter sweep
function createRainglass(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const wbuf=makeWhiteBuf(ctx,8);
  // Sharp ticking layer — narrow high bandpass for droplet "tap" texture
  const s1=noiseSrc(ctx,wbuf); const f1=bpf(ctx,2800,2.5); const g1=gain(ctx,0.22);
  const lf1=slowLFO(ctx,0.015,400,f1.frequency);
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1,lf1);
  // Soft bed — muffled low pass for rain beyond the glass
  const s2=noiseSrc(ctx,wbuf); const f2=bpf(ctx,500,0.5); const g2=gain(ctx,0.3);
  const lf2=slowLFO(ctx,0.009,0.08,g2.gain);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf2);
  // Resonant ringing of the glass pane
  const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=320;
  const og=gain(ctx,0.018);
  const lf3=slowLFO(ctx,0.011,0.012,og.gain);
  osc.connect(og);og.connect(master);osc.start();nodes.push(osc,lf3);
  return {gainNode:master,nodes};
}

// 3. Ocean Waves
function createOcean(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const buf=makeWhiteBuf(ctx,4);
  const cfgs=[
    {freq:180,Q:1.2,g:0.55,lfoR:0.12,lfoD:60},
    {freq:320,Q:1.5,g:0.35,lfoR:0.07,lfoD:80},
    {freq:90, Q:0.8,g:0.45,lfoR:0.18,lfoD:40},
  ];
  cfgs.forEach(c=>{
    const s=noiseSrc(ctx,buf); const f=bpf(ctx,c.freq,c.Q); const g=gain(ctx,c.g);
    const lf=slowLFO(ctx,c.lfoR,c.lfoD,f.frequency);
    s.connect(f);f.connect(g);g.connect(master);s.start();nodes.push(s,lf);
  });
  const sr=noiseSrc(ctx,buf); const fr=lpf(ctx,55); const gr=gain(ctx,0.7);
  sr.connect(fr);fr.connect(gr);gr.connect(master);sr.start();nodes.push(sr);
  return {gainNode:master,nodes};
}

// 4. Gentle Wind — very low bandpass slowly sweeping
function createWind(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const buf=makePinkBuf(ctx,12);
  // Main wind body
  const s1=noiseSrc(ctx,buf); const f1=bpf(ctx,260,0.4); const g1=gain(ctx,0.5);
  const lf1=slowLFO(ctx,0.04,120,f1.frequency); // filter sweeps slowly = wind changing pitch
  const lf1g=slowLFO(ctx,0.028,0.18,g1.gain);   // volume gusts
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1,lf1,lf1g);
  // Distant hollow whistle
  const s2=noiseSrc(ctx,buf); const f2=bpf(ctx,800,1.8); const g2=gain(ctx,0.08);
  const lf2=slowLFO(ctx,0.06,200,f2.frequency);
  const lf2g=slowLFO(ctx,0.035,0.05,g2.gain);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf2,lf2g);
  // Sub rumble
  const s3=noiseSrc(ctx,buf); const f3=lpf(ctx,60); const g3=gain(ctx,0.2);
  s3.connect(f3);f3.connect(g3);g3.connect(master);s3.start();nodes.push(s3);
  return {gainNode:master,nodes};
}

// 5. Fireplace — warm pink noise, very slow breathing
function createFire(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const buf=makePinkBuf(ctx,8);
  const s1=noiseSrc(ctx,buf); const f1=lpf(ctx,140); const g1=gain(ctx,0.7);
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1);
  const s2=noiseSrc(ctx,buf); const f2=bpf(ctx,320,0.6); const g2=gain(ctx,0.28);
  const lf1=slowLFO(ctx,0.05,0.12,g2.gain);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf1);
  const s3=noiseSrc(ctx,buf); const f3=bpf(ctx,900,1.2); const g3=gain(ctx,0.07);
  const lf2=slowLFO(ctx,0.08,0.05,g3.gain);
  s3.connect(f3);f3.connect(g3);g3.connect(master);s3.start();nodes.push(s3,lf2);
  return {gainNode:master,nodes};
}

// 6. Forest Stream — babbling water with irregular high-freq burbling
function createStream(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const wbuf=makeWhiteBuf(ctx,6);
  const pbuf=makePinkBuf(ctx,6);
  // Burbling core
  const s1=noiseSrc(ctx,wbuf); const f1=bpf(ctx,700,1.0); const g1=gain(ctx,0.4);
  const lf1=slowLFO(ctx,0.22,280,f1.frequency); // faster sweep = babbling
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1,lf1);
  // Sparkle layer
  const s2=noiseSrc(ctx,wbuf); const f2=bpf(ctx,1800,1.5); const g2=gain(ctx,0.14);
  const lf2=slowLFO(ctx,0.31,400,f2.frequency);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf2);
  // Soft base rush
  const s3=noiseSrc(ctx,pbuf); const f3=bpf(ctx,300,0.5); const g3=gain(ctx,0.3);
  s3.connect(f3);f3.connect(g3);g3.connect(master);s3.start();nodes.push(s3);
  return {gainNode:master,nodes};
}

// 7. Birdsong — synthesized chirping birds
function createBirds(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  // Soft ambient bed (distant forest)
  const pbuf=makePinkBuf(ctx,8);
  const sb=noiseSrc(ctx,pbuf); const fb=bpf(ctx,1200,0.6); const gb=gain(ctx,0.08);
  sb.connect(fb);fb.connect(gb);gb.connect(master);sb.start();nodes.push(sb);
  // Bird chirp synthesizer — scheduled oscillator chirps
  let chirpRunning=true;
  function scheduleChirp() {
    if (!chirpRunning) return;
    const now=ctx.currentTime;
    const delay=0.8+Math.random()*2.5;
    const freq=1800+Math.random()*1400;
    const dur=0.06+Math.random()*0.12;
    const repeats=Math.floor(1+Math.random()*4);
    for (let r=0;r<repeats;r++) {
      const t=now+delay+r*(dur*1.6);
      const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=freq;
      const env=ctx.createGain(); env.gain.setValueAtTime(0,t);
      env.gain.linearRampToValueAtTime(0.09,t+0.018);
      env.gain.exponentialRampToValueAtTime(0.001,t+dur);
      // slight frequency slide up = more natural
      osc.frequency.setValueAtTime(freq*0.9,t);
      osc.frequency.linearRampToValueAtTime(freq,t+dur*0.5);
      osc.connect(env); env.connect(master);
      osc.start(t); osc.stop(t+dur+0.05);
    }
    setTimeout(scheduleChirp, (delay)*900);
  }
  scheduleChirp();
  master._stopBirds=()=>{ chirpRunning=false; };
  return {gainNode:master,nodes};
}

// 8. Crickets — pulsing high-frequency chirp
function createCrickets(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  // Crickets pulse at ~20 Hz (rate) with ~4 kHz tone
  const osc1=ctx.createOscillator(); osc1.type='sine'; osc1.frequency.value=4200;
  const osc2=ctx.createOscillator(); osc2.type='sine'; osc2.frequency.value=3900;
  const osc3=ctx.createOscillator(); osc3.type='sine'; osc3.frequency.value=4500;
  // AM modulate each at slightly different rates for organic texture
  function amChirp(osc, amRate, vol) {
    const g=gain(ctx,0);
    const am=ctx.createOscillator(); am.type='square'; am.frequency.value=amRate;
    // Rectify: only positive half = pulses
    const amg=gain(ctx,vol*0.5);
    const dcg=gain(ctx,vol*0.5);
    am.connect(amg); amg.connect(g.gain);
    dcg.connect(g.gain); // DC offset so gain stays ≥0
    osc.connect(g); g.connect(master);
    osc.start(); am.start();
    return [osc, am];
  }
  nodes.push(...amChirp(osc1, 19.5, 0.14));
  nodes.push(...amChirp(osc2, 20.2, 0.10));
  nodes.push(...amChirp(osc3, 18.8, 0.08));
  // Gentle overall swell
  const lf=slowLFO(ctx,0.04,0.04,master.gain);
  nodes.push(lf);
  return {gainNode:master,nodes};
}

// 9. Owl — periodic soft hoot
function createOwl(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  // Distant forest night ambience
  const pbuf=makePinkBuf(ctx,10);
  const sa=noiseSrc(ctx,pbuf); const fa=lpf(ctx,300); const ga=gain(ctx,0.12);
  sa.connect(fa);fa.connect(ga);ga.connect(master);sa.start();nodes.push(sa);
  // Scheduled owl hoots
  let owlRunning=true;
  function hoot() {
    if (!owlRunning) return;
    const now=ctx.currentTime;
    const baseFreq=220+Math.random()*80;
    // Two-note hoot pattern "hoo-hoo"
    [[0,0.4],[0.55,0.38],[4.5,0.4],[5.0,0.38]].forEach(([dly,dur])=>{
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=baseFreq;
      const vib=ctx.createOscillator(); vib.type='sine'; vib.frequency.value=5;
      const vg=gain(ctx,4); vib.connect(vg); vg.connect(o.frequency); vib.start(now+dly);
      const e=gain(ctx,0);
      e.gain.setValueAtTime(0,now+dly);
      e.gain.linearRampToValueAtTime(0.12,now+dly+0.06);
      e.gain.setValueAtTime(0.12,now+dly+dur-0.08);
      e.gain.linearRampToValueAtTime(0,now+dly+dur);
      o.connect(e); e.connect(master);
      o.start(now+dly); o.stop(now+dly+dur+0.1);
      nodes.push(o,vib);
    });
    const nextHoot=6000+Math.random()*8000;
    setTimeout(hoot, nextHoot);
  }
  hoot();
  master._stopOwl=()=>{ owlRunning=false; };
  return {gainNode:master,nodes};
}

// 10. Singing Bowl — long resonant decay with periodic strikes
function createBowl(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  function strike(freq, t, dur) {
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
    const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2.756; // inharmonic partial
    const o3=ctx.createOscillator(); o3.type='sine'; o3.frequency.value=freq*5.404;
    const e=gain(ctx,0);
    e.gain.setValueAtTime(0,t);
    e.gain.linearRampToValueAtTime(0.18,t+0.02);
    e.gain.exponentialRampToValueAtTime(0.001,t+dur);
    const e2=gain(ctx,0);
    e2.gain.setValueAtTime(0,t); e2.gain.linearRampToValueAtTime(0.06,t+0.02); e2.gain.exponentialRampToValueAtTime(0.001,t+dur*0.6);
    const e3=gain(ctx,0);
    e3.gain.setValueAtTime(0,t); e3.gain.linearRampToValueAtTime(0.025,t+0.02); e3.gain.exponentialRampToValueAtTime(0.001,t+dur*0.3);
    o.connect(e);e.connect(master); o2.connect(e2);e2.connect(master); o3.connect(e3);e3.connect(master);
    o.start(t);o.stop(t+dur+0.1); o2.start(t);o2.stop(t+dur+0.1); o3.start(t);o3.stop(t+dur+0.1);
    nodes.push(o,o2,o3);
  }
  const bowlFreqs=[220,293.7,330,440];
  let running=true;
  let seq=0;
  function scheduleBowl() {
    if (!running) return;
    const now=ctx.currentTime;
    strike(bowlFreqs[seq%bowlFreqs.length], now, 7+Math.random()*4);
    seq++;
    const next=5000+Math.random()*7000;
    setTimeout(scheduleBowl, next);
  }
  scheduleBowl();
  master._stopBowl=()=>{ running=false; };
  return {gainNode:master,nodes};
}

// 11. White Noise — pure, flat, very soft
function createWhitenoise(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const buf=makeWhiteBuf(ctx,8);
  const s=noiseSrc(ctx,buf); const f=lpf(ctx,8000); const g=gain(ctx,0.55);
  s.connect(f);f.connect(g);g.connect(master);s.start();nodes.push(s);
  const lf=slowLFO(ctx,0.02,0.05,master.gain);
  nodes.push(lf);
  return {gainNode:master,nodes};
}

// 12. Underwater — low resonant whoosh with slow filter wobble
function createUnderwater(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const pbuf=makePinkBuf(ctx,12);
  // Main deep body
  const s1=noiseSrc(ctx,pbuf); const f1=bpf(ctx,180,0.6); const g1=gain(ctx,0.5);
  const lf1=slowLFO(ctx,0.025,80,f1.frequency);
  s1.connect(f1);f1.connect(g1);g1.connect(master);s1.start();nodes.push(s1,lf1);
  // Resonant bubbles feeling
  const s2=noiseSrc(ctx,pbuf); const f2=bpf(ctx,600,2.5); const g2=gain(ctx,0.1);
  const lf2=slowLFO(ctx,0.06,200,f2.frequency);
  const lf2g=slowLFO(ctx,0.04,0.06,g2.gain);
  s2.connect(f2);f2.connect(g2);g2.connect(master);s2.start();nodes.push(s2,lf2,lf2g);
  // Sub pressure
  const s3=noiseSrc(ctx,pbuf); const f3=lpf(ctx,40); const g3=gain(ctx,0.35);
  s3.connect(f3);f3.connect(g3);g3.connect(master);s3.start();nodes.push(s3);
  return {gainNode:master,nodes};
}

const synthFns = {
  rain:createRain, rainglass:createRainglass, ocean:createOcean,
  wind:createWind, fire:createFire, stream:createStream,
  birds:createBirds, crickets:createCrickets, owl:createOwl,
  bowl:createBowl, whitenoise:createWhitenoise, underwater:createUnderwater
};

// ─── Toggle + Volume ─────────────────────────────
function toggleSound(key) {
  const icon = document.getElementById('btn-' + key);
  const card = document.getElementById('card-' + key);

  // ⚠️ iOS Safari: AudioContext MUST be created & resumed synchronously
  //    inside the gesture handler — no await, no Promise.then before this.
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  audioCtx.resume(); // synchronous — do not await

  if (soundPlaying[key]) {
    const g = sounds[key].gainNode;
    g.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
    setTimeout(() => {
      if (sounds[key]) {
        if (sounds[key].gainNode._stopBirds) sounds[key].gainNode._stopBirds();
        if (sounds[key].gainNode._stopOwl)   sounds[key].gainNode._stopOwl();
        if (sounds[key].gainNode._stopBowl)  sounds[key].gainNode._stopBowl();
        sounds[key].nodes.forEach(n => { try { n.stop(); } catch(e){} });
        sounds[key].gainNode.disconnect();
        sounds[key] = null;
      }
    }, 1600);
    soundPlaying[key] = false;
    if (icon) icon.textContent = '▶';
    card.classList.remove('active-sound');
  } else {
    if (icon) icon.textContent = '⏸';
    const synth = synthFns[key](audioCtx);
    synth.gainNode.gain.setTargetAtTime(soundVolumes[key], audioCtx.currentTime, 0.6);
    sounds[key] = synth;
    soundPlaying[key] = true;
    card.classList.add('active-sound');
  }
}

function setVol(key, val) {
  soundVolumes[key] = parseFloat(val);
  // Only update gain if context already exists — don't create it here
  if (audioCtx && sounds[key]) {
    sounds[key].gainNode.gain.setTargetAtTime(soundVolumes[key], audioCtx.currentTime, 0.05);
  }
}

function fadeOutAllSounds(duration) {
  SOUND_KEYS.forEach(k => {
    if (!sounds[k]) return;
    const g = sounds[k].gainNode;
    g.gain.setTargetAtTime(0, getCtx().currentTime, duration/4);
    setTimeout(() => {
      if (sounds[k]) {
        if (sounds[k].gainNode._stopBirds) sounds[k].gainNode._stopBirds();
        if (sounds[k].gainNode._stopOwl)   sounds[k].gainNode._stopOwl();
        if (sounds[k].gainNode._stopBowl)  sounds[k].gainNode._stopBowl();
        sounds[k].nodes.forEach(n => { try{n.stop();}catch(e){} });
        sounds[k].gainNode.disconnect();
        sounds[k]=null; soundPlaying[k]=false;
        const btn=document.getElementById('btn-'+k);
        const card=document.getElementById('card-'+k);
        if(btn) btn.textContent='▶';
        if(card) card.classList.remove('active-sound');
      }
    }, duration*1000);
  });
}

// ════════════════════════════════════════════════
// MUSIC SYNTH FUNCTIONS
// ════════════════════════════════════════════════
let currentMusic = null;
const musicSounds = {};

function makeTone(ctx, freq, type, gainVal) {
  const osc=ctx.createOscillator(); osc.type=type; osc.frequency.value=freq;
  const g=gain(ctx,gainVal);
  osc.connect(g); osc.start();
  return {osc, gain:g};
}

// Lo-fi: D minor pentatonic warm drone + vinyl hiss
function createLofi(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const freqs=[73.4,110,146.8,174.6,220,261.6];
  const gains=[0.14,0.11,0.09,0.08,0.07,0.06];
  freqs.forEach((f,i)=>{
    const t1=makeTone(ctx,f,'sine',gains[i]);
    const t2=makeTone(ctx,f*1.0008,'triangle',gains[i]*0.4);
    t1.gain.connect(master); t2.gain.connect(master);
    nodes.push(t1.osc,t2.osc);
  });
  const wbuf=makeWhiteBuf(ctx,4);
  const ns=noiseSrc(ctx,wbuf); const nf=lpf(ctx,3000); const ng=gain(ctx,0.018);
  ns.connect(nf);nf.connect(ng);ng.connect(master);ns.start();nodes.push(ns);
  const lf=slowLFO(ctx,0.04,0.03,master.gain); nodes.push(lf);
  return {gainNode:master,nodes};
}

// Deep Ambient: open A fifth drone, ultra-slow beating
function createAmbient(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const layers=[{f:55,g:0.13},{f:110,g:0.11},{f:165,g:0.09},{f:220,g:0.08},{f:330,g:0.06},{f:440,g:0.04}];
  layers.forEach(({f,g:gv})=>{
    const t1=makeTone(ctx,f,'sine',gv);
    const t2=makeTone(ctx,f+0.15,'sine',gv*0.7);
    t1.gain.connect(master); t2.gain.connect(master);
    nodes.push(t1.osc,t2.osc);
  });
  const lf=slowLFO(ctx,0.025,0.04,master.gain); nodes.push(lf);
  return {gainNode:master,nodes};
}

// Gentle Piano: soft arpeggios with delay
function pianoPing(ctx, master, freq, t, dur) {
  const g=gain(ctx,0);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.09,t+0.08);
  g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  g.connect(master);
  [1,2,3,4].forEach((h,i)=>{
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq*h;
    const hg=gain(ctx,[0.6,0.25,0.1,0.05][i]);
    o.connect(hg);hg.connect(g);
    o.start(t); o.stop(t+dur+0.1);
  });
}
function createPiano(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const d1=ctx.createDelay(2); d1.delayTime.value=0.28;
  const d2=ctx.createDelay(2); d2.delayTime.value=0.55;
  const dg1=gain(ctx,0.18); const dg2=gain(ctx,0.10);
  master.connect(d1);d1.connect(dg1);dg1.connect(ctx.destination);
  master.connect(d2);d2.connect(dg2);dg2.connect(ctx.destination);
  const scale=[261.6,329.6,392,440,523.2,392,329.6,261.6,196,261.6];
  let idx=0; let running=true;
  function next() {
    if (!running) return;
    pianoPing(ctx,master,scale[idx%scale.length],ctx.currentTime,3.8);
    idx++; setTimeout(next,2600);
  }
  next();
  master._stopPiano=()=>{running=false;};
  return {gainNode:master,nodes};
}

// Singing Bowls music: slow melodic bowl sequence
function createDrone(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  // Pad drone underneath
  const droneFreqs=[110,146.8,165,220];
  droneFreqs.forEach(f=>{
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
    const g=gain(ctx,0.05); o.connect(g);g.connect(master); o.start(); nodes.push(o);
  });
  const lf=slowLFO(ctx,0.018,0.03,master.gain); nodes.push(lf);
  // Melodic bowl strikes
  function bowlNote(freq, t, dur) {
    [1, 2.756, 5.404].forEach((ratio,i)=>{
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq*ratio;
      const e=gain(ctx,0);
      const vol=[0.15,0.05,0.02][i];
      e.gain.setValueAtTime(0,t);
      e.gain.linearRampToValueAtTime(vol,t+0.025);
      e.gain.exponentialRampToValueAtTime(0.001,t+dur);
      o.connect(e);e.connect(master);
      o.start(t);o.stop(t+dur+0.1);nodes.push(o);
    });
  }
  const melody=[220,261.6,293.7,220,165,196,220,146.8];
  let mi=0; let running=true;
  function nextNote() {
    if (!running) return;
    bowlNote(melody[mi%melody.length], ctx.currentTime, 5+Math.random()*3);
    mi++;
    setTimeout(nextNote, 4500+Math.random()*3000);
  }
  nextNote();
  master._stopDrone=()=>{running=false;};
  return {gainNode:master,nodes};
}

// String Pad: soft sawtooth strings with slow vibrato and filter
function createStrings(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  const chords=[
    [110,138.6,165,220],
    [98,123.5,146.8,196],
    [130.8,164.8,196,261.6],
    [110,138.6,165,220],
  ];
  const filt=ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=600; filt.Q.value=0.7;
  filt.connect(master);
  const lff=slowLFO(ctx,0.015,120,filt.frequency);
  nodes.push(lff);
  let ci=0; let running=true;
  function playChord(chord, t, dur) {
    chord.forEach(f=>{
      const o=ctx.createOscillator(); o.type='sawtooth';
      o.frequency.value=f;
      // slight detune for warmth
      const o2=ctx.createOscillator(); o2.type='sawtooth'; o2.frequency.value=f*1.006;
      const e=gain(ctx,0); const e2=gain(ctx,0);
      const vol=0.06/chord.length;
      e.gain.setValueAtTime(0,t); e.gain.linearRampToValueAtTime(vol,t+1.5);
      e.gain.setValueAtTime(vol,t+dur-2); e.gain.linearRampToValueAtTime(0,t+dur);
      e2.gain.setValueAtTime(0,t); e2.gain.linearRampToValueAtTime(vol*0.6,t+1.8);
      e2.gain.setValueAtTime(vol*0.6,t+dur-2); e2.gain.linearRampToValueAtTime(0,t+dur);
      o.connect(e);e.connect(filt); o2.connect(e2);e2.connect(filt);
      o.start(t);o.stop(t+dur+0.1); o2.start(t);o2.stop(t+dur+0.1);
      nodes.push(o,o2);
    });
  }
  function nextChord() {
    if (!running) return;
    playChord(chords[ci%chords.length], ctx.currentTime, 10);
    ci++;
    setTimeout(nextChord, 8500);
  }
  nextChord();
  master._stopStrings=()=>{running=false;};
  return {gainNode:master,nodes};
}

// Binaural Delta Waves: 4 Hz beat between two close tones
function createBinaural(ctx) {
  const master=gain(ctx,0); master.connect(ctx.destination);
  const nodes=[];
  // Carrier ~200 Hz, beat freq 4 Hz = sleep delta
  const baseFreq=200;
  const beatFreq=4;
  // Need stereo splitter for binaural to work (headphones)
  const splitter=ctx.createChannelMerger(2);
  splitter.connect(master);
  const oL=ctx.createOscillator(); oL.type='sine'; oL.frequency.value=baseFreq;
  const oR=ctx.createOscillator(); oR.type='sine'; oR.frequency.value=baseFreq+beatFreq;
  const gL=gain(ctx,0.3); const gR=gain(ctx,0.3);
  oL.connect(gL);gL.connect(splitter,0,0);
  oR.connect(gR);gR.connect(splitter,0,1);
  oL.start();oR.start();
  nodes.push(oL,oR);
  // Soft carrier tone on both channels too
  const base=ctx.createOscillator(); base.type='sine'; base.frequency.value=80;
  const bg=gain(ctx,0.12);
  base.connect(bg);bg.connect(master);base.start();
  nodes.push(base);
  const lf=slowLFO(ctx,0.015,0.04,master.gain); nodes.push(lf);
  return {gainNode:master,nodes};
}

const musicFns = {
  lofi:createLofi, ambient:createAmbient, piano:createPiano,
  drone:createDrone, strings:createStrings, binaural:createBinaural
};

function stopFns(gainNode) {
  ['_stopPiano','_stopBirds','_stopOwl','_stopBowl','_stopDrone','_stopStrings'].forEach(fn=>{
    if (gainNode[fn]) gainNode[fn]();
  });
}

function toggleMusic(id) {
  const card = document.getElementById('mc-' + id);
  const wf   = document.getElementById('wf-'  + id);

  // Synchronous resume — must happen before any await on iOS
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  const ctx = audioCtx;

  if (currentMusic === id) {
    const s=musicSounds[id];
    if (s) {
      stopFns(s.gainNode);
      s.gainNode.gain.setTargetAtTime(0,ctx.currentTime,0.6);
      setTimeout(()=>{ if(musicSounds[id]){ musicSounds[id].nodes.forEach(n=>{try{n.stop();}catch(e){}}); musicSounds[id].gainNode.disconnect(); musicSounds[id]=null; } },2000);
    }
    card.classList.remove('playing'); wf.classList.remove('animating');
    currentMusic=null; return;
  }
  if (currentMusic) {
    const prev=musicSounds[currentMusic];
    if (prev) {
      stopFns(prev.gainNode);
      prev.gainNode.gain.setTargetAtTime(0,ctx.currentTime,0.5);
      const pid=currentMusic;
      setTimeout(()=>{ if(musicSounds[pid]){ musicSounds[pid].nodes.forEach(n=>{try{n.stop();}catch(e){}}); musicSounds[pid].gainNode.disconnect(); musicSounds[pid]=null; } },1800);
    }
    document.getElementById('mc-'+currentMusic).classList.remove('playing');
    document.getElementById('wf-'+currentMusic).classList.remove('animating');
  }
  const synth=musicFns[id](ctx);
  synth.gainNode.gain.setTargetAtTime(0.75,ctx.currentTime,1.2);
  musicSounds[id]=synth; currentMusic=id;
  card.classList.add('playing'); wf.classList.add('animating');
}

function stopAllMusic() {
  if (!currentMusic) return;
  const s=musicSounds[currentMusic];
  if (s) {
    stopFns(s.gainNode);
    s.gainNode.gain.setTargetAtTime(0,getCtx().currentTime,0.8);
    const id=currentMusic;
    setTimeout(()=>{ if(musicSounds[id]){ musicSounds[id].nodes.forEach(n=>{try{n.stop();}catch(e){}}); musicSounds[id].gainNode.disconnect(); musicSounds[id]=null; } },2500);
  }
  document.getElementById('mc-'+currentMusic).classList.remove('playing');
  document.getElementById('wf-'+currentMusic).classList.remove('animating');
  currentMusic=null;
}

// ─── Sleep Timer ─────────────────────────────────
let timerInterval = null;
let timerEnd = null;
let timerTotalMs = 0;
let timerOpen = false;
let customH = 0;
let customM = 0;
let customS = 0;

const CIRCUMFERENCE = 2 * Math.PI * 42; // r=42

function toggleTimerOpen() {
  timerOpen = !timerOpen;
  const panel = document.getElementById('timer-panel');
  panel.classList.toggle('open', timerOpen);
}

function fmtMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  if (m > 0) return `${m}:${s.toString().padStart(2,'0')}`;
  return `0:${s.toString().padStart(2,'0')}`;
}

function updatePillLabel() {
  const lbl = document.getElementById('timer-pill-label');
  if (!timerEnd) { lbl.textContent = 'Sleep timer'; return; }
  const rem = timerEnd - Date.now();
  if (rem <= 0) { lbl.textContent = 'Sleep timer'; return; }
  lbl.textContent = fmtMs(rem);
}

function updateRing(remainingMs) {
  const prog = document.getElementById('timer-ring-progress');
  const txt  = document.getElementById('timer-ring-text');
  const frac = timerTotalMs > 0 ? (remainingMs / timerTotalMs) : 0;
  prog.style.strokeDashoffset = CIRCUMFERENCE * (1 - frac);
  txt.textContent = fmtMs(remainingMs);
}

function startTimerMs(ms) {
  // Deactivate all preset pills (demo buttons aren't .timer-opt so this is fine)
  document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));

  clearInterval(timerInterval);
  timerTotalMs = ms;
  timerEnd = Date.now() + ms;

  const ringWrap = document.getElementById('timer-ring-wrap');
  ringWrap.style.display = 'flex';
  const startBtn = document.getElementById('timer-start-btn');
  startBtn.textContent = 'Stop';
  startBtn.classList.add('running');

  updateRing(ms);
  updatePillLabel();

  timerInterval = setInterval(() => {
    const remaining = timerEnd - Date.now();
    updateRing(Math.max(0, remaining));
    updatePillLabel();
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerEnd = null;
      startSleepSequence();
      ringWrap.style.display = 'none';
      startBtn.textContent = 'Start';
      startBtn.classList.remove('running');
      document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
      document.querySelector('.timer-opt[data-mins="0"]').classList.add('active');
      document.getElementById('timer-pill-label').textContent = 'Sleep timer';
    }
  }, 250); // 250ms interval for smooth seconds countdown
}

function setTimer(mins, el) {
  document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (mins === 0) {
    clearInterval(timerInterval);
    timerEnd = null; timerTotalMs = 0;
    document.getElementById('timer-ring-wrap').style.display = 'none';
    document.getElementById('timer-ring-text').textContent = '0:00';
    document.getElementById('timer-ring-progress').style.strokeDashoffset = 0;
    document.getElementById('timer-start-btn').textContent = 'Start';
    document.getElementById('timer-start-btn').classList.remove('running');
    document.getElementById('timer-pill-label').textContent = 'Sleep timer';
    return;
  }
  startTimerMs(mins * 60 * 1000);
}

function nudgeTime(unit, delta) {
  if (unit === 'h') {
    customH = Math.max(0, Math.min(9, customH + delta));
    document.getElementById('spin-h').textContent = customH;
  } else if (unit === 'm') {
    customM = Math.max(0, Math.min(59, customM + delta));
    document.getElementById('spin-m').textContent = customM.toString().padStart(2, '0');
  } else {
    customS = Math.max(0, Math.min(55, customS + delta));
    document.getElementById('spin-s').textContent = customS.toString().padStart(2, '0');
  }
}

function startCustomTimer() {
  // if already running, stop
  if (timerEnd) {
    setTimer(0, document.querySelector('.timer-opt[data-mins="0"]'));
    return;
  }
  const totalMs = (customH * 3600 + customM * 60 + customS) * 1000;
  if (totalMs === 0) return;
  document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
  startTimerMs(totalMs);
}

function startSleepSequence() {
  const fadeSecs = timerTotalMs < 10000 ? 1
                 : timerTotalMs < 60000 ? 3
                 : timerTotalMs < 120000 ? 8
                 : 30;
  fadeOutAllSounds(fadeSecs);
  stopAllMusic();
  // Show overlay immediately
  document.getElementById('sleep-overlay').classList.add('show');
}

function dismissSleep() {
  document.getElementById('sleep-overlay').classList.remove('show');
  document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
  document.querySelector('.timer-opt[data-mins="0"]').classList.add('active');
}

// Close timer panel when clicking outside
document.addEventListener('click', e => {
  const corner = document.getElementById('timer-corner');
  if (timerOpen && !corner.contains(e.target)) {
    timerOpen = false;
    document.getElementById('timer-panel').classList.remove('open');
  }
});