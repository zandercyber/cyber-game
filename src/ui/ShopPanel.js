// The shop screen: opens when you stand at the corner laptop (after $100).
// Lists what you can buy; orders arrive later as a box at the door.

import { ITEMS } from '../data/catalog.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const X = 20;
const Y = 100;
const W = 520;
const ROW_H = 86;
const HEADER_H = 70;

export class ShopPanel {
  constructor(scene, { onBuy, getOrders }) {
    this.scene = scene;
    this.onBuy = onBuy;
    this.getOrders = getOrders;
    this.ids = Object.keys(ITEMS);
    this.height = HEADER_H + this.ids.length * ROW_H + 64;

    this.root = scene.add.container(X, Y).setDepth(30000).setVisible(false);
    const bg = scene.add.graphics();
    bg.fillStyle(0x0b0e14, 0.94);
    bg.fillRoundedRect(0, 0, W, this.height, 14);
    bg.lineStyle(2, 0x5ff0ff, 0.6);
    bg.strokeRoundedRect(0, 0, W, this.height, 14);
    this.root.add(bg);
    this.root.add(scene.add.text(20, 16, 'Shop', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#5ff0ff' }));
    this.root.add(scene.add.text(20, 48, 'Orders arrive as a box at the door. Carry the box to an empty plot.', {
      fontFamily: FONT, fontSize: '14px', color: '#94a3b8',
    }));

    this.rows = this.ids.map((id, i) => this.addRow(id, HEADER_H + i * ROW_H));
    this.ordersText = scene.add.text(20, HEADER_H + this.ids.length * ROW_H + 14, '', {
      fontFamily: FONT, fontSize: '15px', color: '#fbbf24', lineSpacing: 4,
    });
    this.root.add(this.ordersText);
  }

  addRow(id, y) {
    const s = this.scene;
    const item = ITEMS[id];
    const thumb = s.add.image(52, y + ROW_H / 2, `station-${id}`);
    thumb.setScale(Math.min(64 / thumb.width, 64 / thumb.height));
    const textWidth = W - 96 - 140; // leave room for the price button
    const name = s.add.text(96, y + 14, item.name, {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e6f4ff', wordWrap: { width: textWidth },
    });
    const kind = item.earns?.mode === 'idle' ? 'Earns on its own' : item.earns?.jobs === 'bounty' ? 'Bug bounties' : 'Hustles';
    const info = s.add.text(96, y + 42, `${kind} · ${item.watts} W · ${item.deliverySeconds}s`, {
      fontFamily: FONT, fontSize: '14px', color: '#94a3b8', wordWrap: { width: textWidth },
    });
    const btn = s.add.rectangle(W - 72, y + ROW_H / 2, 108, 50, 0x16a34a).setInteractive({ useHandCursor: true });
    const label = s.add.text(W - 72, y + ROW_H / 2, `$${item.price}`, {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    const divider = s.add.rectangle(20, y + ROW_H - 1, W - 40, 1, 0xffffff, 0.08).setOrigin(0, 0.5);
    const row = { id, btn, label, flashUntil: 0 };
    btn.on('pointerup', () => {
      if (!this.root.visible) return;
      if (this.onBuy(id)) {
        row.flashUntil = s.time.now + 900;
        this.refresh();
      } else {
        s.tweens.add({ targets: [btn, label], x: '+=6', duration: 50, yoyo: true, repeat: 2 });
      }
    });
    this.root.add([thumb, name, info, btn, label, divider]);
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
    for (const { id, btn, label, flashUntil } of this.rows) {
      const affordable = gameState.cash >= ITEMS[id].price;
      btn.setFillStyle(affordable ? 0x16a34a : 0x334155);
      label.setText(this.scene.time.now < flashUntil ? 'Ordered!' : `$${ITEMS[id].price}`);
      label.setColor(affordable ? '#ffffff' : '#94a3b8');
    }
    const orders = this.getOrders();
    const lines = orders.slice(0, 3).map((o) => `${ITEMS[o.itemId].name}: arriving in ${Math.ceil(o.remaining)}s`);
    if (orders.length > 3) lines.push(`+${orders.length - 3} more on the way`);
    this.ordersText.setText(lines.length ? lines.join('\n') : 'No deliveries on the way.');
    this.ordersText.setColor(lines.length ? '#fbbf24' : '#64748b');
  }
}
