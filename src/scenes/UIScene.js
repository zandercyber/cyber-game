// Heads-up display drawn on top of the room: cash, power meter, shop, buttons.
import * as Phaser from 'phaser';
import { POWER_TIERS } from '../data/catalog.js';
import { gameState } from '../state/GameState.js';
import { clearSave } from '../state/save.js';
import { ShopPanel } from '../ui/ShopPanel.js';

const PANEL_BG = 0x0b0e14;
const ACCENT = '#5ff0ff';
const FONT = 'system-ui, sans-serif';
const BAR_W = 150;

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

    // Delivery status under the cash counter.
    this.deliveryChip = this.add.text(20, 92, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#fde68a',
      backgroundColor: '#0b0e14cc', padding: { x: 10, y: 6 },
    }).setVisible(false);

    // The shop screen opens while you stand at the laptop (after it unlocks).
    this.dorm = this.scene.get('DormScene');
    this.shop = new ShopPanel(this, {
      onBuy: (itemId) => this.dorm.buy(itemId),
      getOrders: () => this.dorm.orders,
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
    const onUnlock = () => this.showBanner('Shop unlocked!', 'Your laptop now sells gear. Walk over to shop.');
    gameState.on('shop-unlocked', onUnlock);

    this.renderCash(gameState.cash);
    this.renderPower(gameState.power);
    gameState.on('cash', this.renderCash, this);
    gameState.on('power', this.renderPower, this);
    this.events.once('shutdown', () => {
      gameState.off('cash', this.renderCash, this);
      gameState.off('power', this.renderPower, this);
      gameState.off('shop-unlocked', onUnlock);
      this.dorm.events.off('shop', onShop);
    });
  }

  renderDeliveryChip() {
    const { orders, boxes, carryBox } = this.dorm;
    let text = '';
    if (boxes.length) text = boxes.length === 1 ? 'A box is waiting at the door' : `${boxes.length} boxes at the door`;
    else if (carryBox) text = 'Carry the box to an empty plot';
    else if (orders.length) text = `Delivery in ${Math.ceil(Math.min(...orders.map((o) => o.remaining)))}s`;
    if (this.shop.visible) text = ''; // the shop lists deliveries itself
    this.deliveryChip.setVisible(Boolean(text));
    if (text && this.deliveryChip.text !== text) this.deliveryChip.setText(text);
  }

  // Big message across the top for a few seconds.
  showBanner(title, subtitle) {
    const { width } = this.scale;
    const box = this.add.container(width / 2, 170).setDepth(40000);
    const bg = this.add.rectangle(0, 0, 640, 104, 0x0b0e14, 0.95).setStrokeStyle(3, 0x4ade80, 0.9);
    const t1 = this.add.text(0, -18, title, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#4ade80' }).setOrigin(0.5);
    const t2 = this.add.text(0, 26, subtitle, { fontFamily: FONT, fontSize: '19px', color: '#e6f4ff' }).setOrigin(0.5);
    box.add([bg, t1, t2]);
    box.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 300, ease: 'Back.out' });
    this.tweens.add({ targets: box, alpha: 0, delay: 4000, duration: 500, onComplete: () => box.destroy() });
  }

  /** True if the pointer is on a HUD button, so the room ignores that tap. */
  isOverButton(pointer) {
    if (this.shop?.contains(pointer)) return true;
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

  renderPower({ used, capacity, tierName }) {
    const ratio = capacity > 0 ? used / capacity : 0;
    const color = ratio >= 0.9 ? 0xf87171 : ratio >= 0.7 ? 0xfacc15 : 0x4ade80;
    this.barFill.width = Math.min(1, ratio) * BAR_W;
    this.barFill.fillColor = color;
    this.powerLabel.setText(`POWER · ${tierName}`);
    this.powerText.setText(`${used} / ${capacity} W`);
    this.powerText.setColor(ratio > 1 ? '#f87171' : '#e6f4ff');

    const icon = POWER_TIERS[gameState.powerTier].icon;
    this.powerIcon.setVisible(Boolean(icon));
    if (icon) {
      this.powerIcon.setTexture(icon);
      // Fit the icon into a ~44px box.
      const s = 44 / Math.max(this.powerIcon.width, this.powerIcon.height);
      this.powerIcon.setScale(s);
    }
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
