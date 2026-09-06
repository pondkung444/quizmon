"use client";

// ระบบเสียงฝั่งแอป (มือถือนักเรียนเล่นเอง) — แยกขาดจาก tvAudio.ts ของจอทีวี Boss Raid โดยตั้งใจ
//
// ทำไมไม่ refactor รวมกับ tvAudio.ts: tvAudio.ts ทดสอบจริงในคาบเรียนแล้ว มีเด็กใช้งานอยู่ ความเสี่ยง
// regression ไม่คุ้ม — ก็อป pattern มาไว้ที่นี่แทน (ดู sound-system-phase-2 handoff) ค่อยรวมทีหลัง
// ตอนทั้งสองฝั่งนิ่ง
//
// สถาปัตยกรรม (เหมือน tvAudio.ts):
//   - SFX: Web Audio API (fetch + decodeAudioData -> AudioBuffer, เล่นด้วย AudioBufferSourceNode
//     ใหม่ทุกครั้ง) เพื่อให้เสียงซ้อนกันได้ตอนตอบเร็วๆ
//   - BGM: <audio loop> ธรรมดา
//
// ต่างจาก tvAudio.ts:
//   - persist เปิด/ปิดที่ localStorage 'qm_sound_enabled' ("1"/"0") — ไม่มีคีย์ = เปิด (default ON)
//   - volume เริ่มต้นเบา (กันเผลอเปิดลำโพงดังอยู่)
//   - BGM-2 (challenge) fade in/out — BGM-1 (home) ตัดตรง
//
// singleton ระดับโมดูล: SoundProvider เรียก init()/unlock()/enterZone(); component เรียก sfx() ผ่าน
// useSfx() ก่อน unlock() ทุก method เป็น no-op (autoplay policy)

export type AppSfxName =
  | "answer_correct"
  | "answer_wrong"
  | "tap"
  | "reward_normal"
  | "reward_fanfare"
  | "path_reveal"
  | "obstacle_pass"
  | "obstacle_fail"
  | "challenge_boss_win"
  | "adventure_depart"
  | "adventure_claim"
  // PvP #12/#13 — ใช้ไฟล์ SFX ของ Boss Raid ที่ shipped แล้วซ้ำ (Pond ยังไม่ทำไฟล์เฉพาะ)
  // อ้างอิงแบบอ่านอย่างเดียว ไม่แตะ tvAudio.ts / ไฟล์ asset ของ boss-raid
  | "pvp_card"
  | "pvp_win"
  | "pvp_lose";

// โซนของแอป (แทน mapping route -> track เดิม) — SoundProvider ส่งมาแค่ตอนโซน "เปลี่ยน"
//   general   = ทุกหน้าทั่วไป (รวม /pet /quiz /adventure /pvp ฯลฯ) — playlist สุ่มต่อเนื่อง 3 เพลง
//   challenge = /raid/* — bgm_challenge_loop วนซ้ำ, เบากว่า default 10%
//   silent    = /boss-raid/* (จอมือถือนักเรียน ไม่ใช่ /tv) — เงียบสนิท
export type BgmZone = "general" | "challenge" | "silent";

// pool เพลงโซน general — เล่นทีละเพลงจนจบ (loop=false) แล้วสุ่มเพลงถัดไป "ไม่ซ้ำเพลงที่เพิ่งจบ"
const GENERAL_TRACKS = ["home", "quiz", "home2"] as const;
type GeneralTrack = (typeof GENERAL_TRACKS)[number];
type BgmTrack = GeneralTrack | "challenge";

// challenge = fade เข้า-ออก · general tracks = ตัดตรง (hard cut ระหว่างเพลงใน pool ได้)
const BGM_FADE_STATES = new Set<BgmTrack>(["challenge"]);

// challenge เบากว่าเพลงทั่วไป 10% (คูณบน getBgmVolume() ไม่ใช่ค่าที่เก็บแยก)
const CHALLENGE_VOLUME_FACTOR = 0.9;

const SFX_FILES: Record<AppSfxName, string> = {
  answer_correct: "/sfx/sfx_answer_correct.mp3",
  answer_wrong: "/sfx/sfx_answer_wrong.mp3",
  tap: "/sfx/sfx_tap.mp3",
  reward_normal: "/sfx/sfx_reward_normal.mp3",
  reward_fanfare: "/sfx/sfx_reward_fanfare.mp3",
  path_reveal: "/sfx/sfx_path_reveal.mp3",
  obstacle_pass: "/sfx/sfx_obstacle_pass.mp3",
  obstacle_fail: "/sfx/sfx_obstacle_fail.mp3",
  challenge_boss_win: "/sfx/sfx_challenge_boss_win.mp3",
  adventure_depart: "/sfx/sfx_adventure_depart.mp3",
  adventure_claim: "/sfx/sfx_adventure_claim.mp3",
  // reuse ไฟล์ Boss Raid เดิม (มีใน public/sfx/ อยู่แล้ว) — ไม่ต้อง source ไฟล์ใหม่
  pvp_card: "/sfx/sfx_hit_crit.mp3",
  pvp_win: "/sfx/sfx_result_win.mp3",
  pvp_lose: "/sfx/sfx_result_lose.mp3",
};

const BGM_SRC: Record<BgmTrack, string> = {
  home: "/sfx/bgm_home_loop.mp3",
  quiz: "/sfx/bgm_quiz_loop.mp3",
  home2: "/sfx/bgm_home2_loop.mp3",
  challenge: "/sfx/bgm_challenge_loop.mp3",
};

const STORAGE_KEY = "qm_sound_enabled"; // master (SFX + BGM)
const BGM_ENABLED_KEY = "qm_bgm_enabled"; // BGM เท่านั้น (แยกจาก master)
const BGM_VOLUME_KEY = "qm_bgm_volume"; // 0–1

// เบาโดยตั้งใจ (กันเผลอเปิดลำโพงดัง) — SFX เด่นกว่า BGM เล็กน้อย
const SFX_VOLUME = 0.55;
const BGM_VOLUME_DEFAULT = 0.2;
const BGM_FADE_MS = 900;

type SfxOptions = { playbackRate?: number; volume?: number };

function readBoolFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    // ไม่มีคีย์ = เปิด (default ON) — ปิดต่อเมื่อเก็บ "0" ไว้ชัดเจน
    return window.localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function readBgmVolume(): number {
  if (typeof window === "undefined") return BGM_VOLUME_DEFAULT;
  try {
    const raw = window.localStorage.getItem(BGM_VOLUME_KEY);
    if (raw == null) return BGM_VOLUME_DEFAULT;
    const v = parseFloat(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : BGM_VOLUME_DEFAULT;
  } catch {
    return BGM_VOLUME_DEFAULT;
  }
}

class AppAudio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<AppSfxName, AudioBuffer>();
  private inited = false;
  private unlocked = false;
  private enabled = true; // master
  private bgmEnabled = true; // BGM เท่านั้น
  private bgmVolume = BGM_VOLUME_DEFAULT;

  private bgmEls: Partial<Record<BgmTrack, HTMLAudioElement>> = {};
  private zone: BgmZone | null = null; // null = ยังไม่เข้าโซนไหน (ก่อน SoundProvider เรียก enterZone)
  private generalCurrent: GeneralTrack | null = null; // เพลง general ที่กำลัง/ควรเล่นอยู่
  private fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();
  private listeners = new Set<() => void>();

  // จำว่า track ไหนถูก "หยุดชั่วคราวเพราะแอปถูกพับไป" (background) เพื่อกลับมาเล่นต่อตอนกลับเข้าแอป
  private bgLastBgm: BgmTrack | null = null;
  private ctxSuspendedByBg = false;

  // สำหรับ useSyncExternalStore ใน SoundSettings (และปุ่มเสียงอื่นในอนาคต)
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  init() {
    if (this.inited || typeof window === "undefined") return;
    this.inited = true;
    this.enabled = readBoolFlag(STORAGE_KEY);
    this.bgmEnabled = readBoolFlag(BGM_ENABLED_KEY);
    this.bgmVolume = readBgmVolume();

    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = SFX_VOLUME;
      this.sfxGain.connect(this.ctx.destination);
      void this.preloadSfx();
    }

    for (const t of GENERAL_TRACKS) {
      // loop=false — เล่นจบเพลงแล้ว event "ended" จะสุ่มเพลงถัดไป (ดู handleGeneralEnded)
      const el = this.makeBgm(BGM_SRC[t], false);
      el.addEventListener("ended", () => this.handleGeneralEnded(t));
      this.bgmEls[t] = el;
    }
    this.bgmEls.challenge = this.makeBgm(BGM_SRC.challenge, true);

    // มือถือ (โดยเฉพาะ iOS Safari) จะเลี้ยงหน้าเว็บที่กำลังเล่นเสียงไว้เบื้องหลังเหมือน media player
    // ถ้าไม่สั่ง pause เองตอนแอปถูกพับ -> BGM ดังต่อหลังล็อกจอ/สลับแอป. จับ visibilitychange + pagehide
    // (setup ครั้งเดียวใน init; ไม่มี dispose() -> อยู่ตลอดอายุหน้า ตอน unload หน้า listener หายเอง)
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("pageshow", this.handlePageShow);
  }

  // ---- background / foreground (มือถือ) ----

  private handleVisibilityChange = () => {
    if (document.hidden) this.pauseForBackground();
    else this.resumeFromBackground();
  };

  // pagehide: อาจไม่กลับมา (สลับเว็บ/ปิดแท็บ) — pause อย่างเดียวพอ. ถ้ากลับมาจาก bfcache
  // visibilitychange หรือ pageshow(persisted) จะสั่ง resume ให้เอง
  private handlePageHide = () => {
    this.pauseForBackground();
  };

  private handlePageShow = (e: PageTransitionEvent) => {
    if (e.persisted) this.resumeFromBackground();
  };

  private pauseForBackground() {
    // จำ track ที่ควรกำลังเล่นอยู่ก่อนพับ (เช็คจาก activeTrack ไม่ใช่แค่ el.paused เพราะอาจ fade ค้าง)
    const active = this.activeTrack;
    const activeEl = active ? this.bgmEls[active] : undefined;
    if (activeEl && !activeEl.paused) this.bgLastBgm = active;

    for (const el of this.allBgmEls()) {
      if (el.paused) continue;
      this.cancelFade(el); // หยุด fade ที่ค้าง — กลับมาค่อย snap ไป target
      el.pause(); // คง currentTime ไว้ เล่นต่อจากจุดเดิม
    }
    if (this.ctx && this.ctx.state === "running") {
      this.ctxSuspendedByBg = true;
      void this.ctx.suspend();
    }
  }

  private resumeFromBackground() {
    if (this.ctxSuspendedByBg && this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    this.ctxSuspendedByBg = false;

    const last = this.bgLastBgm;
    this.bgLastBgm = null;
    if (!last) return;

    // เช็ค state สดตอนนี้ (ผู้ใช้อาจกดปิด BGM/master ระหว่างที่พับอยู่ หรือเปลี่ยนหน้าไปแล้ว)
    const canResume =
      this.unlocked &&
      this.isEnabled() &&
      this.isBgmEnabled() &&
      this.activeTrack === last;

    if (canResume) {
      const el = this.bgmEls[last];
      if (el && el.paused) {
        el.volume = this.trackTargetVolume(last); // snap ไป target (เผื่อ fade ค้างตอนพับ)
        void el.play().catch(() => {});
      }
    } else {
      // state เปลี่ยนระหว่างพับ — sync ให้ตรงกับที่ควรเป็นตอนนี้
      this.applyBgm();
    }
  }

  private makeBgm(src: string, loop: boolean): HTMLAudioElement {
    const el = new Audio(src);
    el.loop = loop;
    el.preload = "auto";
    el.volume = this.bgmVolume;
    return el;
  }

  private async preloadSfx() {
    if (!this.ctx) return;
    await Promise.all(
      (Object.keys(SFX_FILES) as AppSfxName[]).map(async (name) => {
        try {
          const res = await fetch(SFX_FILES[name]);
          if (!res.ok) return; // ไฟล์ยังไม่ถูกวาง — ข้ามเงียบๆ ไม่ throw
          const arr = await res.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(arr);
          this.buffers.set(name, buf);
        } catch {
          // preload ล้มเหลว (ไฟล์ไม่มี / decode ไม่ได้) — no-op ตอนเล่นจุดนั้นแทน ไม่ให้พังทั้งแอป
        }
      })
    );
  }

  // ⚠️ เรียก synchronous ใน gesture handler จริงเท่านั้น (ห้าม await ก่อน)
  unlock() {
    if (!this.inited) this.init();
    this.unlocked = true;
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    this.applyBgm();
  }

  isUnlocked() {
    return this.unlocked;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(next: boolean) {
    this.enabled = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // private mode ฯลฯ — ค่าจะไม่ persist แต่ session นี้ยังทำงานตาม this.enabled
    }
    if (!next) {
      this.stopAllBgm();
    } else {
      this.applyBgm();
    }
    this.emit();
  }

  // ---- BGM-only controls (แยกจาก master; master ยังชนะเสมอ) ----

  isBgmEnabled() {
    return this.bgmEnabled;
  }

  setBgmEnabled(next: boolean) {
    this.bgmEnabled = next;
    try {
      window.localStorage.setItem(BGM_ENABLED_KEY, next ? "1" : "0");
    } catch {
      // private mode — session นี้ยังทำงานตาม this.bgmEnabled
    }
    if (!next) {
      this.stopAllBgm();
    } else {
      this.applyBgm();
    }
    this.emit();
  }

  getBgmVolume() {
    return this.bgmVolume;
  }

  setBgmVolume(next: number) {
    const v = Math.max(0, Math.min(1, Number.isFinite(next) ? next : BGM_VOLUME_DEFAULT));
    this.bgmVolume = v;
    try {
      window.localStorage.setItem(BGM_VOLUME_KEY, String(v));
    } catch {
      // private mode
    }
    // ใช้กับ track ที่กำลังเล่นอยู่ทันที (ยกเลิก fade ที่ค้างอยู่ด้วย ไม่งั้นมันจะ target ค่าเก่า)
    const active = this.activeTrack;
    const el = active ? this.bgmEls[active] : undefined;
    if (active && el && !el.paused) {
      const t = this.fadeTimers.get(el);
      if (t) {
        clearInterval(t);
        this.fadeTimers.delete(el);
      }
      el.volume = this.trackTargetVolume(active);
    }
    this.emit();
  }

  sfx(name: AppSfxName, opts?: SfxOptions) {
    if (!this.enabled || !this.unlocked || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(name);
    if (!buf) return; // ไฟล์ยังไม่ถูกวาง — no-op
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    if (opts?.playbackRate && opts.playbackRate > 0) {
      node.playbackRate.value = opts.playbackRate;
    }
    if (opts?.volume != null) {
      const shotGain = this.ctx.createGain();
      shotGain.gain.value = Math.max(0, opts.volume);
      node.connect(shotGain);
      shotGain.connect(this.sfxGain);
    } else {
      node.connect(this.sfxGain);
    }
    node.start(0);
  }

  // เรียกโดย SoundProvider เมื่อ "โซนเปลี่ยน" เท่านั้น (เทียบ zone เดิม/ใหม่ทุกครั้งที่ pathname เปลี่ยน)
  // no-op ถ้าโซนไม่เปลี่ยน แม้ route ภายในโซนจะเปลี่ยน -> เพลง general เล่นต่อไม่สะดุดตอนสลับหน้าทั่วไป
  enterZone(zone: BgmZone) {
    if (this.zone === zone) return;
    this.zone = zone;
    if (zone === "general") {
      // fresh start เสมอ (เข้าแอปครั้งแรก หรือกลับจาก challenge/silent) — ไม่ resume ตำแหน่งเดิม
      this.startGeneralPlayback();
    } else {
      // challenge / silent — หยุดเพลง general (ไม่จำตำแหน่ง)
      this.stopGeneralPlayback();
    }
    this.applyBgm();
  }

  // track ที่ "ควร" กำลังเล่นตามโซนปัจจุบัน (ยังไม่คิดเรื่อง mute/unlock — นั่นเป็นหน้าที่ applyBgm)
  private get activeTrack(): BgmTrack | null {
    if (this.zone === "challenge") return "challenge";
    if (this.zone === "general") return this.generalCurrent;
    return null; // silent / ยังไม่เข้าโซน
  }

  private trackTargetVolume(track: BgmTrack): number {
    return track === "challenge" ? this.bgmVolume * CHALLENGE_VOLUME_FACTOR : this.bgmVolume;
  }

  // สุ่มเพลงจาก pool ทั้ง 3 (ไม่มีเพลง "แรก" ที่บังคับ) — ใช้ตอน fresh start
  private startGeneralPlayback() {
    this.generalCurrent =
      GENERAL_TRACKS[Math.floor(Math.random() * GENERAL_TRACKS.length)];
    const el = this.bgmEls[this.generalCurrent];
    if (el) el.currentTime = 0;
  }

  private stopGeneralPlayback() {
    this.generalCurrent = null;
  }

  // event "ended" ของเพลง general — สุ่มเพลงถัดไป "ไม่ซ้ำเพลงที่เพิ่งจบ" แล้วเล่นต่อทันที (hard cut)
  private handleGeneralEnded(finished: GeneralTrack) {
    if (this.zone !== "general") return; // กันเคส race: เพลงจบพอดีตอนเพิ่งนำทางเข้า challenge/silent
    const others = GENERAL_TRACKS.filter((t) => t !== finished);
    this.generalCurrent = others[Math.floor(Math.random() * others.length)];
    const el = this.bgmEls[this.generalCurrent];
    if (el) el.currentTime = 0;
    this.applyBgm();
  }

  // fade volume ของ <audio> element ไปที่ target ภายใน ms (เรียกซ้ำได้ ยกเลิก fade เดิมก่อน)
  bgmFadeTo(el: HTMLAudioElement, targetVolume: number, ms: number) {
    const existing = this.fadeTimers.get(el);
    if (existing) clearInterval(existing);
    const clampedTarget = Math.max(0, Math.min(1, targetVolume));
    const stepMs = 50;
    const steps = Math.max(1, Math.round(ms / stepMs));
    const start = el.volume;
    const delta = (clampedTarget - start) / steps;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      const v = i >= steps ? clampedTarget : start + delta * i;
      el.volume = Math.max(0, Math.min(1, v));
      if (i >= steps) {
        clearInterval(timer);
        this.fadeTimers.delete(el);
        if (clampedTarget === 0) {
          el.pause();
          el.currentTime = 0;
        }
      }
    }, stepMs);
    this.fadeTimers.set(el, timer);
  }

  private allBgmEls(): HTMLAudioElement[] {
    return Object.values(this.bgmEls).filter((el): el is HTMLAudioElement => !!el);
  }

  private cancelFade(el: HTMLAudioElement) {
    const t = this.fadeTimers.get(el);
    if (t) {
      clearInterval(t);
      this.fadeTimers.delete(el);
    }
  }

  private stopBgmEl(el: HTMLAudioElement, fade: boolean) {
    if (fade && !el.paused) {
      this.bgmFadeTo(el, 0, BGM_FADE_MS); // fade ออกแล้ว pause เองตอนถึง 0
      return;
    }
    this.cancelFade(el);
    if (!el.paused) {
      el.pause();
      el.currentTime = 0;
    }
  }

  private stopAllBgm() {
    for (const el of this.allBgmEls()) this.stopBgmEl(el, false);
  }

  private applyBgm() {
    if (!this.unlocked || !this.enabled || !this.bgmEnabled) return;
    const want = this.activeTrack;

    // หยุด track อื่นที่ไม่ใช่ track ที่ต้องการ (fade ออกถ้าเป็น challenge, ไม่งั้นตัดตรง)
    for (const key of Object.keys(BGM_SRC) as BgmTrack[]) {
      if (key === want) continue;
      const el = this.bgmEls[key];
      if (el) this.stopBgmEl(el, BGM_FADE_STATES.has(key));
    }

    if (want === null) return;
    const el = this.bgmEls[want];
    if (!el) return;
    const target = this.trackTargetVolume(want);

    if (BGM_FADE_STATES.has(want)) {
      this.cancelFade(el);
      if (el.paused) {
        el.volume = 0;
        el.currentTime = 0;
        void el.play().catch(() => {});
      }
      this.bgmFadeTo(el, target, BGM_FADE_MS);
    } else {
      // general track — ตัดตรง (hard cut)
      this.cancelFade(el);
      el.volume = target;
      if (el.paused) void el.play().catch(() => {});
    }
  }
}

// singleton — 1 instance ต่อ 1 tab/ผู้เล่น
export const appAudio = new AppAudio();
