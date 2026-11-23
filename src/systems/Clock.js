// Time of day (numbers in src/data/clock.js). Runs on game time while you play,
// and is saved with your progress. Emits 'night-start' and 'night-end' on the
// scene when quiet hours begin and end (not when a save loads mid-night).

import { CLOCK, MINUTES_PER_DAY } from '../data/clock.js';

const GAME_MINUTES_PER_SECOND = MINUTES_PER_DAY / CLOCK.dayLengthSeconds;

export class Clock {
  constructor(scene) {
    this.scene = scene;
    this.day = 1;
    this.minutes = CLOCK.startHour * 60; // minutes since midnight
    this.wasNight = this.night;
  }

  update(dt) {
    this.advance(dt * GAME_MINUTES_PER_SECOND);
  }

  /** Moves the clock forward by game minutes (also used by the debug key). */
  advance(gameMinutes) {
    this.minutes += gameMinutes;
    while (this.minutes >= MINUTES_PER_DAY) {
      this.minutes -= MINUTES_PER_DAY;
      this.day += 1;
    }
    const night = this.night;
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.scene.events.emit(night ? 'night-start' : 'night-end');
    }
  }

  get hour() {
    return this.minutes / 60;
  }

  /** Quiet hours: 10 PM to 6 AM. */
  get night() {
    const h = this.hour;
    return h >= CLOCK.nightStart || h < CLOCK.nightEnd;
  }

  /** 0 in daylight, 1 at night, fading during dusk and dawn. */
  get darkness() {
    const h = this.hour;
    const { nightStart, nightEnd, fadeHours } = CLOCK;
    if (this.night) return 1;
    if (h >= nightStart - fadeHours) return (h - (nightStart - fadeHours)) / fadeHours; // dusk
    if (h < nightEnd + fadeHours) return 1 - (h - nightEnd) / fadeHours; // dawn
    return 0;
  }

  /** "9:40 PM" (in 10-minute steps, so it doesn't flicker). */
  get label() {
    const total = Math.floor(this.minutes / 10) * 10;
    const h24 = Math.floor(total / 60);
    const m = total % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  restore({ day, minutes }) {
    this.day = day;
    this.minutes = minutes;
    this.wasNight = this.night;
  }

  get saveState() {
    return { day: this.day, minutes: Math.round(this.minutes * 10) / 10 };
  }
}
