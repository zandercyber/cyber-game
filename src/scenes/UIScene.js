// Heads-up display drawn on top of the room: cash, power meter, shop, buttons.
import * as Phaser from 'phaser';
import { ITEMS, POWER_ITEMS, POWER_TIERS, FOAM_ITEMS, FOAM_QUIET_PER_LEVEL, FAN, FAN_ITEMS, SHOVEL_REFUND } from '../data/catalog.js';
import { AGENT_TYPES, MAX_AGENTS } from '../data/agents.js';
import { NEIGHBOR, noiseLevel } from '../data/neighbor.js';
import { PLAYER_UPGRADES } from '../data/playerUpgrades.js';
import { gameState } from '../state/GameState.js';
import { clearSave } from '../state/save.js';
import { ShopPanel } from '../ui/ShopPanel.js';
import { QuestionPanel } from '../ui/QuestionPanel.js';

const PANEL_BG = 0x0b0e14;
const ACCENT = '#5ff0ff';
const FONT = 'system-ui, sans-serif';
const BAR_W = 150;
const NEIGHBOR_BAR_W = 100;
const GREEN = 0x4ade80;
const RED = 0xf87171;
const PURPLE = 0xc4b5fd;
const css = (color) => `#${color.toString(16).padStart(6, '0')}`;

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    const { width, height } = this.scale;
    this.buttons = [];

    // Cash, top-left.
    this.panel(20, 18, 220, 64);
    this.add.image(40, 50, 'item-cash').setOrigin(0, 0.5).setScale(1.1);
    this.cashText = this.add.text(96, 50, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#b8ffcf' })
      .setOrigin(0, 0.5);

    // Power meter, top-right.
    const px = width - 20 - 370;
    this.panel(px, 18, 370, 64);
    this.powerIcon = this.add.image(px + 34, 50, 'item-power-strip').setVisible(false);
    this.powerLabel = this.add.text(px + 66, 28, '', { fontFamily: FONT, fontSize: '15px', color: ACCENT });
    this.barBg = this.add.rectangle(px + 66, 58, BAR_W, 14, 0xffffff, 0.12).setOrigin(0, 0.5);
    this.barFill = this.add.rectangle(px + 66, 58, 0, 14, 0x4ade80).setOrigin(0, 0.5);
    this.powerText = this.add.text(px + 66 + BAR_W + 10, 58, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#e6f4ff' })
      .setOrigin(0, 0.5);

    // Neighbor meter under the power meter: how close they are to coming over.
    this.neighborPanel = this.panel(px, 90, 370, 46).setVisible(false);
    this.neighborLabel = this.add.text(px + 16, 113, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#cbd5e1' })
      .setOrigin(0, 0.5).setVisible(false);
    this.neighborBarBg = this.add.rectangle(px + 140, 113, NEIGHBOR_BAR_W, 12, 0xffffff, 0.12).setOrigin(0, 0.5).setVisible(false);
    this.neighborBar = this.add.rectangle(px + 140, 113, 0, 12, 0x4ade80).setOrigin(0, 0.5).setVisible(false);
    this.noiseText = this.add.text(px + 140 + NEIGHBOR_BAR_W + 12, 113, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#e6f4ff' })
      .setOrigin(0, 0.5).setVisible(false);

    // Clock, next to the cash: time of day, day number, quiet hours at night.
    this.panel(250, 18, 180, 64);
    this.clockIcon = this.add.graphics();
    this.clockText = this.add.text(300, 38, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e6f4ff' })
      .setOrigin(0, 0.5);
    this.clockDay = this.add.text(300, 64, '', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#94a3b8' })
      .setOrigin(0, 0.5);
    this.clockNight = null;

    this.addFullscreenButton(width, height);
    this.addNewGameButton(height);
    this.dorm = this.scene.get('DormScene');
    this.addShovelButton(width, height);

    // Delivery status under the cash counter.
    this.deliveryChip = this.add.text(20, 92, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#fde68a',
      backgroundColor: '#0b0e14cc', padding: { x: 10, y: 6 },
    }).setVisible(false);

    // The shop screen opens while you stand at the laptop (after it unlocks).
    this.shop = new ShopPanel(this, {
      onBuy: (itemId) => this.dorm.buy(itemId),
      getOrders: () => this.dorm.orders,
      getPower: () => ({ next: this.dorm.nextPower(), pending: this.dorm.powerPending() }),
      getFoam: () => ({ next: this.dorm.nextFoam(), pending: this.dorm.foamPending(), level: this.dorm.foamLevel }),
      getFans: () => {
        const machines = this.dorm.plots.filter((p) => p.station);
        return { machines: machines.length, withFan: machines.filter((p) => p.fan).length, pending: this.dorm.fansPending() };
      },
      getAgents: () => this.dorm.agentsInfo(),
      onHire: (type) => this.dorm.hireAgent(type),
      onAgentUpgrade: (type, kind) => this.dorm.buyAgentUpgrade(type, kind),
      getPlayerLevels: () => this.dorm.playerLevels,
      onPlayerUpgrade: (kind) => this.dorm.buyPlayerUpgrade(kind),
    });
    this.shop.setVisible(this.dorm.shopOpen);
    const onShop = (open) => this.shop.setVisible(open);
    this.dorm.events.on('shop', onShop);
    this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        if (this.shop.visible) this.shop.refresh();
        this.renderDeliveryChip();
      },
    });
    // Security questions while you work.
    this.questionPanel = new QuestionPanel(this, { onAnswer: (pick) => this.dorm.answerQuestion(pick) });
    const onQuestion = (question) => this.questionPanel.show(question);
    this.dorm.events.on('question', onQuestion);
    const onKey = (event) => this.questionPanel.key(event);
    this.input.keyboard.on('keydown', onKey);
    // A new tap on the card (after answering) closes it. pointerdown, so the tap
    // that picked the answer doesn't also close it.
    this.input.on('pointerdown', (pointer) => this.questionPanel.tap(pointer));

    const onUnlock = () => this.showBanner('Shop unlocked!', 'Your laptop now sells gear. Walk over to shop.');
    gameState.on('shop-unlocked', onUnlock);
    const onTrip = ({ again, fried, used, capacity }) => {
      const what = fried.length ? ` The surge fried your ${fried.join(' and ')}!` : '';
      if (again) {
        this.showBanner('Tripped again!', `Still over the limit.${what} Remove a machine or upgrade power.`, RED);
      } else {
        const fix = fried.length ? 'Reset the breaker, then repair it.' : 'Reset it at the breaker panel.';
        this.showBanner('Breaker tripped!', `${used} W is over your ${capacity} W limit.${what} ${fix}`, RED);
      }
    };
    const onPower = (power) => this.showBanner('Power upgraded!', `${power.name}: up to ${power.capacity} W`);
    const onFan = (name) => this.showBanner('Fan on!', `Your ${name} heats up ${Math.round((1 - FAN.heatSlower) * 100)}% slower and cools ${Math.round((FAN.coolFaster - 1) * 100)}% faster. It's a little louder while you work it.`);
    const onFoam = (level) => this.showBanner('Foam panels up!', `Level ${level}: noise bothers your neighbor ${Math.round(level * FOAM_QUIET_PER_LEVEL * 100)}% less, so they come over less often.`);
    const onArrive = (agent) => this.showBanner(`${agent.name} has arrived!`, 'Works your machines and carries cash to the hamper. Upgrade agents in the shop.', PURPLE);
    const onUpgrade = (type, kind, level) => this.showBanner('Agent upgraded!', `${AGENT_TYPES[type].upgrades[kind].name} is now level ${level}.`, PURPLE);
    const onPlayerUpgrade = (kind, level) => this.showBanner('Upgraded!', `${PLAYER_UPGRADES[kind].name}: ${PLAYER_UPGRADES[kind].describe(level).toLowerCase()}.`);
    this.dorm.events.on('breaker-tripped', onTrip);
    this.dorm.events.on('power-installed', onPower);
    this.dorm.events.on('foam-installed', onFoam);
    this.dorm.events.on('fan-installed', onFan);
    const onRogue = (agent) => this.showBanner(`${agent.name} went rogue!`, 'He\'s frying your machines. Stay right next to him for 3 seconds to contain him.', RED);
    const onContained = (agent) => this.showBanner(`${agent.name} contained!`, 'Quarantined for 60 seconds, then he goes back to work.', 0x5ff0ff);
    const AMBER = 0xfbbf24;
    const onWarn = () => this.showBanner('Your neighbor is banging on the wall', 'The louder you are, the sooner they come over. Fewer machines at once = fewer visits.', AMBER);
    const onComing = () => this.showBanner('Your neighbor is coming over!', `Walk up to every machine to switch it off. You have ${NEIGHBOR.comingSeconds} seconds.`, RED);
    const onComplaint = ({ fine, paid, next }) => this.showBanner(`Noise complaint! -$${paid}`, `${paid < fine ? `You couldn't cover the $${fine} fine. ` : ''}The next complaint costs $${next}.`, RED);
    const onSatisfied = () => this.showBanner('Quiet enough', 'Your neighbor grumbles and heads back home.', GREEN);
    const onLeft = () => { if (this.dorm.switchedOffCount) this.showBanner('They\'re gone', 'Walk up to your machines to switch them back on.', 0x5ff0ff); };
    const NIGHT = 0xa78bfa;
    const onNight = () => this.showBanner('Quiet hours', `10 PM to 6 AM: your neighbor is trying to sleep, so noise bothers them ${NEIGHBOR.nightMultiplier}x as fast.`, NIGHT);
    const onMorning = () => this.showBanner('Good morning', 'Quiet hours are over. Your neighbor is back to normal.', AMBER);
    const neighborEvents = { 'night-start': onNight, 'night-end': onMorning, 'neighbor-warning': onWarn, 'neighbor-coming': onComing, 'neighbor-complaint': onComplaint, 'neighbor-satisfied': onSatisfied, 'neighbor-left': onLeft };
    for (const [name, fn] of Object.entries(neighborEvents)) this.dorm.events.on(name, fn);
    this.events.once('shutdown', () => { for (const [name, fn] of Object.entries(neighborEvents)) this.dorm.events.off(name, fn); });
    this.dorm.events.on('agent-rogue', onRogue);
    this.dorm.events.on('agent-contained', onContained);
    this.dorm.events.on('agent-arrived', onArrive);
    this.dorm.events.on('agent-upgraded', onUpgrade);
    this.dorm.events.on('player-upgraded', onPlayerUpgrade);
    const onSentHome = ({ names, refund }) => this.showBanner(`The dorm fits ${MAX_AGENTS} agents now`,
      `${names.join(' and ')} went home. You got back the $${refund.toLocaleString()} you paid.`, PURPLE);
    this.dorm.events.once('agents-sent-home', onSentHome);

    this.renderCash(gameState.cash);
    this.renderPower(gameState.power);
    gameState.on('cash', this.renderCash, this);
    gameState.on('power', this.renderPower, this);
    this.events.once('shutdown', () => {
      gameState.off('cash', this.renderCash, this);
      gameState.off('power', this.renderPower, this);
      gameState.off('shop-unlocked', onUnlock);
      this.dorm.events.off('shop', onShop);
      this.dorm.events.off('breaker-tripped', onTrip);
      this.dorm.events.off('power-installed', onPower);
      this.dorm.events.off('agents-sent-home', onSentHome);
      this.dorm.events.off('foam-installed', onFoam);
      this.dorm.events.off('fan-installed', onFan);
      this.dorm.events.off('agent-arrived', onArrive);
      this.dorm.events.off('agent-rogue', onRogue);
      this.dorm.events.off('agent-contained', onContained);
      this.dorm.events.off('agent-upgraded', onUpgrade);
      this.dorm.events.off('player-upgraded', onPlayerUpgrade);
      this.dorm.events.off('question', onQuestion);
      this.input.keyboard.off('keydown', onKey);
    });
  }

  renderDeliveryChip() {
    const { orders, boxes, carryBox, friedCount } = this.dorm;
    let text = '';
    const rogue = this.dorm.agents.find((a) => a.state === 'rogue');
    const neighbor = this.dorm.neighbor;
    const sleeper = this.dorm.agents.find((ag) => ag.waitingToWake);
    const crashed = this.dorm.crashedStations;
    const updates = this.dorm.pendingUpdates;
    const outdated = updates.filter((st) => st.hustle.outdated);
    const nameOf = (st) => this.dorm.itemName(this.dorm.plots.find((p) => p.id === st.plotId)?.itemId);
    const stillOn = this.dorm.runningMachines().length;
    if (neighbor.state === 'coming') text = stillOn ? `Switch machines off! ${stillOn} still on · ${Math.ceil(neighbor.timer)}s` : `All off. Neighbor in ${Math.ceil(neighbor.timer)}s`;
    else if (neighbor.state === 'visiting') text = 'Neighbor at the window: stay quiet';
    else if (rogue) text = `${rogue.name} went rogue: catch him!`;
    else if (friedCount && !gameState.tripped) text = friedCount === 1 ? '1 machine fried: stand at it to repair' : `${friedCount} machines fried: repair them`;
    else if (crashed.length && !gameState.tripped) text = crashed.length === 1 ? `${nameOf(crashed[0])} crashed: stand at it to reboot` : `${crashed.length} servers crashed: reboot them`;
    else if (sleeper) text = `${sleeper.name} is asleep: walk up to wake him`;
    else if (carryBox) {
      if (Object.hasOwn(POWER_ITEMS, carryBox.itemId)) text = 'Take the box to the breaker panel';
      else if (Object.hasOwn(FOAM_ITEMS, carryBox.itemId)) text = 'Take the foam panels to the bed';
      else if (Object.hasOwn(FAN_ITEMS, carryBox.itemId)) {
        text = this.dorm.machinesWithoutFan().length ? 'Walk up to a machine without a fan' : 'Every machine has a fan: bring it back to the door';
      }
      else text = this.dorm.hasEmptyPlot ? 'Carry the box to an empty plot' : 'No empty plot: bring the box back to the door';
    }
    else if (boxes.length) {
      const waiting = boxes.length === 1 ? 'A box is waiting at the door' : `${boxes.length} boxes at the door`;
      const stuck = !this.dorm.hasEmptyPlot && boxes.every((b) => Object.hasOwn(ITEMS, b.itemId));
      text = stuck ? `${waiting}: dig up a machine to make room` : waiting;
    }
    else if (outdated.length) text = outdated.length === 1 ? `${nameOf(outdated[0])} is outdated (pays less): update it` : `${outdated.length} machines outdated (pay less): update them`;
    else if (updates.length) text = updates.length === 1 ? `Update available on the ${nameOf(updates[0])}` : `${updates.length} updates available: stand at those machines`;
    else if (orders.length) text = `Delivery in ${Math.ceil(Math.min(...orders.map((o) => o.remaining)))}s`;
    else if (this.dorm.arrivals.length) {
      const next = this.dorm.arrivals.reduce((a, b) => (b.remaining < a.remaining ? b : a));
      text = `${AGENT_TYPES[next.type].name} arrives in ${Math.ceil(next.remaining)}s`;
    }
    else if (this.dorm.switchedOffCount && !neighbor.quiet) text = `Walk up to ${this.dorm.switchedOffCount} switched-off machine${this.dorm.switchedOffCount > 1 ? 's' : ''} to turn on`;
    if (this.shop.visible && !neighbor.quiet) text = ''; // the shop lists deliveries itself
    this.deliveryChip.setVisible(Boolean(text));
    if (text && this.deliveryChip.text !== text) this.deliveryChip.setText(text);
  }

  // Big message across the top for a few seconds.
  showBanner(title, subtitle, color = GREEN) {
    const { width } = this.scale;
    this.banner?.destroy(); // newest message wins
    // Beside the shop while it's open, so it doesn't cover the buttons.
    const x = this.shop?.visible ? (540 + width) / 2 + 10 : width / 2;
    const box = this.add.container(x, 170).setDepth(40000);
    this.banner = box;
    const t1 = this.add.text(0, -18, title, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: css(color) }).setOrigin(0.5);
    const t2 = this.add.text(0, 14, subtitle, {
      fontFamily: FONT, fontSize: '19px', color: '#e6f4ff', align: 'center', wordWrap: { width: 600 },
    }).setOrigin(0.5, 0);
    // Size the box to the text, so a subtitle that wraps onto two lines still fits.
    const top = -52;
    const h = 14 - top + t2.height + 16;
    const bg = this.add.rectangle(0, top + h / 2, 640, h, 0x0b0e14, 0.95).setStrokeStyle(3, color, 0.9);
    box.add([bg, t1, t2]);
    box.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 300, ease: 'Back.out' });
    this.tweens.add({ targets: box, alpha: 0, delay: 4000, duration: 500, onComplete: () => box.destroy() });
  }

  /** True if the pointer is on a HUD button, so the room ignores that tap. */
  isOverButton(pointer) {
    if (this.shop?.contains(pointer) || this.questionPanel?.contains(pointer)) return true;
    return (this.buttons ?? []).some((b) => b.visible && b.getBounds().contains(pointer.x, pointer.y));
  }

  panel(x, y, w, h) {
    const g = this.add.graphics();
    g.fillStyle(PANEL_BG, 0.82);
    g.fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(2, 0x5ff0ff, 0.35);
    g.strokeRoundedRect(x, y, w, h, 12);
    return g;
  }

  renderCash(cash, change = 0) {
    this.cashText.setText(`$${cash.toLocaleString('en-US')}`);
    if (this.shop?.visible) this.shop.refresh();
    if (change > 0) {
      // Little bump and a "+$N" that floats up from the counter.
      this.tweens.add({ targets: this.cashText, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.out' });
      const t = this.add.text(this.cashText.x + this.cashText.width + 12, 50, `+$${change}`, {
        fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#4ade80',
      }).setOrigin(0, 0.5);
      this.tweens.add({ targets: t, y: 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }
  }

  renderPower({ used, capacity, tierName, tripped }) {
    const ratio = capacity > 0 ? used / capacity : 0;
    const color = ratio >= 0.9 ? RED : ratio >= 0.7 ? 0xfacc15 : GREEN;
    this.barFill.width = Math.min(1, ratio) * BAR_W;
    this.barFill.fillColor = tripped ? RED : color;
    this.powerLabel.setText(tripped ? 'POWER OUT · reset the breaker' : `POWER · ${tierName}`);
    this.powerLabel.setColor(tripped ? css(RED) : ACCENT);
    this.powerText.setText(`${used} / ${capacity} W`);
    this.powerText.setColor(ratio > 1 || tripped ? css(RED) : '#e6f4ff');
    this.tweens.killTweensOf(this.barFill);
    this.barFill.setAlpha(1);
    if (tripped) this.tweens.add({ targets: this.barFill, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

    const icon = POWER_TIERS[gameState.powerTier].icon;
    this.powerIcon.setVisible(Boolean(icon));
    if (icon) {
      this.powerIcon.setTexture(icon);
      // Fit the icon into a ~44px box.
      const s = 44 / Math.max(this.powerIcon.width, this.powerIcon.height);
      this.powerIcon.setScale(s);
    }
  }

  // Bottom-center: shows up while you stand at an installed machine.
  // Tap once, then tap again within 3 s to dig it up for part of its price back.
  addShovelButton(width, height) {
    const cx = width / 2;
    const cy = height - 20 - 30;
    this.shovelBg = this.add.rectangle(cx, cy, 330, 60, 0x0b0e14, 0.9)
      .setStrokeStyle(2, 0xfbbf24, 0.85)
      .setInteractive({ useHandCursor: true });
    this.shovelIcon = this.add.image(cx - 140, cy, 'item-shovel').setScale(0.6).setAngle(-20);
    this.shovelText = this.add.text(cx + 14, cy, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fde68a',
    }).setOrigin(0.5);
    this.buttons.push(this.shovelBg);
    this.shovelPlot = null;
    this.shovelArmedUntil = 0;
    this.shovelBg.on('pointerup', () => {
      if (!this.shovelPlot) return;
      if (this.time.now < this.shovelArmedUntil) {
        this.shovelArmedUntil = 0;
        this.dorm.shovel(this.shovelPlot.id);
        return;
      }
      this.shovelArmedUntil = this.time.now + 3000;
    });
    this.showShovel(false);
  }

  showShovel(on) {
    this.shovelBg.setVisible(on);
    this.shovelIcon.setVisible(on);
    this.shovelText.setVisible(on);
  }

  // Time of day: a sun or moon, the time, and the day number.
  renderClock() {
    const clock = this.dorm.clock;
    if (this.clockText.text !== clock.label) this.clockText.setText(clock.label);
    const day = clock.night ? `Day ${clock.day} · Quiet hours` : `Day ${clock.day}`;
    if (this.clockDay.text !== day) this.clockDay.setText(day).setColor(clock.night ? '#c4b5fd' : '#94a3b8');
    if (this.clockNight === clock.night) return;
    this.clockNight = clock.night;
    const g = this.clockIcon.clear();
    if (clock.night) { // crescent moon: a pale circle with a panel-colored bite
      g.fillStyle(0xfef3c7, 1).fillCircle(276, 50, 12);
      g.fillStyle(PANEL_BG, 1).fillCircle(282, 45, 10);
    } else { // sun with short rays
      g.lineStyle(3, 0xfcd34d, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(276 + Math.cos(a) * 13, 50 + Math.sin(a) * 13, 276 + Math.cos(a) * 17, 50 + Math.sin(a) * 17);
      }
      g.fillStyle(0xfcd34d, 1).fillCircle(276, 50, 9);
    }
  }

  // How close the neighbor is to coming over, and how loud you are (louder = sooner).
  renderNeighbor() {
    const n = this.dorm.neighbor;
    const noise = this.dorm.noise;
    const show = noise > 0 || n.annoyance > 0 || n.state !== 'calm';
    for (const o of [this.neighborPanel, this.neighborLabel, this.neighborBarBg, this.neighborBar, this.noiseText]) o.setVisible(show);
    if (!show) return;
    const level = n.state === 'calm' ? n.annoyance / 100 : 1;
    this.neighborBar.width = level * NEIGHBOR_BAR_W;
    this.neighborBar.fillColor = level >= 0.8 ? 0xf87171 : level >= NEIGHBOR.warnAt / 100 ? 0xfacc15 : 0x4ade80;
    let label = 'NEIGHBOR';
    if (n.state === 'coming') label = 'COMING OVER';
    else if (n.state === 'visiting') label = 'AT THE WINDOW';
    else if (this.dorm.clock.night) label = 'QUIET HOURS';
    const labelColor = n.quiet ? '#fca5a5' : label === 'QUIET HOURS' ? '#c4b5fd' : '#cbd5e1';
    if (this.neighborLabel.text !== label) this.neighborLabel.setText(label).setColor(labelColor);
    const loudness = noiseLevel(noise);
    const text = loudness ? `Noise: ${loudness.name}` : 'Silent';
    if (this.noiseText.text !== text) this.noiseText.setText(text).setColor(loudness ? loudness.color : '#94a3b8');
  }

  update() {
    this.questionPanel.update();
    this.renderNeighbor();
    this.renderClock();
    const plot = this.dorm.shovelTarget?.() ?? null;
    if (plot !== this.shovelPlot) {
      this.shovelPlot = plot;
      this.shovelArmedUntil = 0; // walking to another machine cancels the confirm
    }
    this.showShovel(Boolean(plot));
    if (!plot) return;
    const refund = Math.round((ITEMS[plot.itemId].price + (plot.fan ? FAN.price : 0)) * SHOVEL_REFUND); // its fan comes off too
    const armed = this.time.now < this.shovelArmedUntil;
    const text = armed ? 'Tap again to dig it up' : `Remove: +$${refund} back`;
    if (this.shovelText.text !== text) this.shovelText.setText(text).setColor(armed ? '#fca5a5' : '#fde68a');
    this.shovelBg.setStrokeStyle(2, armed ? RED : 0xfbbf24, 0.85);
  }

  // Bottom-left. Tap once to arm, tap again within 3 s to wipe the save and restart.
  addNewGameButton(height) {
    const idle = 'New game';
    const button = this.add.text(20, height - 20, idle, {
      fontFamily: FONT,
      fontSize: '18px',
      color: '#94a3b8',
      backgroundColor: '#0b0e14cc',
      padding: { x: 12, y: 8 },
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true });
    this.buttons.push(button);
    let armedUntil = 0;
    button.on('pointerup', () => {
      if (this.time.now < armedUntil) {
        clearSave();
        window.location.reload();
        return;
      }
      armedUntil = this.time.now + 3000;
      button.setText('Tap again to erase progress').setColor('#fca5a5');
      this.time.delayedCall(3000, () => button.setText(idle).setColor('#94a3b8'));
    });
  }

  addFullscreenButton(width, height) {
    if (!this.scale.fullscreen.available) return;
    const button = this.add.text(width - 20, height - 20, '⛶', {
      fontFamily: FONT,
      fontSize: '34px',
      color: ACCENT,
      backgroundColor: '#0b0e14cc',
      padding: { x: 10, y: 2 },
    }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    this.buttons.push(button);
    button.on('pointerup', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });
  }
}
