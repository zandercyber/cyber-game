// The shop screen: opens when you stand at the corner laptop (after $100).
// Lists machines plus the next power upgrade; orders arrive later as a box at the door.

import { ITEMS, orderable } from '../data/catalog.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const X = 20;
const Y = 100;
const W = 520;
const ROW_H = 86;
const HEADER_H = 70;
const TEXT_W = W - 96 - 140; // leave room for the price button

export class ShopPanel {
  constructor(scene, { onBuy, getOrders, getPower }) {
    this.scene = scene;
    this.onBuy = onBuy;
    this.getOrders = getOrders;
    this.getPower = getPower; // () => ({ next, pending })
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
    this.root.add(scene.add.text(20, 16, 'Shop', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#5ff0ff' }));
    this.root.add(scene.add.text(20, 48, 'Orders arrive as a box at the door. Carry the box to where it goes.', {
      fontFamily: FONT, fontSize: '14px', color: '#94a3b8',
    }));

    this.rows = ids.map((id, i) => this.addRow(HEADER_H + i * ROW_H, id));
    this.powerRow = this.addRow(HEADER_H + ids.length * ROW_H, null);
    this.rows.push(this.powerRow);
    this.ordersText = scene.add.text(20, HEADER_H + rowCount * ROW_H + 14, '', {
      fontFamily: FONT, fontSize: '15px', color: '#fbbf24', lineSpacing: 4,
    });
    this.root.add(this.ordersText);
  }

  // One row: picture, name, info line, and a price button. The power row's
  // contents change as you upgrade (see refreshPowerRow).
  addRow(y, id) {
    const s = this.scene;
    const thumb = s.add.image(52, y + ROW_H / 2, id ? `station-${id}` : 'item-power-strip');
    if (id) thumb.setScale(Math.min(64 / thumb.width, 64 / thumb.height));
    const bolt = s.add.text(52, y + ROW_H / 2, '⚡', { fontSize: '40px' }).setOrigin(0.5).setVisible(false);
    const name = s.add.text(96, y + 14, id ? ITEMS[id].name : '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e6f4ff', wordWrap: { width: TEXT_W },
    });
    const info = s.add.text(96, y + 42, '', {
      fontFamily: FONT, fontSize: '14px', color: '#94a3b8', wordWrap: { width: TEXT_W },
    });
    const btn = s.add.rectangle(W - 72, y + ROW_H / 2, 108, 50, 0x16a34a).setInteractive({ useHandCursor: true });
    const label = s.add.text(W - 72, y + ROW_H / 2, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    const divider = s.add.rectangle(20, y + ROW_H - 1, W - 40, 1, 0xffffff, 0.08).setOrigin(0, 0.5);
    const row = { id, thumb, bolt, name, info, btn, label, flashUntil: 0 };
    btn.on('pointerup', () => {
      if (!this.root.visible || !row.id) return;
      if (this.onBuy(row.id)) {
        row.flashUntil = s.time.now + 900;
        this.refresh();
      } else {
        s.tweens.add({ targets: [btn, label], x: '+=6', duration: 50, yoyo: true, repeat: 2 });
      }
    });
    this.root.add([thumb, bolt, name, info, btn, label, divider]);
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
    const { next, pending } = this.getPower();
    this.refreshPowerRow(next, pending);
    const power = gameState.power;

    for (const row of this.rows) {
      const item = row.id ? orderable(row.id) : null;
      const waiting = row === this.powerRow && pending;
      const canBuy = item && !waiting && gameState.cash >= item.price;
      let text = item ? `$${item.price}` : 'Maxed';
      if (waiting) text = 'On the way';
      if (this.scene.time.now < row.flashUntil) text = 'Ordered!';
      row.btn.setFillStyle(canBuy ? 0x16a34a : 0x334155);
      row.label.setText(text).setFontSize(text.startsWith('$') || text === 'Ordered!' ? 20 : 16);
      row.label.setColor(canBuy ? '#ffffff' : '#94a3b8');

      // Machines: warn if it would push you over your power supply's limit.
      if (row !== this.powerRow) {
        const kind = item.earns?.mode === 'idle' ? 'Earns on its own' : item.earns?.jobs === 'bounty' ? 'Bug bounties' : 'Hustles';
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
    row.thumb.setVisible(Boolean(icon));
    row.bolt.setVisible(!icon);
    if (icon) {
      row.thumb.setTexture(icon);
      row.thumb.setScale(Math.min(56 / row.thumb.width, 56 / row.thumb.height));
    }
    row.name.setText(next ? `Power: ${next.name}` : 'Power: maxed out');
    let info = 'You have the best power supply.';
    if (next) info = pending ? 'Install it at the breaker panel' : `Up to ${next.capacity} W · goes on the breaker · ${next.deliverySeconds}s`;
    row.info.setText(info).setColor('#94a3b8');
  }
}
