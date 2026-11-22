// Heads-up display drawn on top of the room: cash, power meter, fullscreen button.
import * as Phaser from 'phaser';
import { POWER_TIERS } from '../data/catalog.js';
import { gameState } from '../state/GameState.js';

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

    this.renderCash(gameState.cash);
    this.renderPower(gameState.power);
    gameState.on('cash', this.renderCash, this);
    gameState.on('power', this.renderPower, this);
    this.events.once('shutdown', () => {
      gameState.off('cash', this.renderCash, this);
      gameState.off('power', this.renderPower, this);
    });
  }

  /** True if the pointer is on a HUD button, so the room ignores that tap. */
  isOverButton(pointer) {
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
