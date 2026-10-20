// SPDX-License-Identifier: MIT OR Apache-2.0
// Small, original Web Audio effects. Tuning follows The Seeker's public Codex.
// No samples, libraries, worklets, background playback, or external services.
class VaultAudio {
  constructor() {
    this.context = null;
    this.output = null;
    this.muted = false;
    this.voices = 0;
  }

  init() { this.resume(); }

  resume() {
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.output = this.context.createGain();
        this.output.gain.value = this.muted ? 0 : 0.12;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch (_) {
      // Sound is optional; denied audio must never prevent play.
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.resume();
    if (this.output) this.output.gain.setTargetAtTime(this.muted ? 0 : 0.12, this.context.currentTime, 0.02);
    return this.muted;
  }

  tone(frequency, duration = 0.14, delay = 0) {
    if (!this.context || !this.output || this.muted || this.context.state !== 'running' || this.voices >= 12) return;
    const time = this.context.currentTime + delay;
    const voice = this.context.createOscillator();
    const envelope = this.context.createGain();
    voice.type = 'sine';
    voice.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.3, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    voice.connect(envelope);
    envelope.connect(this.output);
    this.voices++;
    voice.onended = () => {
      voice.disconnect();
      envelope.disconnect();
      this.voices--;
    };
    voice.start(time);
    voice.stop(time + duration + 0.02);
  }

  playGlyphTone(index, octave = 0) {
    this.tone([48, 54, 57, 63, 72, 84][Math.max(0, Math.min(5, index))] * 4 * (octave ? 2 : 1));
  }
  playMatchChord(length, index) {
    this.playGlyphTone(index);
    this.tone(288, 0.22, 0.06);
    if (length >= 4) this.tone(384, 0.26, 0.12);
  }
  playSonarPing() { this.tone(384, 0.24); }
  playFractureShatter() { this.tone(432, 0.08); this.tone(216, 0.13, 0.05); }
  playVoidPulse() { this.tone(96, 0.4); this.tone(144, 0.3, 0.08); }
  playGuardianChime() { [192, 288, 336, 384].forEach((hz, i) => this.tone(hz, 0.32, i * 0.1)); }
  playRocketLaunch() { [96, 192, 384].forEach((hz, i) => this.tone(hz, 0.3, i * 0.13)); }
  playRocketLanding() { [384, 192, 96].forEach((hz, i) => this.tone(hz, 0.3, i * 0.13)); }
}
