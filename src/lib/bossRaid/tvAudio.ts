"use client";

// ระบบเสียงจอทีวี Boss Raid — เล่นเฉพาะที่จอ TV/โปรเจกเตอร์ (ไม่ทำที่มือถือนักเรียน)
//
// สถาปัตยกรรม:
//   - SFX: Web Audio API (fetch + decodeAudioData เก็บเป็น AudioBuffer, เล่นด้วย AudioBufferSourceNode
//     ใหม่ทุกครั้ง) — เพราะนักเรียนหลายคนตอบถูกพร้อมกัน ต้องเล่นเสียงซ้อนได้โดยไม่ตัดเสียงเดิม
//     ซึ่ง <audio> element เดี่ยวทำไม่ได้
//   - BGM: <audio> element ธรรมดา loop=true — สลับ lobby -> battle แบบ hard switch
//
// เป็น singleton ระดับโมดูล: TvClient เรียก init()/unlock()/setBgm()/dispose(); useBossRaidTv เรียก sfx()
// จาก realtime callback โดยตรง. ก่อน unlock() ทุก method เป็น no-op (autoplay policy ของ browser)
//
// ⚠️ unlock() ต้องถูกเรียกแบบ synchronous ใน click handler จริง (ห้าม await ก่อน) ไม่งั้น browser
// บล็อก AudioContext.resume() / <audio>.play()

export type TvSfxName =
  | "hit_normal"
  | "hit_crit"
  | "crystal_crack"
  | "tier_up"
  | "event_weak_point"
  | "event_meteor"
  | "event_enrage"
  | "event_chosen_warrior"
  | "event_combo_burst"
  | "result_win"
  | "result_lose";

export type TvBgmState = "lobby" | "battle" | null;

// ชื่อไฟล์ตรงกับ public/sfx/ 100% (เช็คกับ repo แล้ว)
const SFX_FILES: Record<TvSfxName, string> = {
  hit_normal: "/sfx/sfx_hit_normal.mp3",
  hit_crit: "/sfx/sfx_hit_crit.mp3",
  crystal_crack: "/sfx/sfx_crystal_crack.mp3",
  tier_up: "/sfx/sfx_tier_up.mp3",
  event_weak_point: "/sfx/sfx_event_weak_point.mp3",
  event_meteor: "/sfx/sfx_event_meteor.mp3",
  event_enrage: "/sfx/sfx_event_enrage.mp3",
  event_chosen_warrior: "/sfx/sfx_event_chosen_warrior.mp3",
  event_combo_burst: "/sfx/sfx_event_combo_burst.mp3",
  result_win: "/sfx/sfx_result_win.mp3",
  result_lose: "/sfx/sfx_result_lose.mp3",
};

const BGM_LOBBY_SRC = "/sfx/bgm_lobby.mp3";
const BGM_BATTLE_SRC = "/sfx/bgm_battle_loop.mp3";

// BGM เบากว่า SFX เล็กน้อยให้ SFX เด่นตอนเล่นทับ
const BGM_VOLUME = 0.35;

class TvAudio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<TvSfxName, AudioBuffer>();
  private inited = false;
  private unlocked = false;

  private bgmLobby: HTMLAudioElement | null = null;
  private bgmBattle: HTMLAudioElement | null = null;
  private desiredBgm: TvBgmState = null;

  // เรียกตอน TV page mount — โหลด/ decode ไฟล์ทั้งหมดล่วงหน้า (ยังไม่เล่นอะไร)
  init() {
    if (this.inited || typeof window === "undefined") return;
    this.inited = true;

    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1;
      this.sfxGain.connect(this.ctx.destination);
      void this.preloadSfx();
    }

    this.bgmLobby = this.makeBgm(BGM_LOBBY_SRC);
    this.bgmBattle = this.makeBgm(BGM_BATTLE_SRC);
  }

  private makeBgm(src: string): HTMLAudioElement {
    const el = new Audio(src);
    el.loop = true;
    el.preload = "auto";
    el.volume = BGM_VOLUME;
    return el;
  }

  private async preloadSfx() {
    if (!this.ctx) return;
    await Promise.all(
      (Object.keys(SFX_FILES) as TvSfxName[]).map(async (name) => {
        try {
          const res = await fetch(SFX_FILES[name]);
          const arr = await res.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(arr);
          this.buffers.set(name, buf);
        } catch (e) {
          console.warn("[tv-audio] preload failed", name, e);
        }
      })
    );
  }

  // ⚠️ เรียก synchronous ใน click handler เท่านั้น
  unlock() {
    if (!this.inited) this.init();
    this.unlocked = true;
    // resume แบบ sync ใน gesture (ไม่ await) — ไม่งั้นโดน autoplay policy บล็อก
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    // สั่ง BGM ตาม state ที่ตั้งไว้ก่อนหน้า (TvClient set ตาม session.status ตั้งแต่ก่อน unlock)
    this.applyBgm();
  }

  isUnlocked() {
    return this.unlocked;
  }

  sfx(name: TvSfxName) {
    if (!this.unlocked || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.sfxGain);
    node.start(0);
  }

  setBgm(state: TvBgmState) {
    if (this.desiredBgm === state) return;
    this.desiredBgm = state;
    this.applyBgm();
  }

  private applyBgm() {
    if (!this.unlocked) return;
    const want = this.desiredBgm;
    const play = want === "lobby" ? this.bgmLobby : want === "battle" ? this.bgmBattle : null;
    const stop = want === "lobby" ? this.bgmBattle : this.bgmLobby;

    if (stop && !stop.paused) {
      stop.pause();
      stop.currentTime = 0;
    }
    if (want === null) {
      if (this.bgmLobby && !this.bgmLobby.paused) this.bgmLobby.pause();
      if (this.bgmBattle && !this.bgmBattle.paused) this.bgmBattle.pause();
      return;
    }
    if (play && play.paused) {
      void play.play().catch((e) => console.warn("[tv-audio] bgm play failed", e));
    }
  }

  dispose() {
    this.bgmLobby?.pause();
    this.bgmBattle?.pause();
    this.bgmLobby = null;
    this.bgmBattle = null;
    this.buffers.clear();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.sfxGain = null;
    this.inited = false;
    this.unlocked = false;
    this.desiredBgm = null;
  }
}

// singleton — TV page มีจอเดียวต่อ session, ไม่ต้องรองรับหลาย instance
export const tvAudio = new TvAudio();
