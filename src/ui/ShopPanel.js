// The shop screen: opens when you stand at the corner laptop (after it unlocks).
// Two tabs:
//   Gear: machines plus the next power upgrade; orders arrive later as a box at the door.
//   Upgrades: hire Augustus, then upgrade his speed, profit boost and energy.

import { ITEMS, orderable } from '../data/catalog.js';
import { AUGUSTUS, AUGUSTUS_UPGRADES, MAX_LEVEL, UPGRADE_IDS } from '../data/augustus.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const X = 20;
const Y = 100;
const W = 520;
const ROW_H = 86;
const HEADER_H = 70;
const TEXT_W = W - 96 - 140; // leave room for the price button
const GREEN = 0x16a34a;
const GREY = 0x334155;

// Thumbnails for the Upgrades tab: [texture, frame, scale].
const UPGRADE_THUMBS = { speed: ['augustus', 1, 2.4], profit: ['item-cash', undefined, 1.3], energy: ['augustus', 3, 2.4] };

export class ShopPanel {
  constructor(scene, { onBuy, getOrders, getPower, getAugustus, onHire, onUpgrade }) {
    this.scene = scene;
    this.onBuy = onBuy;
    this.getOrders = getOrders;
    this.getPower = getPower; // () => ({ next, pending })
    this.getAugustus = getAugustus; // () => ({ hired, arriving, levels, status })
    this.onHire = onHire;
    this.onUpgrade = onUpgrade;
    const ids = Object.keys(ITEMS);
    const rowCount = ids.length + 1; // machines + one power row
    this.height = HEADER_H + rowCount * ROW_H + 64;

    this.root = scene.add.container(X, Y).setDepth(30000).setVisible(false);
    const bg = scene.add.graphics();
    bg.fillStyle(0x0b0e14, 0.94);
    bg.fillRoundedRect(0, 0, W, this.height, 14);
    bg.lineStyle(2, 0x5ff0ff, 0.6);
    bg.strokeRoundedRect(0, 0, W, this.height, 14);
    this.root.add(bg);
    this.root.add(scene.add.text(20, 14, 'Shop', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#5ff0ff' }));
    this.subtitle = scene.add.text(20, 48, '', { fontFamily: FONT, fontSize: '14px', color: '#94a3b8' });
    this.root.add(this.subtitle);
    this.tabButtons = [this.addTab('gear', 'Gear', W - 236, 96), this.addTab('upgrades', 'Upgrades', W - 132, 112)];

    // Gear tab.
    this.rows = ids.map((id, i) => this.addRow(HEADER_H + i * ROW_H, { tab: 'gear', id, thumb: [`station-${id}`] }));
    this.powerRow = this.addRow(HEADER_H + ids.length * ROW_H, { tab: 'gear', id: null, thumb: ['item-power-strip'] });
    this.rows.push(this.powerRow);
    // Upgrades tab: the hire row until he's hired, then one row per upgrade.
    this.hireRow = this.addRow(HEADER_H, { tab: 'upgrades', action: 'hire', thumb: ['augustus', 0, 2.4] });
    this.upgradeRows = UPGRADE_IDS.map((key, i) =>
      this.addRow(HEADER_H + i * ROW_H, { tab: 'upgrades', action: key, thumb: UPGRADE_THUMBS[key] }));
    this.rows.push(this.hireRow, ...this.upgradeRows);

    this.ordersText = scene.add.text(20, HEADER_H + rowCount * ROW_H + 14, '', {
      fontFamily: FONT, fontSize: '15px', color: '#fbbf24', lineSpacing: 4,
    });
    this.agentText = scene.add.text(20, HEADER_H + UPGRADE_IDS.length * ROW_H + 14, '', {
      fontFamily: FONT, fontSize: '15px', color: '#c4b5fd', lineSpacing: 4, wordWrap: { width: W - 40 },
    });
    this.root.add([this.ordersText, this.agentText]);
    this.tab = 'gear';
    this.setTab('gear');
  }

  addTab(id, label, x, width) {
    const s = this.scene;
    const btn = s.add.rectangle(x, 14, width, 36, GREY).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = s.add.text(x + width / 2, 32, label, {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#e6f4ff',
    }).setOrigin(0.5);
    btn.on('pointerup', () => {
      if (this.root.visible) this.setTab(id);
    });
    this.root.add([btn, text]);
    return { id, btn, text };
  }

  setTab(tab) {
    this.tab = tab;
    for (const { id, btn, text } of this.tabButtons) {
      btn.setFillStyle(id === tab ? 0x0e7490 : GREY);
      text.setColor(id === tab ? '#ffffff' : '#94a3b8');
    }
    this.subtitle.setText(tab === 'gear'
      ? 'Orders arrive as a box at the door. Carry it to where it goes.'
      : 'Upgrades take effect right away. No delivery.');
    this.refresh();
  }

  // One row: picture, name, info line, and a price button. Rows whose contents
  // change (power, hire, upgrades) are filled in by refresh().
  addRow(y, { tab, id = null, action = null, thumb }) {
    const s = this.scene;
    const [key, frame, scale] = thumb;
    const image = s.add.image(52, y + ROW_H / 2, key, frame);
    image.setScale(scale ?? Math.min(64 / image.width, 64 / image.height));
    const bolt = s.add.text(52, y + ROW_H / 2, '⚡', { fontSize: '40px' }).setOrigin(0.5).setVisible(false);
    const name = s.add.text(96, y + 14, id ? ITEMS[id].name : '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e6f4ff', wordWrap: { width: TEXT_W },
    });
    const info = s.add.text(96, y + 42, '', {
      fontFamily: FONT, fontSize: '14px', color: '#94a3b8', wordWrap: { width: TEXT_W },
    });
    const btn = s.add.rectangle(W - 72, y + ROW_H / 2, 108, 50, GREEN).setInteractive({ useHandCursor: true });
    const label = s.add.text(W - 72, y + ROW_H / 2, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    const divider = s.add.rectangle(20, y + ROW_H - 1, W - 40, 1, 0xffffff, 0.08).setOrigin(0, 0.5);
    const row = { tab, id, action, thumb: image, bolt, name, info, btn, label, divider, shown: true, boltWanted: false, flashUntil: 0 };
    row.parts = [image, name, info, btn, label, divider];
    btn.on('pointerup', () => {
      if (!this.root.visible || this.tab !== row.tab || !row.shown) return;
      let ok = false;
      if (row.action === 'hire') ok = this.onHire();
      else if (row.action) ok = this.onUpgrade(row.action);
      else if (row.id) ok = this.onBuy(row.id);
      if (ok) {
        row.flashUntil = s.time.now + 900;
        this.refresh();
      } else {
        s.tweens.add({ targets: [btn, label], x: '+=6', duration: 50, yoyo: true, repeat: 2 });
      }
    });
    this.root.add([...row.parts, bolt]);
    return row;
  }

  get visible() {
    return this.root.visible;
  }

  setVisible(on) {
    if (on === this.root.visible) return;
    this.root.setVisible(on);
    if (on) this.refresh();
  }

  /** True if the pointer is over the panel, so taps there don't move the player. */
  contains(pointer) {
    return this.root.visible && pointer.x >= X && pointer.x <= X + W && pointer.y >= Y && pointer.y <= Y + this.height;
  }

  get buttons() {
    return this.rows.map((r) => r.btn);
  }

  refresh() {
    if (this.tab === 'gear') this.refreshGear();
    else this.refreshUpgrades();
    // Only the current tab's rows are visible and tappable.
    for (const row of this.rows) {
      const on = row.tab === this.tab && row.shown;
      for (const part of row.parts) part.setVisible(on);
      row.thumb.setVisible(on && !row.boltWanted);
      row.bolt.setVisible(on && row.boltWanted);
      if (on) row.btn.setInteractive({ useHandCursor: true });
      else row.btn.disableInteractive();
    }
    this.ordersText.setVisible(this.tab === 'gear');
    this.agentText.setVisible(this.tab === 'upgrades');
  }

  setButton(row, text, canBuy) {
    if (this.scene.time.now < row.flashUntil) text = row.action === 'hire' ? 'Hired!' : row.action ? 'Upgraded!' : 'Ordered!';
    row.btn.setFillStyle(canBuy ? GREEN : GREY);
    row.label.setText(text).setFontSize(text.startsWith('$') ? 20 : 15);
    row.label.setColor(canBuy ? '#ffffff' : '#94a3b8');
  }

  refreshGear() {
    const { next, pending } = this.getPower();
    this.refreshPowerRow(next, pending);
    const power = gameState.power;

    for (const row of this.rows) {
      if (row.tab !== 'gear') continue;
      const item = row.id ? orderable(row.id) : null;
      const waiting = row === this.powerRow && pending;
      let text = item ? `$${item.price}` : 'Maxed';
      if (waiting) text = 'On the way';
      this.setButton(row, text, Boolean(item) && !waiting && gameState.cash >= item.price);

      // Machines: warn if it would push you over your power supply's limit.
      if (row !== this.powerRow) {
        const kind = { bounty: 'Bug bounties', agents: 'AI agent jobs' }[item.earns?.jobs] ?? 'Hustles';
        const over = power.used + item.watts > power.capacity;
        row.info.setText(`${kind} · ${item.watts} W${over ? ' (over limit)' : ''} · ${item.deliverySeconds}s`);
        row.info.setColor(over ? '#fca5a5' : '#94a3b8');
      }
    }

    const orders = this.getOrders();
    const lines = orders.slice(0, 3).map((o) => `${orderable(o.itemId).name}: arriving in ${Math.ceil(o.remaining)}s`);
    if (orders.length > 3) lines.push(`+${orders.length - 3} more on the way`);
    this.ordersText.setText(lines.length ? lines.join('\n') : 'No deliveries on the way.');
    this.ordersText.setColor(lines.length ? '#fbbf24' : '#64748b');
  }

  // Always offers the next power supply up from the one you have.
  refreshPowerRow(next, pending) {
    const row = this.powerRow;
    row.id = next?.id ?? null;
    const icon = next?.icon;
    row.boltWanted = !icon;
    if (icon) {
      row.thumb.setTexture(icon);
      row.thumb.setScale(Math.min(56 / row.thumb.width, 56 / row.thumb.height));
    }
    row.name.setText(next ? `Power: ${next.name}` : 'Power: maxed out');
    let info = 'You have the best power supply.';
    if (next) info = pending ? 'Install it at the breaker panel' : `Up to ${next.capacity} W · goes on the breaker · ${next.deliverySeconds}s`;
    row.info.setText(info).setColor('#94a3b8');
  }

  refreshUpgrades() {
    const aug = this.getAugustus();
    const hired = aug.hired;
    this.hireRow.shown = !hired;
    for (const row of this.upgradeRows) row.shown = hired;

    if (!hired) {
      const coming = aug.arriving !== null;
      this.hireRow.name.setText('Hire Augustus');
      this.hireRow.info.setText(coming
        ? `On his way: floats in through the door in ${Math.ceil(aug.arriving)}s`
        : 'AI agent on a cloud. Works your machines and carries cash to the hamper.');
      this.setButton(this.hireRow, coming ? 'On the way' : `$${AUGUSTUS.hirePrice}`,
        !coming && gameState.cash >= AUGUSTUS.hirePrice);
      this.agentText.setText('More upgrades are coming, including ones for you.');
      return;
    }

    for (const row of this.upgradeRows) {
      const upgrade = AUGUSTUS_UPGRADES[row.action];
      const level = aug.levels[row.action];
      const maxed = level >= MAX_LEVEL;
      row.name.setText(`${upgrade.name} · level ${level}/${MAX_LEVEL}`);
      row.info.setText(maxed ? `${upgrade.describe(level)} (max)` : `Next: ${upgrade.describe(level + 1)}`);
      const price = maxed ? null : upgrade.prices[level];
      this.setButton(row, maxed ? 'Max' : `$${price}`, !maxed && gameState.cash >= price);
    }
    this.agentText.setText(`Augustus: ${aug.status}`);
  }
}
