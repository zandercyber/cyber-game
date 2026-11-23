// The shop screen: opens when you stand at the corner laptop (after it unlocks).
// Three tabs:
//   Gear: machines plus the next power upgrade and foam panels; orders arrive later as a box at the door.
//   Agents: hire AI agents (up to 3, any mix) and upgrade each type. Pick a type with the chips.
//   You: your own upgrades (carry limit, speed).

import { ITEMS, FOAM_MAX_LEVEL, FOAM_QUIET_PER_LEVEL, orderable } from '../data/catalog.js';
import { AGENT_TYPES, AGENT_TYPE_IDS, AGENT_LEVEL_MAX } from '../data/agents.js';
import { PLAYER_UPGRADES, PLAYER_MAX_LEVEL, PLAYER_UPGRADE_IDS } from '../data/playerUpgrades.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const X = 20;
const Y = 100;
const W = 520;
const ROW_H = 86;
const HEADER_H = 70;
const CHIPS_H = 40; // the agent-type picker at the top of the Agents tab
const TEXT_W = W - 96 - 140; // leave room for the price button
const GREEN = 0x16a34a;
const GREY = 0x334155;
const ACTIVE = 0x0e7490;

const PLAYER_THUMBS = { carry: ['item-cash', undefined, 1.3], speed: ['player', 0, 1.1] };
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// Thumbnail per agent upgrade: the agent's own frames (speed = side view, energy = asleep).
function agentThumb(type, kind) {
  const { texture, frames } = AGENT_TYPES[type];
  const frame = { speed: frames.side, energy: frames.sleep?.[0], stability: frames.rogueFront }[kind] ?? frames.front;
  return [texture, frame, 2.4];
}

export class ShopPanel {
  constructor(scene, callbacks) {
    this.scene = scene;
    // onBuy, getOrders, getPower, getFoam, getAgents, onHire, onAgentUpgrade, getPlayerLevels, onPlayerUpgrade
    Object.assign(this, callbacks);
    const ids = Object.keys(ITEMS);
    const rowCount = ids.length + 2; // machines + a power row + a foam row
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
    this.tabButtons = [
      this.addButton(W - 316, 14, 96, 36, 'Gear', () => this.setTab('gear'), 'gear'),
      this.addButton(W - 212, 14, 96, 36, 'Agents', () => this.setTab('agents'), 'agents'),
      this.addButton(W - 108, 14, 88, 36, 'You', () => this.setTab('you'), 'you'),
    ];

    // Gear tab.
    this.rows = ids.map((id, i) => this.addRow(HEADER_H + i * ROW_H, { tab: 'gear', id, thumb: [`station-${id}`] }));
    this.powerRow = this.addRow(HEADER_H + ids.length * ROW_H, { tab: 'gear', id: null, thumb: ['item-power-strip'] });
    this.foamRow = this.addRow(HEADER_H + (ids.length + 1) * ROW_H, { tab: 'gear', id: null, thumb: ['foam-charcoal', undefined, 1.1] });
    this.rows.push(this.powerRow, this.foamRow);
    this.ordersText = scene.add.text(20, HEADER_H + rowCount * ROW_H + 14, '', {
      fontFamily: FONT, fontSize: '15px', color: '#fbbf24', lineSpacing: 4,
    });

    // Agents tab: a chip per agent type, then that type's hire row and upgrades.
    this.agentType = AGENT_TYPE_IDS[0];
    this.agentChips = AGENT_TYPE_IDS.map((type, i) =>
      this.addButton(20 + i * 126, HEADER_H, 116, 32, AGENT_TYPES[type].name, () => this.pickAgentType(type), type));
    this.agentCount = scene.add.text(W - 20, HEADER_H + 16, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#c4b5fd' })
      .setOrigin(1, 0.5);
    const top = HEADER_H + CHIPS_H;
    this.hireRows = {};
    this.agentRows = {};
    for (const type of AGENT_TYPE_IDS) {
      const { texture, frames, upgrades } = AGENT_TYPES[type];
      this.hireRows[type] = this.addRow(top, { tab: 'agents', agentType: type, action: 'hire', thumb: [texture, frames.front, 2.4] });
      this.agentRows[type] = Object.keys(upgrades).map((kind, i) =>
        this.addRow(top + (i + 1) * ROW_H, { tab: 'agents', agentType: type, action: kind, thumb: agentThumb(type, kind) }));
      this.rows.push(this.hireRows[type], ...this.agentRows[type]);
    }
    this.rosterText = scene.add.text(20, top + 4 * ROW_H + 10, '', {
      fontFamily: FONT, fontSize: '14px', color: '#c4b5fd', lineSpacing: 3, wordWrap: { width: W - 40 },
    });

    // You tab.
    this.playerRows = PLAYER_UPGRADE_IDS.map((key, i) =>
      this.addRow(HEADER_H + i * ROW_H, { tab: 'you', action: `you:${key}`, thumb: PLAYER_THUMBS[key] }));
    this.rows.push(...this.playerRows);

    this.root.add([this.ordersText, this.agentCount, this.rosterText]);
    this.setTab('gear');
  }

  // A small toggle button (tabs and agent chips).
  addButton(x, y, width, height, label, onTap, id) {
    const s = this.scene;
    const btn = s.add.rectangle(x, y, width, height, GREY).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = s.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#e6f4ff',
    }).setOrigin(0.5);
    btn.on('pointerup', () => {
      if (this.root.visible && btn.input?.enabled) onTap();
    });
    this.root.add([btn, text]);
    return { id, btn, text };
  }

  styleButton({ btn, text }, active) {
    btn.setFillStyle(active ? ACTIVE : GREY);
    text.setColor(active ? '#ffffff' : '#94a3b8');
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of this.tabButtons) this.styleButton(b, b.id === tab);
    this.subtitle.setText({
      gear: 'Orders arrive as a box at the door. Carry it to where it goes.',
      agents: 'Hire up to 3 agents, any mix. Upgrades apply to every agent of that type.',
      you: 'Upgrades take effect right away.',
    }[tab]);
    this.refresh();
  }

  pickAgentType(type) {
    this.agentType = type;
    this.refresh();
  }

  // One row: picture, name, info line, and a price button. Its text is filled in by refresh().
  addRow(y, { tab, id = null, action = null, agentType = null, thumb }) {
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
    const row = { tab, id, action, agentType, thumb: image, bolt, name, info, btn, label, shown: true, boltWanted: false, flashUntil: 0 };
    row.parts = [image, name, info, btn, label, divider];
    btn.on('pointerup', () => {
      if (!this.root.visible || !this.isOn(row)) return;
      let ok = false;
      if (row.action === 'hire') ok = this.onHire(row.agentType);
      else if (row.action?.startsWith('you:')) ok = this.onPlayerUpgrade(row.action.slice(4));
      else if (row.agentType) ok = this.onAgentUpgrade(row.agentType, row.action);
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

  isOn(row) {
    return row.tab === this.tab && row.shown && (!row.agentType || row.agentType === this.agentType);
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
    else if (this.tab === 'agents') this.refreshAgents();
    else this.refreshYou();
    // Only the current tab's rows are visible and tappable.
    for (const row of this.rows) {
      const on = this.isOn(row);
      for (const part of row.parts) part.setVisible(on);
      row.thumb.setVisible(on && !row.boltWanted);
      row.bolt.setVisible(on && row.boltWanted);
      if (on) row.btn.setInteractive({ useHandCursor: true });
      else row.btn.disableInteractive();
    }
    const agents = this.tab === 'agents';
    for (const chip of this.agentChips) {
      chip.btn.setVisible(agents);
      chip.text.setVisible(agents);
      if (agents) chip.btn.setInteractive({ useHandCursor: true });
      else chip.btn.disableInteractive();
      this.styleButton(chip, chip.id === this.agentType);
    }
    this.agentCount.setVisible(agents);
    this.rosterText.setVisible(agents);
    this.ordersText.setVisible(this.tab === 'gear');
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
    const foam = this.getFoam();
    this.refreshFoamRow(foam);
    const power = gameState.power;

    for (const row of this.rows) {
      if (row.tab !== 'gear') continue;
      const item = row.id ? orderable(row.id) : null;
      const waiting = (row === this.powerRow && pending) || (row === this.foamRow && foam.pending);
      let text = item ? `$${item.price}` : 'Maxed';
      if (waiting) text = 'On the way';
      this.setButton(row, text, Boolean(item) && !waiting && gameState.cash >= item.price);

      // Machines: warn if it would push you over your power supply's limit.
      if (row !== this.powerRow && row !== this.foamRow) {
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

  // Offers the next level of foam panels (3 levels).
  refreshFoamRow({ next, pending, level }) {
    const row = this.foamRow;
    row.id = next?.id ?? null;
    const pct = (n) => Math.round(n * FOAM_QUIET_PER_LEVEL * 100);
    row.name.setText(next ? `${next.name} (${next.level}/${FOAM_MAX_LEVEL})` : `Foam panels: maxed out`);
    let info = `Neighbor bothered ${pct(level)}% less. The wall is full.`;
    if (next) {
      info = pending
        ? 'Put them up: carry the box to the bed'
        : `Neighbor bothered ${pct(next.level)}% less${level ? ` (now ${pct(level)}%)` : ''} · goes on the wall above the bed · ${next.deliverySeconds}s`;
    }
    row.info.setText(info).setColor('#94a3b8');
  }

  refreshAgents() {
    const info = this.getAgents();
    const full = info.count >= info.max;
    this.agentCount.setText(`Agents ${info.count}/${info.max}`);
    this.rosterText.setText(info.roster.length ? info.roster.join('\n') : 'No agents yet.');

    for (const type of AGENT_TYPE_IDS) {
      const cfg = AGENT_TYPES[type];
      const t = info.types[type];
      const hire = this.hireRows[type];
      hire.name.setText(t.owned + t.coming ? `Hire another ${cfg.name}` : `Hire ${cfg.name}`);
      let line = cfg.blurb;
      if (t.coming) line = `On the way: floats in through the door in ${Math.ceil(t.nextArrival)}s`;
      else if (full) line = 'You have 3 agents, the most the dorm can run.';
      hire.info.setText(line);
      this.setButton(hire, full ? 'Full' : `$${t.nextPrice}`, !full && gameState.cash >= t.nextPrice);
      // Upgrades show once you have one of this type.
      for (const row of this.agentRows[type]) {
        row.shown = t.owned > 0;
        if (row.shown) this.refreshLevelRow(row, cfg.upgrades[row.action], t.levels[row.action], AGENT_LEVEL_MAX);
      }
    }
  }

  refreshYou() {
    const mine = this.getPlayerLevels();
    for (const row of this.playerRows) {
      const key = row.action.slice(4);
      this.refreshLevelRow(row, PLAYER_UPGRADES[key], mine[key], PLAYER_MAX_LEVEL);
    }
  }

  // Name with level, what the next level does, and its price.
  refreshLevelRow(row, upgrade, level, maxLevel) {
    const maxed = level >= maxLevel;
    row.name.setText(`${upgrade.name} · ${level}/${maxLevel}`);
    row.info.setText(maxed ? `${upgrade.describe(level)} (max)` : `Next: ${lowerFirst(upgrade.describe(level + 1))}`);
    const price = maxed ? null : upgrade.prices[level];
    this.setButton(row, maxed ? 'Max' : `$${price}`, !maxed && gameState.cash >= price);
  }
}
