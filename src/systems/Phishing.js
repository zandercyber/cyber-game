// Phishing attacks (numbers and the email bank in src/data/phishing.js).
// Every few minutes an email lands on one of your PCs (laptops, workstation):
// an envelope over the machine, a countdown, a HUD chip. Walk up to read it and
// pick a response on the email card:
//   phishing, best response   -> stopped, nothing lost
//   phishing, anything else   -> the attacker steals some of your stashed cash
//   real email, best response -> it pays (a bounty payout, a refund...)
//   real email, anything else -> you miss the money
// Nobody reads it in time: someone clicks it (phishing steals cash; a real one expires).
// The countdown pauses while the machine is off, unpowered or broken. Agents never read email.
// Security tools (src/data/security.js) help: the email filter stops some phishing before it
// lands, MFA cuts what a phish steals, and training gives you more time.

import { PHISHING, EMAILS, nextEmailIn } from '../data/phishing.js';
import { SECURITY_UPGRADES, noSecurityLevels } from '../data/security.js';
import { gameState } from '../state/GameState.js';

const ICON = 'icon-mail';

export class Phishing {
  constructor(scene) {
    this.scene = scene;
    this.nextIn = PHISHING.firstAfter; // counts down only while you own a PC
    this.station = null; // the machine with the email waiting
    this.email = null; // index into EMAILS
    this.left = 0; // seconds before someone clicks it
    this.open = false; // its card is on screen
    this.card = null;
    this.seen = []; // emails shown already (no repeats until you've seen them all)
    this.filtered = 0; // phishing emails your filter stopped (shown in the shop)
    this.saved = 0; // cash MFA kept from attackers

    if (!scene.textures.exists(ICON)) makeIcon(scene);
    this.icon = scene.add.image(0, 0, ICON).setDepth(12550).setVisible(false);
  }

  get levels() {
    return this.scene.securityLevels ?? noSecurityLevels();
  }

  /** Time to walk up to a new email (longer with training). */
  get reachSeconds() {
    return PHISHING.reachSeconds + SECURITY_UPGRADES.training.reach * this.levels.training;
  }

  /** Time to answer once it's open (longer with training). */
  get answerSeconds() {
    return PHISHING.answerSeconds + SECURITY_UPGRADES.training.answer * this.levels.training;
  }

  /** PCs that can get email. */
  get targets() {
    return this.scene.stations.filter((st) => st.plotId && st.hustle.updates);
  }

  /** at: the machine you're standing still at (or null). */
  update(dt, { at }) {
    const s = this.scene;
    if (!this.station) {
      if (!gameState.shopUnlocked || gameState.tripped || s.neighbor.quiet) return;
      const ready = this.targets.filter((st) => st.hustle.powered && !st.hustle.switchedOff && !st.hustle.broken);
      if (!ready.length) return;
      this.nextIn -= dt;
      if (this.nextIn <= 0) this.arrive(ready[Math.floor(Math.random() * ready.length)]);
      return;
    }
    if (this.open) return; // the card has its own timer
    if (!s.stations.includes(this.station)) { // the machine was dug up: its email goes with it
      this.clear();
      return;
    }
    const h = this.station.hustle;
    if (h.powered && !h.switchedOff && !h.broken) this.left -= dt;
    h.mail = { left: Math.max(0, this.left) };
    this.placeIcon();
    if (this.left <= 0) this.expire();
    else if (at === this.station && !s.question) this.openCard();
  }

  /** The next email is due: the filter may stop it (phishing only); otherwise it lands on the machine. */
  arrive(station) {
    const index = this.pick();
    const e = EMAILS[index];
    if (e.phish && Math.random() < SECURITY_UPGRADES.filter.catches[this.levels.filter]) {
      this.filtered += 1;
      this.nextIn = nextEmailIn();
      this.scene.events.emit('phish-filtered', { subject: e.subject, from: e.from });
      return;
    }
    this.start(station, index);
  }

  /** An email lands on a machine now (no filter: debug key E and tests use this). quiet: no banner (loading a save). */
  start(station, index = this.pick(), { left = this.reachSeconds, quiet = false } = {}) {
    this.station = station;
    this.email = index;
    this.left = left;
    this.open = false;
    station.hustle.mail = { left };
    this.placeIcon();
    if (!quiet) this.scene.events.emit('phish-arrived', station);
  }

  /** A random email you haven't seen yet (starts over once you've seen them all). */
  pick() {
    if (this.seen.length >= EMAILS.length) this.seen = [];
    const unseen = EMAILS.map((_, i) => i).filter((i) => !this.seen.includes(i));
    const index = unseen[Math.floor(Math.random() * unseen.length)];
    this.seen.push(index);
    return index;
  }

  get machineName() {
    const plot = this.scene.plots.find((p) => p.id === this.station?.plotId);
    return this.scene.itemName(plot?.itemId) ?? 'PC';
  }

  openCard() {
    const e = EMAILS[this.email];
    const order = e.choices.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.open = true;
    this.station.hustle.mail = { reading: true };
    this.card = {
      title: `New email · ${this.machineName}`,
      rule: 'Phishing steals cash. Real emails can pay. Pick the best response.',
      seconds: this.answerSeconds,
      width: 820,
      email: { from: e.from, replyTo: e.replyTo, subject: e.subject, body: e.body, link: e.link, attach: e.attach },
      q: 'What do you do?',
      choices: order.map((i) => e.choices[i]),
      correct: order.indexOf(0), // the first choice in the bank is the best one
      why: e.why,
    };
    this.scene.events.emit('phish-open', this.card);
  }

  /** Your pick on the email card (index into the shown choices), or null when time ran out. */
  answer(pick) {
    if (!this.open) return null;
    const e = EMAILS[this.email];
    const correct = pick === this.card.correct;
    let text;
    if (e.phish) {
      if (correct) text = 'Phishing stopped! Nothing stolen';
      else {
        const { taken, blocked } = this.steal();
        const lead = pick === null ? 'Too slow: phished!' : 'Phished!';
        text = taken > 0 ? `${lead} The attacker took $${taken}` : `${lead} Lucky your stash was empty`;
        if (blocked > 0) text += ` (MFA stopped $${blocked})`;
      }
    } else if (correct) {
      const amount = this.reward();
      gameState.addCash(amount);
      text = `It was real! ${e.pays}: +$${amount}`;
    } else {
      text = pick === null ? `Too slow: that was a real ${e.pays.toLowerCase()}` : `That one was real: you missed a ${e.pays.toLowerCase()}`;
    }
    this.clear();
    return { correct, text };
  }

  /** Nobody read it in time: phishing gets clicked, a real email expires. */
  expire() {
    const e = EMAILS[this.email];
    const name = this.machineName;
    const agent = this.scene.agents.find((a) => a.workingStation === this.station);
    if (e.phish) this.scene.events.emit('phish-clicked', { name, who: agent?.name ?? null, ...this.steal() });
    else this.scene.events.emit('phish-expired', { name, pays: e.pays, amount: this.reward() });
    this.clear();
  }

  /** The attacker goes for a share of your stashed cash; MFA blocks part of it. Returns { taken, blocked }. */
  steal() {
    const want = Math.min(gameState.cash, Math.max(PHISHING.stealMin, Math.round(gameState.cash * PHISHING.stealShare)));
    const blocked = Math.round(want * SECURITY_UPGRADES.mfa.cuts[this.levels.mfa]);
    this.saved += blocked;
    return { taken: gameState.charge(want - blocked), blocked };
  }

  /** What a real email pays: about 20 s of your best machine's pay. */
  reward() {
    const best = Math.max(0, ...this.scene.stations.filter((st) => st.plotId).map((st) => st.hustle.payRate));
    return Math.max(PHISHING.rewardMin, Math.round(best * PHISHING.rewardSeconds));
  }

  clear() {
    if (this.station) this.station.hustle.mail = null;
    this.station = null;
    this.email = null;
    this.open = false;
    this.card = null;
    this.icon.setVisible(false);
    this.nextIn = nextEmailIn();
  }

  // The envelope bobs above the machine's status panel.
  placeIcon() {
    const panel = this.station?.hustle.panel;
    if (!panel) return;
    const bob = Math.sin(this.scene.time.now / 220) * 4;
    this.icon.setPosition(panel.x, panel.y - 66 + bob).setVisible(true);
  }

  get saveState() {
    return {
      nextIn: Math.round(this.nextIn),
      plotId: this.station?.plotId ?? null,
      email: this.email,
      left: Math.ceil(this.left),
      seen: [...this.seen],
      filtered: this.filtered,
      saved: this.saved,
    };
  }

  /** state: checked by readSave. An email that was waiting (or open) comes back with some time on it. */
  restore(state) {
    if (!state) return;
    this.seen = [...state.seen];
    this.nextIn = state.nextIn;
    this.filtered = state.filtered;
    this.saved = state.saved;
    const station = this.targets.find((st) => st.plotId === state.plotId);
    if (station && state.email !== null) {
      this.start(station, state.email, { left: Math.max(state.left, 15), quiet: true });
    }
  }
}

// A small envelope with a red "!" badge, drawn once into a texture.
function makeIcon(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x0b0e14, 1);
  g.fillRoundedRect(0, 6, 40, 28, 4);
  g.fillStyle(0xf8fafc, 1);
  g.fillRoundedRect(2, 8, 36, 24, 3);
  g.lineStyle(3, 0x6d28d9, 1);
  g.beginPath();
  g.moveTo(4, 10);
  g.lineTo(20, 23);
  g.lineTo(36, 10);
  g.strokePath();
  g.fillStyle(0xef4444, 1);
  g.fillCircle(38, 8, 8);
  g.fillStyle(0xffffff, 1);
  g.fillRect(36.5, 3, 3, 6);
  g.fillRect(36.5, 10.5, 3, 2.5);
  g.generateTexture(ICON, 48, 36);
  g.destroy();
}
