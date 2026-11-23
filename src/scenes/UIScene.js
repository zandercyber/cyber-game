// Heads-up display drawn on top of the room: cash, power meter, shop, buttons.
import * as Phaser from 'phaser';
import { ITEMS, POWER_ITEMS, POWER_TIERS, SHOVEL_REFUND } from '../data/catalog.js';
import { AGENT_TYPES } from '../data/agents.js';
import { PLAYER_UPGRADES } from '../data/playerUpgrades.js';
import { gameState } from '../state/GameState.js';
import { clearSave } from '../state/save.js';
import { ShopPanel } from '../ui/ShopPanel.js';
import { QuestionPanel } from '../ui/QuestionPanel.js';

const PANEL_BG = 0x0b0e14;
const ACCENT = '#5ff0ff';
const FONT = 'system-ui, sans-serif';
const BAR_W = 150;
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
    const onArrive = (agent) => this.showBanner(`${agent.name} has arrived!`, 'Works your machines and carries cash to the hamper. Upgrade agents in the shop.', PURPLE);
    const onUpgrade = (type, kind, level) => this.showBanner('Agent upgraded!', `${AGENT_TYPES[type].upgrades[kind].name} is now level ${level}.`, PURPLE);
    const onPlayerUpgrade = (kind, level) => this.showBanner('Upgraded!', `${PLAYER_UPGRADES[kind].name}: ${PLAYER_UPGRADES[kind].describe(level).toLowerCase()}.`);
    this.dorm.events.on('breaker-tripped', onTrip);
    this.dorm.events.on('power-installed', onPower);
    const onRogue = (agent) => this.showBanner(`${agent.name} went rogue!`, 'He\'s frying your machines. Stay right next to him for 3 seconds to contain him.', RED);
    const onContained = (agent) => this.showBanner(`${agent.name} contained!`, 'Quarantined for 60 seconds, then he goes back to work.', 0x5ff0ff);
    this.dorm.events.on('agent-rogue', onRogue);
    this.dorm.events.on('agent-contained', onContained);
    this.dorm.events.on('agent-arrived', onArrive);
    this.dorm.events.on('agent-upgraded', onUpgrade);
    this.dorm.events.on('player-upgraded', onPlayerUpgrade);

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
    if (rogue) text = `${rogue.name} went rogue: catch him!`;
    else if (friedCount && !gameState.tripped) text = friedCount === 1 ? '1 machine fried: stand at it to repair' : `${friedCount} machines fried: repair them`;
    else if (boxes.length) text = boxes.length === 1 ? 'A box is waiting at the door' : `${boxes.length} boxes at the door`;
    else if (carryBox) text = Object.hasOwn(POWER_ITEMS, carryBox.itemId) ? 'Take the box to the breaker panel' : 'Carry the box to an empty plot';
    else if (orders.length) text = `Delivery in ${Math.ceil(Math.min(...orders.map((o) => o.remaining)))}s`;
    else if (this.dorm.arrivals.length) {
      const next = this.dorm.arrivals.reduce((a, b) => (b.remaining < a.remaining ? b : a));
      text = `${AGENT_TYPES[next.type].name} arrives in ${Math.ceil(next.remaining)}s`;
    }
    if (this.shop.visible) text = ''; // the shop lists deliveries itself
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

  update() {
    this.questionPanel.update();
    const plot = this.dorm.shovelTarget?.() ?? null;
    if (plot !== this.shovelPlot) {
      this.shovelPlot = plot;
      this.shovelArmedUntil = 0; // walking to another machine cancels the confirm
    }
    this.showShovel(Boolean(plot));
    if (!plot) return;
    const refund = Math.round(ITEMS[plot.itemId].price * SHOVEL_REFUND);
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
