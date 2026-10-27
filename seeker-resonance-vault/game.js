// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * The Seeker: Resonance Vault - Tactical Cavern Survival Engine
 * Features:
 * - Smooth interpolated tile swaps, invalid-swap bounce-back, and match flash/scale-pop
 * - Sonar cross beams, shockwave rings, prismatic lightning arcs, and screen shake
 * - Live valid-swap neighbor highlights (⇄), automatic deadlock prevention, and idle move coach
 * - Tap-to-detonate OR swap-to-combine Creature Cores (✚, ✕, ◎, ❖)
 * - Live Mission Objectives Checklist & Cavern Warmth Thermometer Gauge
 * - Interactive How-To-Play Survival Field Manual
 * - New Pixel Art Sprites for Upgrades (4-frame animated Cave Spiders, Web Overlays, Frost Plates)
 * - Cinematic "Thanks for Playing" Ending Cutscene with Pod Blast-off from the Planet!
 */

class ResonanceGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.introCanvas = document.getElementById('intro-cutscene-canvas');
    this.introCtx = this.introCanvas ? this.introCanvas.getContext('2d') : null;
    this.audio = new VaultAudio();
    this.cinema = new VaultCinema();
    this.chamberFinished = false;
    this.endTimer = null;
    this.keyboardCell = { c: 0, r: 0 };
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.activeForm = '';
    this.formTimer = 0;

    // 480x560 native resolution = exact 2x integer scale for 32x32 sprites (64x64 per cell)
    this.NATIVE_W = 480;
    this.NATIVE_H = 560;
    this.canvas.width = this.NATIVE_W;
    this.canvas.height = this.NATIVE_H;

    // Campaign Data
    this.chambers = typeof CHAMBERS !== 'undefined' ? CHAMBERS : [];
    this.relicDefs = typeof RELIC_DEFINITIONS !== 'undefined' ? RELIC_DEFINITIONS : [];
    this.currentChamberIndex = 0;
    this.currentChamber = this.chambers[0] || null;
    this.isEndless = false;

    this.saveKey = 'seeker_resonance_vault_community_v1';
    this.campaignData = this.loadCampaign();

    // Game State
    this.score = 0;
    this.chamberScore = 0;
    this.depth = 0;
    this.maxDepth = 1051;
    this.turnsRemaining = 18;
    this.seekerPack = 1;
    this.attunementGauge = 20;
    this.specimens = 0;

    this.isAttuning = false;
    this.attuningTimer = 0;

    // Cutscene States
    this.isEndingCutscene = false;
    this.endingTimer = 0;
    this.isLandingCutscene = false;
    this.landingTimer = 0;
    this.endingStars = Array.from({ length: 65 }, (_, i) => ({
      x: (i * 37 + 13) % this.NATIVE_W,
      y: (i * 29 + 7) % this.NATIVE_H,
      size: (i % 5 === 0) ? 2.5 : ((i % 2 === 0) ? 1.5 : 1.0),
      speed: 0.8 + (i % 4) * 0.4,
      color: ['#FFFFFF', '#91CBDE', '#E8CD86', '#FFF9D2', '#B584C4'][i % 5],
      twinkle: i * 0.45
    }));

    // Ambient Panorama Dust/Spore Motes
    this.ambientMotes = Array.from({ length: 18 }, (_, i) => ({
      x: 24 + (i * 25) % 430,
      y: 14 + (i * 17) % 60,
      vx: (i % 2 === 0 ? 1 : -1) * (4 + (i % 5) * 2),
      vy: -3 - (i % 4) * 2,
      size: (i % 3 === 0) ? 2 : 1,
      phase: i * 0.7
    }));

    // Biomes
    this.biomes = [
      { name: 'THE GLACIAL SHELF', depthMax: 250, bg: '#070D18', glow: '#1A2D48', accent: '#91CBDE' },
      { name: 'FROZEN CAVERNS',    depthMax: 550, bg: '#0A1420', glow: '#213B52', accent: '#7BACBC' },
      { name: 'TUNDRA UNDERSTORY', depthMax: 850, bg: '#0C1714', glow: '#203F33', accent: '#A5C77F' },
      { name: 'THE ABYSSAL HEART', depthMax: 1051, bg: '#110C18', glow: '#3A203E', accent: '#E8CD86' }
    ];

    this.sprites = {
      glyphs: null,
      seeker: null,
      frame: null,
      diorama: null,
      spider: null,
      capsule: null
    };

    // 7x7 board * 64px = 448x448 px
    this.boardX = 16;
    this.boardY = 96;
    this.cellSize = 64;

    this.board = new ResonanceBoard(this.audio, this.handleMatch.bind(this));

    // Pointer input tracking for tap-to-swap and drag-to-swap
    this.dragStartCell = null;
    this.isPointerDown = false;
    this.lastFrameTime = performance.now();
    this.animClock = 0;

    this.init();
  }

  loadCampaign() {
    try {
      const saved = localStorage.getItem(this.saveKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && ['unlocked', 'stars', 'highScores', 'unlockedRelics', 'equippedRelics'].every(key => Array.isArray(data[key]))) {
          const ids = new Set(this.relicDefs.map(relic => relic.id));
          // The first review supplied an unearned starter relic. Preserve earned
          // discoveries while migrating that starter out of unfinished campaigns.
          const unlockedRelics = data.unlockedRelics.filter(id => ids.has(id) &&
            (id !== 'ammonite' || Number(data.stars[0]) > 0));
          return {
            unlocked: Array.from({ length: 6 }, (_, i) => i === 0 || data.unlocked[i] === true),
            stars: Array.from({ length: 6 }, (_, i) => Number.isInteger(data.stars[i]) ? Math.max(0, Math.min(3, data.stars[i])) : 0),
            highScores: Array.from({ length: 6 }, (_, i) => Number.isFinite(data.highScores[i]) ? Math.max(0, data.highScores[i]) : 0),
            unlockedRelics,
            equippedRelics: [...new Set(data.equippedRelics.filter(id => unlockedRelics.includes(id)))].slice(0, 3)
          };
        }
      }
    } catch (e) {}
    return {
      unlocked: [true, false, false, false, false, false],
      stars: [0, 0, 0, 0, 0, 0],
      highScores: [0, 0, 0, 0, 0, 0],
      unlockedRelics: [],
      equippedRelics: []
    };
  }

  saveCampaign() {
    try {
      this.campaignData.equippedRelics = Array.from(this.board.equippedRelics);
      localStorage.setItem(this.saveKey, JSON.stringify(this.campaignData));
    } catch (e) {}
  }

  async init() {
    this.setupInputs();
    this.setupHUD();
    this.setupDialogFocus();
    const motionButton = document.getElementById('btn-motion');
    const syncMotion = () => {
      document.body?.classList.toggle('reduce-motion', this.reducedMotion);
      if (motionButton) {
        motionButton.textContent = this.reducedMotion ? 'MOTION: LOW' : 'MOTION: ON';
        motionButton.setAttribute?.('aria-pressed', String(this.reducedMotion));
      }
    };
    syncMotion();
    motionButton?.addEventListener('click', () => {
      this.reducedMotion = !this.reducedMotion;
      syncMotion();
    });

    // Sync equipped relics into board
    this.board.equippedRelics = new Set(this.campaignData.equippedRelics || []);

    // Start fresh at Chamber 1 · Surface Fissure (unlocked progress accessible via [C] Chamber Map)
    this.startChamber(0);

    // Launch Beginning Landing Cutscene on startup (transitions into Start Expedition tab when done)
    this.startLandingCutscene();

    // Start render loop immediately
    requestAnimationFrame(this.loop.bind(this));

    await this.loadAssets();


  }

  setupDialogFocus() {
    if (typeof MutationObserver === 'undefined') return;
    const overlays = [...document.querySelectorAll('.overlay')];
    const surfaces = [document.getElementById('hud'), document.getElementById('main-deck'), document.getElementById('footer')];
    let active = null;
    let returnFocus = null;
    const focusable = modal => [...modal.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')]
      .filter(el => el.getClientRects().length);
    overlays.forEach(modal => {
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const title = modal.querySelector('h1, h2');
      if (title) {
        title.id ||= modal.id + '-title';
        modal.setAttribute('aria-labelledby', title.id);
      }
    });
    const sync = () => {
      const visible = overlays.filter(modal => modal.style.display !== 'none');
      const next = visible[visible.length - 1] || null;
      if (active === next) return;
      if (!active && next) returnFocus = document.activeElement;
      active = next;
      surfaces.forEach(el => { if (el) el.inert = !!active; });
      overlays.forEach(el => { el.inert = !!active && el !== active; });
      if (active) focusable(active)[0]?.focus();
      else if (returnFocus?.getClientRects().length && !returnFocus.closest('.overlay')) returnFocus.focus();
      else this.canvas.focus();
    };
    overlays.forEach(modal => new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['style'] }));
    document.addEventListener('keydown', event => {
      if (!active || event.key !== 'Tab') return;
      const controls = focusable(active);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault(); controls[controls.length - 1].focus();
      } else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) {
        event.preventDefault(); controls[0].focus();
      }
    }, true);
    sync();
  }

  restartGame() {
    this.startChamber(this.currentChamberIndex);
  }

  startEndingCutscene() {
    this.isEndingCutscene = true;
    this.isLandingCutscene = false;
    this.endingTimer = 0;
    this.audio.playRocketLaunch();

    const vm = document.getElementById('chamber-victory-modal');
    const fm = document.getElementById('chamber-failed-modal');
    const cm = document.getElementById('chambers-modal');
    const hm = document.getElementById('howto-modal');
    const rm = document.getElementById('relics-modal');
    if (vm) vm.style.display = 'none';
    if (fm) fm.style.display = 'none';
    if (cm) cm.style.display = 'none';
    if (hm) hm.style.display = 'none';
    if (rm) rm.style.display = 'none';
  }

  exitEndingCutscene() {
    this.isEndingCutscene = false;
    this.endingTimer = 0;
  }

  startLandingCutscene() {
    this.isLandingCutscene = true;
    this.isEndingCutscene = false;
    this.landingTimer = 0;
    this.audio.playRocketLanding();

    const io = document.getElementById('intro-overlay');
    if (io) io.style.display = 'flex';

    const vm = document.getElementById('chamber-victory-modal');
    const fm = document.getElementById('chamber-failed-modal');
    const cm = document.getElementById('chambers-modal');
    const hm = document.getElementById('howto-modal');
    const rm = document.getElementById('relics-modal');
    if (vm) vm.style.display = 'none';
    if (fm) fm.style.display = 'none';
    if (cm) cm.style.display = 'none';
    if (hm) hm.style.display = 'none';
    if (rm) rm.style.display = 'none';
  }

  exitLandingCutscene(keepOverlay = false) {
    this.isLandingCutscene = false;
    this.landingTimer = 0;
    const io = document.getElementById('intro-overlay');
    if (io) {
      io.style.display = keepOverlay ? 'flex' : 'none';
    }
  }

  startChamber(index) {
    if (this.board.isResolving || this.board.isSwapping) return;
    clearTimeout(this.endTimer);
    this.chamberFinished = false;
    for (const id of ['intro-overlay', 'chamber-victory-modal', 'chamber-failed-modal']) {
      const modal = document.getElementById(id);
      if (modal) modal.style.display = 'none';
    }
    this.isEndingCutscene = false;
    this.isLandingCutscene = false;
    this.isEndless = false;
    this.currentChamberIndex = Math.max(0, Math.min(this.chambers.length - 1, index));
    this.currentChamber = this.chambers[this.currentChamberIndex];

    this.depth = this.currentChamber.startDepth;
    if (this.depth >= 750) this.seekerPack = 3;
    else if (this.depth >= 300) this.seekerPack = 2;
    else this.seekerPack = 1;
    this.turnsRemaining = this.currentChamber.maxTurns;
    this.chamberScore = 0;
    this.attunementGauge = 20;
    this.runStats = { moves: 0, hints: 0, powers: 0 };
    this.activeForm = '';
    this.formTimer = 0;
    this.board.equippedRelics = new Set([...this.board.equippedRelics].slice(0, this.seekerPack >= 3 ? 3 : 2));

    this.board.loadChamber(this.currentChamber);
    this.updateHUD();
    this.updateMissionChecklist();
    this.updateChainBanner();
    this.updateRelicsUI();
  }

  startEndless() {
    if (this.board.isResolving || this.board.isSwapping) return;
    clearTimeout(this.endTimer);
    this.chamberFinished = false;
    this.isLandingCutscene = false;
    this.seekerPack = 1;
    this.attunementGauge = 40;
    this.runStats = { moves: 0, hints: 0, powers: 0 };
    this.activeForm = '';
    this.formTimer = 0;
    this.board.currentChamber = null;
    for (const id of ['intro-overlay', 'chamber-victory-modal', 'chamber-failed-modal']) {
      const modal = document.getElementById(id);
      if (modal) modal.style.display = 'none';
    }
    this.isEndingCutscene = false;
    this.isEndless = true;
    this.currentChamber = {
      id: 99,
      name: 'ENDLESS DESCENT',
      subtitle: 'Free Exploration · The Abyssal Void',
      startDepth: 0,
      targetDepth: 99999,
      maxTurns: 999,
      biomeIdx: 3,
      artifact: 'Deep Resonance Seal',
      description: 'Continuous tactical survival descent into the deep cavern.',
      objectives: { depth: 99999 }
    };
    this.depth = 0;
    this.turnsRemaining = 999;
    this.chamberScore = 0;
    this.board.init();
    this.updateHUD();
    this.updateMissionChecklist();
    this.updateChainBanner();
  }

  setupHUD() {
    const btnLanding = document.getElementById('btn-landing');
    if (btnLanding) {
      btnLanding.addEventListener('click', () => {
        this.startLandingCutscene();
      });
    }

    const btnCutscene = document.getElementById('btn-cutscene');
    if (btnCutscene) {
      btnCutscene.addEventListener('click', () => {
        this.startEndingCutscene();
      });
    }

    const btnVicCutscene = document.getElementById('btn-vic-cutscene');
    if (btnVicCutscene) {
      btnVicCutscene.addEventListener('click', () => {
        this.startEndingCutscene();
      });
    }

    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        const isMuted = this.audio.toggleMute();
        btnMute.textContent = isMuted ? 'UNMUTE [M]' : 'MUTE [M]';
      });
    }

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
      btnHint.addEventListener('click', () => {
        this.audio.resume();
        this.showHint();
      });
    }

    const openHowTo = () => {
      this.audio.resume();
      const modal = document.getElementById('howto-modal');
      if (modal) modal.style.display = 'flex';
    };
    const closeHowTo = () => {
      const modal = document.getElementById('howto-modal');
      if (modal) modal.style.display = 'none';
    };

    const btnHowTo = document.getElementById('btn-howto');
    if (btnHowTo) btnHowTo.addEventListener('click', openHowTo);

    const btnIntroHowTo = document.getElementById('btn-intro-howto');
    if (btnIntroHowTo) {
      btnIntroHowTo.addEventListener('click', () => {
        openHowTo();
      });
    }

    const btnCloseHowTo = document.getElementById('btn-close-howto');
    if (btnCloseHowTo) btnCloseHowTo.addEventListener('click', closeHowTo);

    const btnGotIt = document.getElementById('btn-got-it');
    if (btnGotIt) btnGotIt.addEventListener('click', closeHowTo);

    const btnChambers = document.getElementById('btn-chambers');
    if (btnChambers) {
      btnChambers.addEventListener('click', () => {
        this.openChamberMap();
      });
    }

    const btnCloseMap = document.getElementById('btn-close-map');
    if (btnCloseMap) {
      btnCloseMap.addEventListener('click', () => {
        document.getElementById('chambers-modal').style.display = 'none';
      });
    }

    const btnEndless = document.getElementById('btn-start-endless');
    if (btnEndless) {
      btnEndless.addEventListener('click', () => {
        document.getElementById('chambers-modal').style.display = 'none';
        this.startEndless();
      });
    }

    const btnRelicsHud = document.getElementById('btn-relics-hud');
    if (btnRelicsHud) {
      btnRelicsHud.addEventListener('click', () => {
        this.openRelicsModal();
      });
    }

    const btnOpenRelics = document.getElementById('btn-open-relics');
    if (btnOpenRelics) {
      btnOpenRelics.addEventListener('click', () => {
        this.openRelicsModal();
      });
    }

    const btnCloseRelics = document.getElementById('btn-close-relics');
    if (btnCloseRelics) {
      btnCloseRelics.addEventListener('click', () => {
        this.closeRelicsModal();
      });
    }

    const btnCloseRelicsBottom = document.getElementById('btn-close-relics-bottom');
    if (btnCloseRelicsBottom) {
      btnCloseRelicsBottom.addEventListener('click', () => {
        this.closeRelicsModal();
      });
    }

    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        this.audio.init();
        this.exitLandingCutscene(false);
        document.getElementById('intro-overlay').style.display = 'none';
      });
    }

    const btnNextChamber = document.getElementById('btn-next-chamber');
    if (btnNextChamber) {
      btnNextChamber.addEventListener('click', () => {
        document.getElementById('chamber-victory-modal').style.display = 'none';
        if (this.currentChamberIndex < this.chambers.length - 1) {
          this.startChamber(this.currentChamberIndex + 1);
        } else {
          this.startEndingCutscene();
        }
      });
    }

    const btnRetryChamber = document.getElementById('btn-retry-chamber');
    if (btnRetryChamber) {
      btnRetryChamber.addEventListener('click', () => {
        document.getElementById('chamber-failed-modal').style.display = 'none';
        this.startChamber(this.currentChamberIndex);
      });
    }

    const btnVicMap = document.getElementById('btn-vic-map');
    if (btnVicMap) {
      btnVicMap.addEventListener('click', () => {
        document.getElementById('chamber-victory-modal').style.display = 'none';
        this.openChamberMap();
      });
    }

    const btnFailMap = document.getElementById('btn-fail-map');
    if (btnFailMap) {
      btnFailMap.addEventListener('click', () => {
        document.getElementById('chamber-failed-modal').style.display = 'none';
        this.openChamberMap();
      });
    }

    const bindForm = (id, cost, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        this.useCreatureForm(cost, fn);
      });
    };

    bindForm('form-bat', 25, () => this.board.triggerEchoHint());
    bindForm('form-spider', 35, () => this.board.enableWebBridge());
    bindForm('form-squid', 50, () => this.board.triggerAbyssalSiphon());
    bindForm('form-buzzer', 60, () => this.board.triggerBuzzerResonance());
  }

  canPlay() {
    return !this.chamberFinished && !this.isLandingCutscene && !this.isEndingCutscene &&
      !['intro-overlay', 'howto-modal', 'chambers-modal', 'relics-modal',
        'chamber-victory-modal', 'chamber-failed-modal'].some(id => {
          const el = document.getElementById(id);
          return el && el.style.display === 'flex';
        });
  }

  showHint() {
    if (!this.canPlay() || this.board.isResolving || this.board.isSwapping) return;
    this.board.showHint();
    this.runStats.hints++;
    this.updateChainBanner();
  }

  useCreatureForm(cost, actionFn) {
    if (!this.canPlay()) return;
    this.audio.resume();
    if (this.attunementGauge < cost || this.board.isResolving || this.board.isSwapping) return;
    if (actionFn()) {
      this.runStats.powers++;
      this.activeForm = ({ 25: 'BAT / ECHO SENSE', 35: 'EMBER / THERMAL SENSE', 50: 'SQUID / ABYSSAL SENSE', 60: 'BUZZER / MINERAL SENSE' })[cost] || '';
      this.formTimer = 3;
      this.attunementGauge = Math.max(0, this.attunementGauge - cost);
      this.isAttuning = true;
      this.attuningTimer = 0.9;
      this.updateHUD();
      this.updateMissionChecklist();
      this.updateChainBanner();
      if (!this.isEndless && !this.board.isResolving) this.checkChamberEndConditions();
    }
  }

  async loadAssets() {
    const loadWithFallbackPaths = async (paths) => {
      for (const src of paths) {
        if (!src) continue;
        const img = await new Promise(res => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => res(null);
          i.src = src;
        });
        if (img) return img;
      }
      return null;
    };

    this.sprites.glyphs = await loadWithFallbackPaths(['assets/glyphs.png']);
    this.sprites.seeker = await loadWithFallbackPaths(['assets/seeker.png']);
    this.sprites.frame = await loadWithFallbackPaths(['assets/board_frame.png']);
    this.sprites.diorama = await loadWithFallbackPaths(['assets/diorama.png']);
    this.sprites.spider = await loadWithFallbackPaths(['assets/spider.png']);
    this.sprites.capsule = await loadWithFallbackPaths(['assets/capsule.png']);
  }

  setupInputs() {
    const getBoardCell = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = this.NATIVE_W / rect.width;
      const scaleY = this.NATIVE_H / rect.height;

      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      const clientX = touch ? touch.clientX : e.clientX;
      const clientY = touch ? touch.clientY : e.clientY;

      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;

      const col = Math.floor((px - this.boardX) / this.cellSize);
      const row = Math.floor((py - this.boardY) / this.cellSize);

      if (this.board.inBounds(col, row)) {
        return { c: col, r: row };
      }
      return null;
    };

    const onDown = (e) => {
      this.audio.resume();
      this.isPointerDown = true;

      const rect = this.canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const scaleX = this.NATIVE_W / rect.width;
        const scaleY = this.NATIVE_H / rect.height;
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
        const clientX = touch ? touch.clientX : e.clientX;
        const clientY = touch ? touch.clientY : e.clientY;
        const px = (clientX - rect.left) * scaleX;
        const py = (clientY - rect.top) * scaleY;

        if (this.isEndingCutscene) {
          this.handleEndingClick(px, py);
          return;
        }
        if (this.isLandingCutscene) {
          this.handleLandingClick(px, py);
          return;
        }
      }

      if (!this.canPlay()) return;
      this.canvas.focus();
      const cell = getBoardCell(e);
      if (cell) {
        this.dragStartCell = cell;
        this.board.handleTileSelect(cell.c, cell.r);
        this.updateChainBanner();
      }
    };

    const onMove = (e) => {
      if (!this.canPlay()) return;
      const cell = getBoardCell(e);
      this.board.hoverCell = cell;

      if (this.isPointerDown && this.dragStartCell && cell && !this.board.isResolving && !this.board.isSwapping) {
        const dc = cell.c - this.dragStartCell.c;
        const dr = cell.r - this.dragStartCell.r;
        if ((Math.abs(dc) === 1 && dr === 0) || (Math.abs(dr) === 1 && dc === 0)) {
          const s1 = this.dragStartCell;
          const s2 = cell;
          this.dragStartCell = null;
          this.board.selectedTile = null;
          this.board.executeSwap(s1.c, s1.r, s2.c, s2.r);
        }
      }
      this.updateChainBanner();
    };

    const onUp = () => {
      this.isPointerDown = false;
      this.dragStartCell = null;
      this.updateChainBanner();
    };

    this.canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
    window.addEventListener('touchmove', (e) => { onMove(e); }, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    window.addEventListener('blur', onUp);

    if (this.introCanvas) {
      const onIntroClick = (e) => {
        this.audio.init();
        this.audio.resume();
        const rect = this.introCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
        const clientX = touch ? touch.clientX : e.clientX;
        const clientY = touch ? touch.clientY : e.clientY;
        const px = (clientX - rect.left) * (this.NATIVE_W / rect.width);
        const py = (clientY - rect.top) * (this.NATIVE_H / rect.height);
        this.handleLandingClick(px, py);
      };
      this.introCanvas.addEventListener('mousedown', onIntroClick);
      this.introCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); onIntroClick(e); }, { passive: false });
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '')) return;
      if (document.activeElement === this.canvas && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        if (!this.canPlay()) return;
        const cell = this.keyboardCell;
        if (e.key === 'ArrowUp') cell.r = Math.max(0, cell.r - 1);
        if (e.key === 'ArrowDown') cell.r = Math.min(6, cell.r + 1);
        if (e.key === 'ArrowLeft') cell.c = Math.max(0, cell.c - 1);
        if (e.key === 'ArrowRight') cell.c = Math.min(6, cell.c + 1);
        this.board.hoverCell = { ...cell };
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.resume();
          this.board.handleTileSelect(cell.c, cell.r);
        }
        this.updateChainBanner();
        return;
      }
      if (e.key === 'Escape') {
        const openPanel = ['relics-modal', 'howto-modal', 'chambers-modal'].find(id => document.getElementById(id)?.style.display === 'flex');
        if (openPanel) { document.getElementById(openPanel).style.display = 'none'; return; }
        if (this.isEndingCutscene) {
          this.exitEndingCutscene();
          this.openChamberMap();
          return;
        }
        if (this.isLandingCutscene) {
          this.exitLandingCutscene();
          return;
        }
        const hm = document.getElementById('howto-modal');
        const cm = document.getElementById('chambers-modal');
        const rm = document.getElementById('relics-modal');
        if (hm) hm.style.display = 'none';
        if (cm) cm.style.display = 'none';
        if (rm) rm.style.display = 'none';
      } else if (e.key === 'r' || e.key === 'R') {
        const rm = document.getElementById('relics-modal');
        if (rm && rm.style.display === 'flex') {
          this.closeRelicsModal();
        } else {
          this.openRelicsModal();
        }
      } else if (e.key === '?' || e.key === '/' || e.key === 'i' || e.key === 'I') {
        const modal = document.getElementById('howto-modal');
        if (modal) modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
      } else if (e.key === 'm' || e.key === 'M') {
        const isMuted = this.audio.toggleMute();
        const btn = document.getElementById('btn-mute');
        if (btn) btn.textContent = isMuted ? 'UNMUTE [M]' : 'MUTE [M]';
      } else if (e.key === 'h' || e.key === 'H') {
        this.showHint();
      } else if (e.key === 'c' || e.key === 'C') {
        this.openChamberMap();
      } else if (e.key === '1') {
        this.useCreatureForm(25, () => this.board.triggerEchoHint());
      } else if (e.key === '2') {
        this.useCreatureForm(35, () => this.board.enableWebBridge());
      } else if (e.key === '3') {
        this.useCreatureForm(50, () => this.board.triggerAbyssalSiphon());
      } else if (e.key === '4') {
        this.useCreatureForm(60, () => this.board.triggerBuzzerResonance());
      }
    });
  }

  handleEndingClick(px, py) {
    this.audio.resume();
    // Skip button in top right during animation (px: 380..470, py: 10..42)
    if (this.endingTimer < 16.0 && px >= 380 && px <= 470 && py >= 10 && py <= 42) {
      this.endingTimer = 16.5;
      return;
    }
    // Buttons on Thanks for Playing card (when endingTimer >= 16.0)
    if (this.endingTimer >= 16.0 && py >= 450 && py <= 505) {
      if (px >= 30 && px <= 165) {
        // Replay Expedition
        this.exitEndingCutscene();
        this.startChamber(0);
      } else if (px >= 170 && px <= 308) {
        // Endless Mode
        this.exitEndingCutscene();
        this.startEndless();
      } else if (px >= 312 && px <= 450) {
        // Chamber Map
        this.exitEndingCutscene();
        this.openChamberMap();
      }
    }
  }

  handleLandingClick(px, py) {
    this.audio.resume();
    // Skip button in top right during animation (px: 380..470, py: 10..42)
    if (this.landingTimer < 10.5 && px >= 380 && px <= 470 && py >= 10 && py <= 42) {
      this.landingTimer = 11.0;
      return;
    }
    // Clicking anywhere on the canvas once landed enters the game
    if (this.landingTimer >= 10.0) {
      this.exitLandingCutscene(false);
      this.startChamber(0);
    }
  }

  updateMissionChecklist() {
    const listEl = document.getElementById('mission-checklist');
    const warmthFill = document.getElementById('warmth-fill');
    const warmthPct = document.getElementById('warmth-pct-label');
    const hudWarmth = document.getElementById('hud-warmth');

    const w = Math.round(this.board.warmth);
    if (warmthFill) {
      warmthFill.style.width = `${w}%`;
      warmthFill.classList.toggle('cold-danger', w < 35);
    }
    if (warmthPct) {
      warmthPct.textContent = w < 35 ? `${w}%  COLD!` : `${w}% `;
      warmthPct.style.color = w < 35 ? '#91CBDE' : '#E28C6B';
    }
    if (hudWarmth) {
      hudWarmth.textContent = w < 35 ? `${w}% ` : `${w}% `;
      hudWarmth.style.color = w < 35 ? '#91CBDE' : '#E28C6B';
    }

    if (!listEl) return;

    if (this.isEndless || !this.currentChamber) {
      listEl.innerHTML = `
        <span class="obj-pill"><span class="obj-check">∞</span> Endless Descent: -${this.depth}m</span>
      `;
      return;
    }

    const ch = this.currentChamber;
    const note = document.getElementById('field-note');
    if (note) note.textContent = ch.fieldNote || ch.subtitle;
    const obj = ch.objectives || {};
    const stats = this.board.sessionStats;

    const items = [];
    const depthDone = this.depth >= ch.targetDepth;
    items.push({
      done: depthDone,
      label: `-${this.depth} / ${ch.targetDepth} m`
    });

    if (obj.frost > 0) {
      const fDone = stats.frostCleared >= obj.frost;
      items.push({
        done: fDone,
        label: `Frost ${Math.min(stats.frostCleared, obj.frost)}/${obj.frost} `
      });
    }
    if (obj.spiders > 0) {
      const sDone = stats.spidersRepelled >= obj.spiders;
      items.push({
        done: sDone,
        label: `Spiders ${Math.min(stats.spidersRepelled, obj.spiders)}/${obj.spiders} `
      });
    }
    if (obj.obelisks > 0) {
      const oDone = stats.obelisksShattered >= obj.obelisks;
      items.push({
        done: oDone,
        label: `Stone ${Math.min(stats.obelisksShattered, obj.obelisks)}/${obj.obelisks} `
      });
    }

    listEl.innerHTML = items.map(it => `
      <span class="obj-pill ${it.done ? 'done' : ''}">
        <span class="obj-check">${it.done ? '✔' : '☐'}</span>
        <span>${it.label}</span>
      </span>
    `).join('');
  }

  updateChainBanner() {
    const freqEl = document.getElementById('freq-display');
    const badgeEl = document.getElementById('chain-preview-badge');
    if (!freqEl || !badgeEl) return;

    if (this.board.selectedTile) {
      const { c, r } = this.board.selectedTile;
      const t = this.board.getTile(c, r);
      const m = GLYPH_META[t] || GLYPH_META[0];
      const validNeighbors = this.board.getValidSwapNeighbors(c, r);

      if (t >= 6 && t <= 9) {
        freqEl.textContent = `Selected ${m.name} · Tap again to DETONATE or swap with a neighbor!`;
        freqEl.style.color = '#E8CD86';
        badgeEl.textContent = 'TAP OR SWAP ';
        badgeEl.style.color = '#E8CD86';
      } else if (validNeighbors.length > 0) {
        freqEl.textContent = `Selected ${m.name} (${m.hz}) · Click a green arrow (⇄) neighbor to match!`;
        freqEl.style.color = '#A5C77F';
        badgeEl.textContent = `${validNeighbors.length} VALID MOVE${validNeighbors.length > 1 ? 'S' : ''} ⇄`;
        badgeEl.style.color = '#A5C77F';
      } else {
        freqEl.textContent = `Selected ${m.name} (${m.hz}) · No 3-match from here — pick another tile!`;
        freqEl.style.color = '#E28C6B';
        badgeEl.textContent = 'NO MATCH HERE';
        badgeEl.style.color = '#E28C6B';
      }
      return;
    }

    if (this.board.hoverCell) {
      const { c, r } = this.board.hoverCell;
      const t = this.board.getTile(c, r);
      if (t === -2) {
        const hp = this.board.obeliskHp[r]?.[c] || 2;
        freqEl.textContent = `Ancient Bedrock Obelisk · HP: ${hp} (Match adjacent tiles or blast to shatter)`;
        freqEl.style.color = '#DFE6E6';
        badgeEl.textContent = 'OBSTACLE ';
        badgeEl.style.color = '#DFE6E6';
        return;
      }
      if (this.board.frost[r]?.[c]) {
        freqEl.textContent = `Frozen Rime Crust · Locked! Match adjacent tiles or use [2] Ember Torch to thaw`;
        freqEl.style.color = '#91CBDE';
        badgeEl.textContent = 'FROZEN ';
        badgeEl.style.color = '#91CBDE';
        return;
      }
      if (this.board.web[r]?.[c]) {
        freqEl.textContent = `Sticky Spider Web · Locked! Match adjacent tiles to cut web`;
        freqEl.style.color = '#DFE6E6';
        badgeEl.textContent = 'WEBBED ';
        badgeEl.style.color = '#DFE6E6';
        return;
      }
      if (t >= 6 && t <= 9) {
        const m = GLYPH_META[t];
        freqEl.textContent = `${m.name} (${m.role}) · Double-click to detonate or swap with any neighbor!`;
        freqEl.style.color = '#E8CD86';
        badgeEl.textContent = 'SPECIAL CORE ★';
        badgeEl.style.color = '#E8CD86';
        return;
      }
    }

    freqEl.textContent = 'Swap neighbors. Match three. Listen for the way down.';
    freqEl.style.color = '#F0F2E8';
    badgeEl.textContent = 'H · HINT';
    badgeEl.style.color = this.turnsRemaining <= 4 ? '#E84D3D' : '#ABE3D9';
  }

  handleMatch(info = {}) {
    const scoreGain = info.totalScoreGain !== undefined ? info.totalScoreGain : (info.length || 3) * 120;
    const depthGain = info.totalDepthGain !== undefined ? info.totalDepthGain : (info.length || 3) * 15;
    const combos = info.comboCount || 1;

    this.score += Math.round(scoreGain);
    this.chamberScore += Math.round(scoreGain);

    const bonus = this.equippedRelicsHas('lens') ? 1.5 : 1.0;
    this.attunementGauge = Math.min(100, this.attunementGauge + Math.min(18, combos * 6) * bonus);

    this.depth = this.isEndless ? this.depth + depthGain : Math.min(this.currentChamber.targetDepth, this.depth + depthGain);
    this.runStats.moves++;

    if (!this.isEndless) {
      this.turnsRemaining = Math.max(0, this.turnsRemaining - 1);
    }

    if (this.depth >= 750) this.seekerPack = 3;
    else if (this.depth >= 300) this.seekerPack = 2;
    else this.seekerPack = 1;

    this.isAttuning = true;
    this.attuningTimer = 0.85;

    this.updateHUD();
    this.updateMissionChecklist();
    this.updateChainBanner();

    if (!this.isEndless) {
      this.checkChamberEndConditions();
    }
  }

  equippedRelicsHas(id) {
    return this.board.equippedRelics.has(id);
  }

  checkChamberEndConditions() {
    if (this.chamberFinished || this.isEndless) return;
    const ch = this.currentChamber;
    if (!ch) return;
    const obj = ch.objectives;
    const stats = this.board.sessionStats;

    const depthMet = this.depth >= ch.targetDepth;
    const frostMet = stats.frostCleared >= (obj.frost || 0);
    const spidersMet = stats.spidersRepelled >= (obj.spiders || 0);
    const obelisksMet = stats.obelisksShattered >= (obj.obelisks || 0);

    const isAllClear = depthMet && frostMet && spidersMet && obelisksMet;

    if (isAllClear) {
      this.chamberFinished = true;
      let stars = 1;
      if (this.turnsRemaining >= 4) stars = 2;
      if (this.turnsRemaining >= 8) stars = 3;

      const idx = this.currentChamberIndex;
      this.campaignData.stars[idx] = Math.max(this.campaignData.stars[idx] || 0, stars);
      this.campaignData.highScores[idx] = Math.max(this.campaignData.highScores[idx] || 0, this.chamberScore);

      if (idx + 1 < this.chambers.length) {
        this.campaignData.unlocked[idx + 1] = true;
      }

      const relicIdMap = ['ammonite', 'vertebra', 'geode', 'lens', 'fork', 'crest'];
      const rId = relicIdMap[idx];
      if (rId && !this.campaignData.unlockedRelics.includes(rId)) {
        this.campaignData.unlockedRelics.push(rId);
      }

      this.saveCampaign();
      this.updateRelicsUI();
      this.audio.playGuardianChime();

      this.endTimer = setTimeout(() => {
        if (idx === this.chambers.length - 1) {
          this.startEndingCutscene();
        } else {
          this.showChamberVictory(stars);
        }
      }, 450);
      return;
    }

    if (this.turnsRemaining <= 0) {
      this.chamberFinished = true;
      this.endTimer = setTimeout(() => {
        this.showChamberFailed();
      }, 450);
    }
  }

  showChamberVictory(stars) {
    const modal = document.getElementById('chamber-victory-modal');
    if (!modal) return;

    const starsStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const titleEl = document.getElementById('vic-chamber-title');
    const starsEl = document.getElementById('vic-stars');
    const artifactEl = document.getElementById('vic-artifact-desc');
    const statsEl = document.getElementById('vic-stats');
    const cutsceneBtn = document.getElementById('btn-vic-cutscene');

    if (titleEl) titleEl.textContent = `${this.currentChamber.name} ATTUNED`;
    if (starsEl) starsEl.textContent = starsStr;
    if (artifactEl) artifactEl.textContent = `Unlocked Relic: "${this.currentChamber.artifact}"! Equip it in your Relic Loadout for passive survival perks.`;
    if (statsEl) statsEl.textContent = `Score: ${this.chamberScore.toLocaleString()} · Turns Left: ${this.turnsRemaining} · Warmth: ${this.board.warmth}% · ${this.runStats.hints} hints · ${this.runStats.powers} forms`;

    if (cutsceneBtn) {
      if (this.currentChamberIndex === this.chambers.length - 1) {
        cutsceneBtn.style.display = 'inline-block';
        cutsceneBtn.textContent = 'BLAST OFF CUTSCENE ';
      } else {
        cutsceneBtn.style.display = 'none';
      }
    }

    modal.style.display = 'flex';
  }

  showChamberFailed() {
    const modal = document.getElementById('chamber-failed-modal');
    if (!modal) return;

    const statsEl = document.getElementById('fail-stats');
    if (statsEl) {
      statsEl.textContent = `Target: -${this.currentChamber.targetDepth}m (Reached: -${this.depth}m) · Warmth: ${this.board.warmth}% · ${this.runStats.moves} moves · ${this.runStats.hints} hints · ${this.runStats.powers} forms`;
    }

    modal.style.display = 'flex';
  }

  openChamberMap() {
    if (this.board.isResolving || this.board.isSwapping) return;
    this.audio.resume();
    const modal = document.getElementById('chambers-modal');
    if (!modal) return;

    const listEl = document.getElementById('chambers-list');
    if (listEl) {
      listEl.innerHTML = '';
      this.chambers.forEach((ch, idx) => {
        const isUnlocked = this.campaignData.unlocked[idx] || idx === 0;
        const stars = this.campaignData.stars[idx] || 0;
        const bestScore = this.campaignData.highScores[idx] || 0;

        const card = document.createElement('div');
        card.className = `chamber-card ${isUnlocked ? 'unlocked' : 'locked'} ${idx === this.currentChamberIndex ? 'active' : ''}`;

        const starsStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        card.innerHTML = `
          <div class="chamber-card-header">
            <span class="chamber-card-title">${ch.name}</span>
            <span class="chamber-card-stars" style="color: ${stars > 0 ? '#E8CD86' : '#525B6C'};">${starsStr}</span>
          </div>
          <div class="chamber-card-sub">${ch.subtitle} · Target: -${ch.targetDepth}m</div>
          <div class="chamber-card-desc">${ch.description}</div>
          <div class="chamber-card-footer">
            <span class="chamber-card-score">${bestScore > 0 ? 'Best: ' + bestScore.toLocaleString() : 'Turn Limit: ' + ch.maxTurns}</span>
            <button class="hud-btn chamber-card-btn" ${!isUnlocked ? 'disabled' : ''}>
              ${idx === this.currentChamberIndex ? 'CURRENT' : (isUnlocked ? 'ENTER ➔' : 'LOCKED')}
            </button>
          </div>
        `;

        if (isUnlocked) {
          card.querySelector('.chamber-card-btn').addEventListener('click', () => {
            modal.style.display = 'none';
            this.startChamber(idx);
          });
        }
        listEl.appendChild(card);
      });
    }

    modal.style.display = 'flex';
  }

  toggleRelic(rId) {
    if (this.board.isResolving || this.board.isSwapping) return;
    const unlocked = this.campaignData.unlockedRelics || [];
    if (!unlocked.includes(rId)) return;

    const maxSlots = this.seekerPack >= 3 ? 3 : 2;
    if (this.board.equippedRelics.has(rId)) {
      this.board.equippedRelics.delete(rId);
      if (this.audio && this.audio.playSonarPing) this.audio.playSonarPing();
    } else {
      if (this.board.equippedRelics.size >= maxSlots) {
        const first = Array.from(this.board.equippedRelics)[0];
        this.board.equippedRelics.delete(first);
      }
      this.board.equippedRelics.add(rId);
      if (this.audio && this.audio.playGuardianChime) this.audio.playGuardianChime();
    }
    this.saveCampaign();
    this.updateRelicsUI();
  }

  openRelicsModal() {
    this.audio.resume();
    const hm = document.getElementById('howto-modal');
    const cm = document.getElementById('chambers-modal');
    if (hm) hm.style.display = 'none';
    if (cm) cm.style.display = 'none';

    const modal = document.getElementById('relics-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    this.updateRelicsUI();
  }

  closeRelicsModal() {
    const modal = document.getElementById('relics-modal');
    if (modal) modal.style.display = 'none';
  }

  updateRelicsUI() {
    const unlocked = this.campaignData.unlockedRelics || [];
    const maxSlots = this.seekerPack >= 3 ? 3 : 2;
    const equippedArr = Array.from(this.board.equippedRelics);

    // 1. Sidebar Counter Badge
    const elSpecCount = document.getElementById('specimen-count');
    if (elSpecCount) {
      elSpecCount.textContent = `${unlocked.length}/6 RELICS · ${equippedArr.length}/${maxSlots} EQUIPPED`;
    }

    // The full equipment editor lives in the codex; keep the field view quiet.
    const elSpecStatus = document.getElementById('specimen-status');
    if (elSpecStatus) {
      elSpecStatus.innerHTML = equippedArr.map(id => {
        const def = this.relicDefs.find(relic => relic.id === id);
        return def ? '<div class="equipped-discovery">' + def.icon + '<span>' + def.name + '</span></div>' : '';
      }).join('') || `<p class="empty-discovery">${unlocked.length ? 'Recovered relics await in the codex. Choose a loadout before your next move.' : 'Complete your first chamber to recover a relic.'}</p>`;
    }

    // 3. Modal Pack Status Callout
    const elPackStatus = document.getElementById('relic-modal-pack-status');
    if (elPackStatus) {
      elPackStatus.textContent = `BACKPACK LEVEL ${this.seekerPack} · ${equippedArr.length}/${maxSlots} RELIC SLOTS EQUIPPED`;
    }

    // 4. Modal Equipped Slots Summary Chips
    const elEquippedSummary = document.getElementById('relic-modal-equipped-summary');
    if (elEquippedSummary) {
      let slotsHtml = '';
      for (let i = 0; i < maxSlots; i++) {
        const rId = equippedArr[i];
        if (rId) {
          const def = this.relicDefs.find(r => r.id === rId) || { name: rId, icon: '', perkTitle: 'Active Perk' };
          slotsHtml += `
            <div class="relic-chip-equipped" data-relic="${rId}" title="Click to unequip">
              <span>${def.icon} Slot ${i + 1}: <strong>${def.name}</strong> (${def.perkTitle})</span>
              <span class="relic-chip-close">✕</span>
            </div>
          `;
        } else {
          slotsHtml += `
            <div class="relic-chip-empty">
              <span> Empty Slot ${i + 1}/${maxSlots}</span>
            </div>
          `;
        }
      }
      elEquippedSummary.innerHTML = slotsHtml;

      elEquippedSummary.querySelectorAll('.relic-chip-equipped').forEach(chip => {
        chip.addEventListener('click', () => {
          const rId = chip.dataset.relic;
          if (rId) this.toggleRelic(rId);
        });
      });
    }

    // 5. Modal Codex Grid
    const elGrid = document.getElementById('relics-codex-grid');
    if (elGrid) {
      elGrid.innerHTML = this.relicDefs.map((r, idx) => {
        const isUnlocked = unlocked.includes(r.id);
        const isEquipped = this.board.equippedRelics.has(r.id);
        return `
          <div class="relic-codex-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}">
            <div class="relic-card-header">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="relic-card-icon">${r.icon}</div>
                <div>
                  <div class="relic-card-title">${r.name}</div>
                  <div class="relic-card-origin" style="font-size: 9.5px; color: ${isUnlocked ? '#83B89F' : '#E88B8B'}; font-family: monospace;">
                    ${isUnlocked ? '✔ DISCOVERED: ' + r.chamber : ' LOCKED: ' + r.chamber}
                  </div>
                </div>
              </div>
              <span class="relic-tag tag-${(r.tag || 'relic').toLowerCase()}">${r.tag || 'RELIC'}</span>
            </div>

            <div class="relic-perk-box">
              <div class="relic-perk-title">★ PERK: ${r.perkTitle}</div>
              <div class="relic-perk-desc">${r.desc}</div>
            </div>

            <div class="relic-card-footer">
              ${isEquipped ? `
                <button class="relic-action-btn btn-equipped" data-relic="${r.id}">
                  ✔ EQUIPPED IN BACKPACK · CLICK TO REMOVE
                </button>
              ` : isUnlocked ? `
                <button class="relic-action-btn btn-equip" data-relic="${r.id}">
                  + EQUIP TO BACKPACK (${equippedArr.length}/${maxSlots})
                </button>
              ` : `
                <button class="relic-action-btn btn-locked" disabled>
                   CLEAR ${r.chamber.split('·')[0].trim().toUpperCase()} TO UNLOCK
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      elGrid.querySelectorAll('.relic-action-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
          const rId = btn.dataset.relic;
          if (rId) this.toggleRelic(rId);
        });
      });
    }
  }

  updateHUD() {
    const elDepth = document.getElementById('hud-depth');
    const elScore = document.getElementById('hud-score');
    const elTurns = document.getElementById('hud-turns');
    const elCharge = document.getElementById('hud-charge');
    const elPack = document.getElementById('hud-pack');
    const elChargePill = document.getElementById('charge-pill');
    const elBiome = document.getElementById('biome-tag');
    const elChamberName = document.getElementById('hud-chamber-name');

    if (elDepth) {
      const target = this.currentChamber ? ` / -${this.currentChamber.targetDepth}m` : ` / -${this.maxDepth}m`;
      elDepth.textContent = `-${this.depth}m${target}`;
    }
    if (elScore) elScore.textContent = this.score.toLocaleString();
    if (elTurns) {
      elTurns.textContent = this.isEndless ? '∞' : String(this.turnsRemaining);
      elTurns.style.color = (!this.isEndless && this.turnsRemaining <= 4) ? '#E84D3D' : '#E8CD86';
    }
    if (elCharge) elCharge.textContent = `${Math.round(this.attunementGauge)}%`;
    if (elPack) elPack.textContent = `Lv ${this.seekerPack}`;
    if (elChargePill) elChargePill.textContent = `${Math.round(this.attunementGauge)}% CHARGE`;

    const currentBiome = this.getCurrentBiome();
    if (elBiome) elBiome.textContent = currentBiome.name;
    if (elChamberName) {
      elChamberName.textContent = this.currentChamber ? this.currentChamber.subtitle : 'RESONANCE VAULT';
    }

    const forms = [
      { id: 'form-bat', cost: 25 },
      { id: 'form-spider', cost: 35 },
      { id: 'form-squid', cost: 50 },
      { id: 'form-buzzer', cost: 60 }
    ];
    forms.forEach(f => {
      const btn = document.getElementById(f.id);
      if (btn) btn.disabled = this.attunementGauge < f.cost;
    });
  }

  getCurrentBiome() {
    for (const b of this.biomes) {
      if (this.depth <= b.depthMax) return b;
    }
    return this.biomes[this.biomes.length - 1];
  }

  loop(timestamp) {
    requestAnimationFrame(this.loop.bind(this));

    const dt = Math.min(0.1, Math.max(0.001, (timestamp - this.lastFrameTime) / 1000));
    this.lastFrameTime = timestamp;
    if (!this.reducedMotion) this.animClock += dt;

    try {
      if (this.isEndingCutscene) {
        this.endingTimer = this.reducedMotion ? 17 : this.endingTimer + dt;
        this.renderEndingCutscene(this.ctx, this.reducedMotion ? 0 : dt);
        return;
      }
      if (this.isLandingCutscene) {
        this.landingTimer = this.reducedMotion ? 11 : this.landingTimer + dt;
        if (this.introCtx) {
          this.renderLandingCutscene(this.introCtx, this.reducedMotion ? 0 : dt);
        }
        this.renderLandingCutscene(this.ctx, this.reducedMotion ? 0 : dt);
        return;
      }
      this.update(dt);
      this.render();
    } catch (err) {
      console.error('Render loop error:', err);
    }
  }

  update(dt) {
    this.board.update(dt);
    this.formTimer = Math.max(0, this.formTimer - dt);
    const formState = document.getElementById('form-state');
    const formLabel = this.formTimer > 0 ? this.activeForm : 'Match tablets to build charge.';
    if (formState && formState.textContent !== formLabel) formState.textContent = formLabel;
    if (this.isAttuning) {
      this.attuningTimer -= dt;
      if (this.attuningTimer <= 0) {
        this.isAttuning = false;
      }
    }

    if (!this.reducedMotion) this.ambientMotes.forEach(m => {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < 12) m.y = 66;
      if (m.x < 20) m.x = 456;
      if (m.x > 456) m.x = 20;
    });
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const biome = this.getCurrentBiome();

    ctx.save();
    if (!this.reducedMotion && this.board.screenShake > 0.2) {
      const sx = Math.round((Math.random() - 0.5) * this.board.screenShake);
      const sy = Math.round((Math.random() - 0.5) * this.board.screenShake);
      ctx.translate(sx, sy);
    }

    // 1. Cavern Background
    ctx.fillStyle = biome.bg;
    ctx.fillRect(0, 0, this.NATIVE_W, this.NATIVE_H);

    const grad = ctx.createRadialGradient(
      this.NATIVE_W / 2, 48, 12,
      this.NATIVE_W / 2, 64, 260
    );
    grad.addColorStop(0, biome.glow);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.NATIVE_W, 120);

    // 2. Expedition Panorama (480x88)
    this.renderExpeditionPanorama(ctx, biome);

    // 3. Resonator Matrix Board
    this.renderBoard(ctx);

    // 4. FX Laser Beams, Rings & Lightning Arcs
    if (!this.reducedMotion) this.renderFXBeams(ctx);

    // 5. Particle Sparks & Floating Popups
    if (!this.reducedMotion) this.renderParticles(ctx);
    this.renderPopups(ctx);

    ctx.restore();
  }

  renderExpeditionPanorama(ctx, biome) {
    ctx.fillStyle = '#060A10';
    ctx.fillRect(16, 8, 448, 78);
    ctx.strokeStyle = '#263244';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 8, 448, 78);

    ctx.fillStyle = '#111C2D';
    const peaks = [30, 75, 130, 195, 260, 330, 390, 435];
    peaks.forEach((px, i) => {
      const h = 14 + (i % 3) * 8;
      ctx.beginPath();
      ctx.moveTo(px - 14, 9);
      ctx.lineTo(px, 9 + h);
      ctx.lineTo(px + 14, 9);
      ctx.fill();
    });

    // Floating ambient ice/spore motes in cavern
    this.ambientMotes.forEach(m => {
      const alpha = 0.3 + 0.3 * Math.sin(this.animClock * 3 + m.phase);
      ctx.fillStyle = biome.accent;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.floor(m.x), Math.floor(m.y), m.size * 2, m.size * 2);
    });
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = '#151E2B';
    ctx.fillRect(17, 68, 446, 17);
    ctx.fillStyle = biome.accent;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(17, 68, 446, 2);
    ctx.globalAlpha = 1.0;

    const anim12 = Math.floor(this.animClock * 12) % 4;

    if (this.sprites.diorama) {
      ctx.drawImage(this.sprites.diorama, 128, 12, 38, 51, 28, 18, 38, 51);
      ctx.drawImage(this.sprites.diorama, 166, 36, 30, 26, 196, 44, 30, 26);
      ctx.drawImage(this.sprites.diorama, anim12 * 32 + 4, 24, 24, 38, 326, 31, 24, 38);
      ctx.drawImage(this.sprites.diorama, 196, 26, 59, 35, 386, 34, 59, 35);
    }

    let progress = 0;
    if (this.currentChamber && !this.isEndless) {
      const span = this.currentChamber.targetDepth - this.currentChamber.startDepth;
      const curr = this.depth - this.currentChamber.startDepth;
      progress = span > 0 ? Math.min(1, Math.max(0, curr / span)) : 0;
    } else {
      progress = Math.min(1, this.depth / this.maxDepth);
    }

    const seekerX = Math.floor(76 + progress * 265);
    const seekerBob = Math.round(Math.sin(this.animClock * 6) * 1.5);
    const seekerY = 16 + seekerBob;

    let spriteIndex = 0;
    if (this.isAttuning || this.formTimer > 0) {
      spriteIndex = 12 + anim12;
    } else {
      const packBase = (this.seekerPack - 1) * 4;
      spriteIndex = packBase + anim12;
    }

    if (this.sprites.seeker) {
      ctx.drawImage(
        this.sprites.seeker,
        spriteIndex * 32, 0, 32, 32,
        seekerX, seekerY, 64, 64
      );
    } else {
      ctx.fillStyle = '#DFE6E6';
      ctx.fillRect(seekerX + 24, seekerY + 18, 16, 34);
      ctx.fillStyle = '#ABE3D9';
      ctx.fillRect(seekerX + 28, seekerY + 22, 8, 6);
    }

    // Depth progress bar
    const barX = 24;
    const barY = 78;
    const barW = 432;
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = biome.accent;
    ctx.fillRect(barX, barY, Math.floor(barW * progress), 4);
  }

  drawFallbackGlyph(ctx, tile, drawX, drawY) {
    const m = GLYPH_META[tile] || GLYPH_META[0];
    ctx.fillStyle = '#141B29';
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1;
    ctx.fillRect(drawX + 6, drawY + 6, 52, 52);
    ctx.strokeRect(drawX + 6, drawY + 6, 52, 52);

    ctx.fillStyle = m.color;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbols = ['•', '••', '•••', '••••', '•••••', '◆', '✚', '✕', '◎', '❖'];
    ctx.fillText(symbols[tile] || '•', drawX + 32, drawY + 32);
  }

  renderBoard(ctx) {
    const pulseFrame = Math.floor(this.animClock * 2.5) % 2;
    const sel = this.board.selectedTile;
    const validSwapMoves = sel ? this.board.getValidSwapNeighbors(sel.c, sel.r) : [];

    // First pass: Draw all board wells and static obstacles
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const x = this.boardX + c * this.cellSize;
        const y = this.boardY + r * this.cellSize;

        const isSelected = sel && sel.c === c && sel.r === r;
        const isNeighbor = sel && this.board.isAdjacent(sel.c, sel.r, c, r);

        if (this.sprites.frame) {
          let wellIndex = 0;
          if (isSelected) wellIndex = 2;
          else if (isNeighbor) wellIndex = 1;

          ctx.drawImage(
            this.sprites.frame,
            wellIndex * 32, 0, 32, 32,
            x, y, 64, 64
          );
        } else {
          ctx.fillStyle = isSelected ? '#1E2D44' : '#0B0D13';
          ctx.strokeStyle = '#253042';
          ctx.lineWidth = 1;
          ctx.fillRect(x + 2, y + 2, 60, 60);
          ctx.strokeRect(x + 2, y + 2, 60, 60);
        }

        const tile = this.board.getTile(c, r);

        // Draw Bedrock Obelisk (tile === -2)
        if (tile === -2) {
          const hp = this.board.obeliskHp[r]?.[c] || 2;
          const obeliskCol = hp > 1 ? 2 : 3;

          if (this.sprites.frame) {
            ctx.drawImage(
              this.sprites.frame,
              obeliskCol * 32, 32, 32, 32,
              x, y, 64, 64
            );
          } else {
            ctx.fillStyle = '#3A4659';
            ctx.fillRect(x + 8, y + 8, 48, 48);
          }

          ctx.fillStyle = 'rgba(8, 12, 18, 0.9)';
          ctx.strokeStyle = '#627690';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x + 52, y + 52, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#DFE6E6';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(hp), x + 52, y + 52.5);
        }
      }
    }

    // Second pass: Draw animated tablets, cores, frost, and webs clipped to board
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.boardX, this.boardY, this.board.cols * this.cellSize, this.board.rows * this.cellSize);
    ctx.clip();

    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const tile = this.board.getTile(c, r);
        if (tile === null || tile < 0) continue;

        const baseX = this.boardX + c * this.cellSize;
        const baseY = this.boardY + r * this.cellSize;

        const swapOff = this.board.swapOffsets[r]?.[c] || { x: 0, y: 0 };
        const dropY = Math.round(this.board.yOffsets[r]?.[c] || 0);
        const idleFloat = (!this.reducedMotion && dropY === 0 && !this.board.frost[r]?.[c] && !this.board.web[r]?.[c])
          ? Math.round(Math.sin(this.animClock * 3.2 + r * 0.8 + c * 0.6) * 1.5)
          : 0;

        const scale = this.board.scaleAnims[r]?.[c] || 1;
        const flash = this.board.flashAnims[r]?.[c] || 0;

        const drawX = Math.round(baseX + swapOff.x);
        const drawY = Math.round(baseY + swapOff.y - dropY + idleFloat);

        const isSelected = sel && sel.c === c && sel.r === r;
        const isHovered = this.board.hoverCell && this.board.hoverCell.c === c && this.board.hoverCell.r === r;
        const f = (isSelected || isHovered || flash > 0) ? 1 : pulseFrame;

        ctx.save();
        if (!this.reducedMotion && (scale !== 1 || isSelected)) {
          const sVal = isSelected ? Math.max(scale, 1.08 + 0.04 * Math.sin(this.animClock * 8)) : scale;
          const cx = drawX + 32;
          const cy = drawY + 32;
          ctx.translate(cx, cy);
          ctx.scale(sVal, sVal);
          ctx.translate(-cx, -cy);
        }

        // Draw Rich Mineral Vein background aura
        if (this.board.veins[r]?.[c] && this.sprites.frame) {
          ctx.drawImage(
            this.sprites.frame,
            32, 32, 32, 32,
            drawX, drawY, 64, 64
          );
        }

        // Draw glyph or Creature Core
        if (this.sprites.glyphs) {
          ctx.drawImage(
            this.sprites.glyphs,
            tile * 32, f * 32, 32, 32,
            drawX, drawY, 64, 64
          );
        } else {
          this.drawFallbackGlyph(ctx, tile, drawX, drawY);
        }

        // Pulsing halo for Special Creature Cores (tiles 6..9)
        if (tile >= 6 && tile <= 9) {
          const haloAlpha = 0.45 + 0.35 * Math.sin(this.animClock * 7);
          ctx.strokeStyle = GLYPH_META[tile]?.color || '#E8CD86';
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = haloAlpha;
          ctx.strokeRect(drawX + 4, drawY + 4, 56, 56);
          ctx.globalAlpha = 1.0;
        }

        // Match flash white/gold pop overlay before clearing
        if (flash > 0) {
          ctx.fillStyle = '#FFFFFF';
          ctx.globalAlpha = Math.min(0.85, flash * 0.9);
          ctx.fillRect(drawX + 6, drawY + 6, 52, 52);
          ctx.globalAlpha = 1.0;
        }

        // Draw Upgraded Glacial Frost Overlay
        if (this.board.frost[r]?.[c]) {
          if (this.sprites.frame && this.sprites.frame.height >= 128) {
            ctx.drawImage(this.sprites.frame, 32, 96, 32, 32, drawX, drawY, 64, 64);
          } else if (this.sprites.frame) {
            ctx.drawImage(this.sprites.frame, 0, 32, 32, 32, drawX, drawY, 64, 64);
          } else {
            ctx.fillStyle = 'rgba(145, 203, 222, 0.30)';
            ctx.fillRect(drawX + 4, drawY + 4, 56, 56);
          }
        }

        // Draw Upgraded Sticky Spider Web Overlay
        if (this.board.web[r]?.[c]) {
          if (this.sprites.frame && this.sprites.frame.height >= 128) {
            ctx.drawImage(this.sprites.frame, 0, 96, 32, 32, drawX, drawY, 64, 64);
          } else {
            ctx.strokeStyle = 'rgba(223, 230, 230, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(drawX + 8, drawY + 8); ctx.lineTo(drawX + 56, drawY + 56);
            ctx.moveTo(drawX + 56, drawY + 8); ctx.lineTo(drawX + 8, drawY + 56);
            ctx.moveTo(drawX + 32, drawY + 6); ctx.lineTo(drawX + 32, drawY + 58);
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }
    ctx.restore();

    // Third pass: Selection frame, Valid Swap Neighbor indicators (⇄), and Idle Coach Move
    if (sel) {
      const sx = this.boardX + sel.c * this.cellSize;
      const sy = this.boardY + sel.r * this.cellSize;
      ctx.save();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx + 2, sy + 2, 60, 60);

      const selTile = this.board.getTile(sel.c, sel.r);
      if (selTile >= 6 && selTile <= 9) {
        ctx.fillStyle = 'rgba(4, 6, 10, 0.92)';
        ctx.strokeStyle = '#E8CD86';
        ctx.lineWidth = 1;
        ctx.fillRect(sx + 4, sy + 46, 56, 14);
        ctx.strokeRect(sx + 4, sy + 46, 56, 14);
        ctx.fillStyle = '#E8CD86';
        ctx.font = 'bold 8.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TAP=BLAST', sx + 32, sy + 55.5);
      }
      ctx.restore();

      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      for (const [dc, dr] of dirs) {
        const nc = sel.c + dc;
        const nr = sel.r + dr;
        if (!this.board.inBounds(nc, nr)) continue;

        const nx = this.boardX + nc * this.cellSize;
        const ny = this.boardY + nr * this.cellSize;
        const isValidMatchMove = validSwapMoves.some(m => m.c === nc && m.r === nr);

        ctx.save();
        if (isValidMatchMove) {
          ctx.strokeStyle = '#A5C77F';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(nx + 3, ny + 3, 58, 58);

          const midX = (sx + nx) / 2 + 32;
          const midY = (sy + ny) / 2 + 32;
          ctx.fillStyle = '#142416';
          ctx.strokeStyle = '#A5C77F';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(midX, midY, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#C2E29C';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dc !== 0 ? '⇄' : '⇅', midX, midY + 0.5);
        } else {
          ctx.strokeStyle = 'rgba(145, 203, 222, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(nx + 4, ny + 4, 56, 56);
        }
        ctx.restore();
      }
    } else if (this.board.coachMove && !this.board.isResolving && !this.board.isSwapping) {
      const cm = this.board.coachMove;
      const pulse = 0.45 + 0.45 * Math.sin(this.animClock * 5.5);
      const x1 = this.boardX + cm.c1 * this.cellSize;
      const y1 = this.boardY + cm.r1 * this.cellSize;
      const x2 = this.boardX + cm.c2 * this.cellSize;
      const y2 = this.boardY + cm.r2 * this.cellSize;

      ctx.save();
      ctx.strokeStyle = `rgba(232, 205, 134, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x1 + 3, y1 + 3, 58, 58);
      ctx.strokeRect(x2 + 3, y2 + 3, 58, 58);

      const midX = (x1 + x2) / 2 + 32;
      const midY = (y1 + y2) / 2 + 32;
      ctx.fillStyle = 'rgba(18, 24, 36, 0.92)';
      ctx.strokeStyle = '#E8CD86';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(midX, midY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#E8CD86';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cm.c1 !== cm.c2 ? '⇄' : '⇅', midX, midY + 0.5);
      ctx.restore();
    }

    // Fourth pass: Draw active Cave Spiders crawling on board using the new animated sprite!
    this.board.spiders.forEach(s => {
      const sx = this.boardX + s.c * this.cellSize;
      const sy = this.boardY + s.r * this.cellSize;
      const spiderFrame = Math.floor(this.animClock * 12 + s.c * 2) % 4;

      ctx.save();
      // Drop shadow
      ctx.fillStyle = 'rgba(6, 8, 12, 0.6)';
      ctx.beginPath();
      ctx.ellipse(sx + 32, sy + 44, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      if (this.sprites.frame && this.sprites.frame.height >= 128) {
        // Draw 32x32 animated spider frame from row 2 scaled to 64x64
        ctx.drawImage(
          this.sprites.frame,
          spiderFrame * 32, 64, 32, 32,
          sx, sy, 64, 64
        );
      } else if (this.sprites.spider) {
        ctx.drawImage(
          this.sprites.spider,
          spiderFrame * 19, 0, 19, 13,
          sx + 13, sy + 19, 38, 26
        );
      } else {
        ctx.fillStyle = '#162232';
        ctx.beginPath();
        ctx.arc(sx + 32, sy + 32, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hit-flash effect
      if (s.hitFlash > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = Math.min(0.85, s.hitFlash);
        ctx.beginPath();
        ctx.arc(sx + 32, sy + 32, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Glowing venom eyes
      ctx.fillStyle = '#E84D3D';
      ctx.fillRect(sx + 27, sy + 25, 4, 3);
      ctx.fillRect(sx + 33, sy + 25, 4, 3);

      // HP badge
      ctx.fillStyle = 'rgba(4, 6, 10, 0.9)';
      ctx.strokeStyle = '#3A485A';
      ctx.lineWidth = 1;
      ctx.fillRect(sx + 17, sy + 48, 30, 13);
      ctx.strokeRect(sx + 17, sy + 48, 30, 13);
      ctx.fillStyle = '#E8CD86';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`HP:${s.hp}`, sx + 32, sy + 58);

      ctx.restore();
    });
  }

  renderFXBeams(ctx) {
    if (!this.board.fxBeams || this.board.fxBeams.length === 0) return;

    ctx.save();
    this.board.fxBeams.forEach(b => {
      const alpha = Math.max(0, b.life / b.maxLife);
      ctx.globalAlpha = alpha;

      if (b.type === 'row') {
        const y = this.boardY + b.r * this.cellSize + 32;
        const h = 18 * alpha;
        ctx.fillStyle = b.color;
        ctx.fillRect(this.boardX, y - h / 2, this.board.cols * this.cellSize, h);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(this.boardX, y - h / 4, this.board.cols * this.cellSize, h / 2);
      } else if (b.type === 'col') {
        const x = this.boardX + b.c * this.cellSize + 32;
        const w = 18 * alpha;
        ctx.fillStyle = b.color;
        ctx.fillRect(x - w / 2, this.boardY, w, this.board.rows * this.cellSize);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - w / 4, this.boardY, w / 2, this.board.rows * this.cellSize);
      } else if (b.type === 'ring') {
        const cx = this.boardX + b.c * this.cellSize + 32;
        const cy = this.boardY + b.r * this.cellSize + 32;
        const progress = 1 - alpha;
        const rad = 16 + progress * (b.maxR || b.maxRadius || 110);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 6 * alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.type === 'arc') {
        const x1 = this.boardX + b.c1 * this.cellSize + 32;
        const y1 = this.boardY + b.r1 * this.cellSize + 32;
        const x2 = this.boardX + b.c2 * this.cellSize + 32;
        const y2 = this.boardY + b.r2 * this.cellSize + 32;
        const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 18;
        const my = (y1 + y2) / 2 + (Math.random() - 0.5) * 18;

        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3.5 * alpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(mx, my);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 * alpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(mx, my);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  renderParticles(ctx) {
    this.board.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(
        Math.floor(this.boardX + p.x * 2),
        Math.floor(this.boardY + p.y * 2),
        p.size * 2,
        p.size * 2
      );
    });
    ctx.globalAlpha = 1.0;
  }

  renderPopups(ctx) {
    if (!this.board.popups || this.board.popups.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';

    this.board.popups.forEach(pop => {
      const px = Math.min(this.NATIVE_W - 68, Math.max(68, this.boardX + pop.x * 2));
      const py = Math.max(108, this.boardY + pop.y * 2);

      ctx.globalAlpha = Math.min(1, pop.life * 1.4);

      ctx.fillStyle = 'rgba(4, 6, 10, 0.9)';
      ctx.strokeStyle = pop.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(px - 62, py - 18, 124, pop.sub ? 32 : 20);
      ctx.strokeRect(px - 62, py - 18, 124, pop.sub ? 32 : 20);

      ctx.fillStyle = pop.color;
      ctx.font = 'bold 11.5px monospace';
      ctx.fillText(pop.text, px, py - 5);

      if (pop.sub) {
        ctx.fillStyle = '#DFE6E6';
        ctx.font = '9.5px monospace';
        ctx.fillText(pop.sub, px, py + 8);
      }
    });

    ctx.restore();
  }

  renderEndingCutscene(ctx) {
    this.cinema.render(ctx, { kind: 'ending', time: this.endingTimer, sprites: this.sprites,
      reducedMotion: this.reducedMotion, score: this.score, campaign: this.campaignData });
  }

  renderLandingCutscene(ctx) {
    this.cinema.render(ctx, { kind: 'landing', time: this.landingTimer, sprites: this.sprites,
      reducedMotion: this.reducedMotion });
  }

}

function bootSeekerGame() {
  if (!window.SEEKER_GAME) {
    window.SEEKER_GAME = new ResonanceGame();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootSeekerGame);
} else {
  bootSeekerGame();
}
