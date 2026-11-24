// The shop screen: opens when you stand at the corner laptop (after it unlocks).
// Three tabs:
//   Machines (tab id 'gear'): machines; orders arrive later as a box at the door.
//   Room: the next power upgrade, foam panels and box fans (each box goes where it's used).
//   Agents: hire AI agents (up to MAX_AGENTS, any mix) and upgrade each type. Pick a type with the chips.
//   You: your own upgrades (carry limit, walking speed, work speed).

import { ITEMS, FOAM_MAX_LEVEL, FOAM_QUIET_PER_LEVEL, FAN, orderable } from '../data/catalog.js';
import { AGENT_TYPES, AGENT_TYPE_IDS, AGENT_LEVEL_MAX, MAX_AGENTS } from '../data/agents.js';
import { PLAYER_UPGRADES, PLAYER_MAX_LEVEL, PLAYER_UPGRADE_IDS } from '../data/playerUpgrades.js';
import { gameState } from '../state/GameState.js';

// Hacker-terminal look: green on black, monospace, scanlines, a blinking cursor.
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace';
const T = {
  bg: 0x020805, // near-black
  line: 0x39ff6a, // phosphor green (borders, active tab)
  text: '#7dff9b', // bright green
  dim: '#2fae5a', // secondary text
  faint: '#1d6b3a', // disabled text
  warn: '#e5ff66', // deliveries on the way
  err: '#ff6b6b', // over the power limit
  btnOn: 0x0f3d1f, // a button you can press
  btnOff: 0x07110a, // a button you can't
};
const X = 20;
const Y = 100;
const W = 520;
const ROW_H = 84;
const HEADER_H = 100; // prompt line, tabs, comment line
const CHIPS_H = 40; // the agent-type picker at the top of the Agents tab
const TEXT_W = W - 90 - 122; // leave room for the price button (monospace text is wide)
const TAB_CMD = { gear: './shop --tab=machines', room: './shop --tab=room', agents: './shop --tab=agents', you: './shop --tab=you' };

const PLAYER_THUMBS = { carry: ['item-cash', undefined, 1.3], speed: ['player', 0, 1.1], work: ['player', 36, 1.1] }; // 36 = working (back view)
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
    // onBuy, getOrders, getPower, getFoam, getFans, getAgents, onHire, onAgentUpgrade, getPlayerLevels, onPlayerUpgrade
    Object.assign(this, callbacks);
    const ids = Object.keys(ITEMS);
    const rowCount = Math.max(ids.length, 5); // the tallest tab (machines; agents need about 5 rows too)
    this.height = HEADER_H + rowCount * ROW_H + 56;

    this.root = scene.add.container(X, Y).setDepth(30000).setVisible(false);
    const bg = scene.add.graphics();
    bg.fillStyle(T.bg, 0.97);
    bg.fillRoundedRect(0, 0, W, this.height, 6);
    bg.lineStyle(2, T.line, 0.85);
    bg.strokeRoundedRect(0, 0, W, this.height, 6);
    this.root.add(bg);
    // Prompt line: root@dorm:~$ ./shop --tab=machines█
    this.prompt = scene.add.text(16, 10, '', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: T.text });
    this.cursor = scene.add.text(16, 10, '█', { fontFamily: FONT, fontSize: '17px', color: T.text });
    this.subtitle = scene.add.text(16, 76, '', { fontFamily: FONT, fontSize: '13px', color: T.dim, wordWrap: { width: W - 32 } });
    this.root.add([this.prompt, this.cursor, this.subtitle]);
    const tabW = (W - 32 - 3 * 8) / 4;
    this.tabButtons = [
      ['gear', 'machines'], ['room', 'room'], ['agents', 'agents'], ['you', 'you'],
    ].map(([id, label], i) => this.addButton(16 + i * (tabW + 8), 38, tabW, 30, label, () => this.setTab(id), id));

    // Machines tab.
    this.rows = ids.map((id, i) => this.addRow(HEADER_H + i * ROW_H, { tab: 'gear', id, thumb: [`station-${id}`] }));
    // Room tab: power, foam, fans.
    this.powerRow = this.addRow(HEADER_H, { tab: 'room', id: null, thumb: ['item-power-strip'] });
    this.foamRow = this.addRow(HEADER_H + ROW_H, { tab: 'room', id: null, thumb: ['foam-charcoal', undefined, 1.1] });
    this.fanRow = this.addRow(HEADER_H + 2 * ROW_H, { tab: 'room', id: FAN.id, thumb: [FAN.icon] });
    this.rows.push(this.powerRow, this.foamRow, this.fanRow);
    this.ordersText = scene.add.text(20, HEADER_H + rowCount * ROW_H + 8, '', {
      fontFamily: FONT, fontSize: '14px', color: T.warn, lineSpacing: 4,
    });

    // Agents tab: a chip per agent type, then that type's hire row and upgrades.
    this.agentType = AGENT_TYPE_IDS[0];
    this.agentChips = AGENT_TYPE_IDS.map((type, i) =>
      this.addButton(20 + i * 126, HEADER_H, 116, 32, AGENT_TYPES[type].name, () => this.pickAgentType(type), type));
    this.agentCount = scene.add.text(W - 20, HEADER_H + 16, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: T.text })
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
      fontFamily: FONT, fontSize: '13px', color: T.dim, lineSpacing: 3, wordWrap: { width: W - 40 },
    });

    // You tab.
    this.playerRows = PLAYER_UPGRADE_IDS.map((key, i) =>
      this.addRow(HEADER_H + i * ROW_H, { tab: 'you', action: `you:${key}`, thumb: PLAYER_THUMBS[key] }));
    this.rows.push(...this.playerRows);

    this.root.add([this.ordersText, this.agentCount, this.rosterText]);

    // CRT scanlines over everything (not interactive, so taps go through).
    const scan = scene.add.graphics();
    scan.fillStyle(0x000000, 0.22);
    for (let y = 2; y < this.height; y += 3) scan.fillRect(2, y, W - 4, 1);
    this.root.add(scan);

    // Blinking cursor: about once a second (well under the 2 flashes/s photosensitivity limit).
    scene.time.addEvent({ delay: 530, loop: true, callback: () => this.cursor.setVisible(!this.cursor.visible) });
    this.typing = null;
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.setTab('gear');
  }

  // The prompt types its command out, like a terminal.
  typePrompt(cmd, instant = false) {
    const full = `root@dorm:~$ ${cmd}`;
    this.typing?.remove();
    const base = 'root@dorm:~$ ';
    const show = (n) => {
      this.prompt.setText(full.slice(0, n));
      this.cursor.setX(this.prompt.x + this.prompt.width + 2);
    };
    if (instant || this.reducedMotion) {
      show(full.length);
      return;
    }
    let n = base.length;
    show(n);
    this.typing = this.scene.time.addEvent({
      delay: 14, repeat: full.length - n - 1,
      callback: () => { n += 1; show(n); },
    });
  }

  // A small toggle button (tabs and agent chips).
  addButton(x, y, width, height, label, onTap, id) {
    const s = this.scene;
    const btn = s.add.rectangle(x, y, width, height, T.btnOff).setOrigin(0, 0).setStrokeStyle(1, T.line, 0.6)
      .setInteractive({ useHandCursor: true });
    const text = s.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: T.dim,
    }).setOrigin(0.5);
    btn.on('pointerup', () => {
      if (this.root.visible && btn.input?.enabled) onTap();
    });
    this.root.add([btn, text]);
    return { id, btn, text };
  }

  styleButton({ btn, text }, active) {
    btn.setFillStyle(active ? T.line : T.btnOff);
    text.setColor(active ? '#02140a' : T.dim);
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of this.tabButtons) this.styleButton(b, b.id === tab);
    this.subtitle.setText('# ' + {
      gear: 'Machines come as a box. Carry it to an empty plot.',
      room: 'Room upgrades come as a box too. Carry it where it goes.',
      agents: `Up to ${MAX_AGENTS} agents, any mix. Upgrades apply to the type.`,
      you: 'Upgrades for you. They work right away.',
    }[tab]);
    this.typePrompt(TAB_CMD[tab], !this.root.visible);
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
    const name = s.add.text(90, y + 12, id ? orderable(id)?.name ?? '' : '', {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: T.text, wordWrap: { width: TEXT_W },
    });
    const info = s.add.text(90, y + 40, '', {
      fontFamily: FONT, fontSize: '12px', color: T.dim, wordWrap: { width: TEXT_W },
    });
    const btn = s.add.rectangle(W - 64, y + ROW_H / 2, 96, 46, T.btnOn).setStrokeStyle(1, T.line, 0.8).setInteractive({ useHandCursor: true });
    const label = s.add.text(W - 64, y + ROW_H / 2, '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: T.text,
    }).setOrigin(0.5);
    const divider = s.add.rectangle(20, y + ROW_H - 1, W - 40, 1, T.line, 0.12).setOrigin(0, 0.5);
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

  /** Open (or opening). While it's closing it already counts as closed. */
  get visible() {
    return Boolean(this.wantOpen);
  }

  /** Opens with a CRT power-on, closes with a CRT power-off. */
  setVisible(on) {
    if (on === this.wantOpen) return;
    this.wantOpen = on;
    if (on) this.powerOn();
    else this.powerOff();
  }

  // A bright line sweeps across the middle, opens up into the screen, then the text types in.
  // One gentle flash, no strobing (photosensitivity). About half a second.
  powerOn() {
    const s = this.scene;
    s.tweens.killTweensOf(this.root);
    this.beam?.destroy();
    this.root.setVisible(true).setAlpha(1).setScale(1);
    this.root.y = Y;
    this.refresh();
    this.typePrompt(TAB_CMD[this.tab]);
    if (this.reducedMotion) return;
    const midY = Y + this.height / 2;
    this.root.setScale(1, 0.01);
    this.root.y = midY;
    const keepCentered = () => { this.root.y = midY - (this.height * this.root.scaleY) / 2; };
    // The beam: a bright core line with a soft green glow around it.
    this.beam = s.add.container(X + W / 2, midY).setDepth(30001);
    const glow = s.add.rectangle(0, 0, 4, 14, T.line, 0.25);
    const core = s.add.rectangle(0, 0, 4, 3, 0xeaffef, 1);
    this.beam.add([glow, core]);
    s.tweens.add({
      targets: [glow, core], width: W, duration: 130, ease: 'Cubic.out',
      onComplete: () => {
        s.tweens.add({ targets: this.beam, alpha: 0, duration: 220, onComplete: () => this.beam?.destroy() });
        s.tweens.add({ targets: this.root, scaleY: 1, duration: 220, ease: 'Cubic.out', onUpdate: keepCentered, onComplete: keepCentered });
      },
    });
    // The rows on this tab fade in one after another.
    const rows = this.rows.filter((r) => this.isOn(r));
    rows.forEach((row, i) => {
      for (const part of row.parts) part.setAlpha(0);
      row.thumb.setAlpha(0);
      s.tweens.add({ targets: [...row.parts, row.thumb], alpha: 1, duration: 140, delay: 300 + i * 45 });
    });
  }

  // The screen squashes to a line, then to a dot, and goes dark.
  powerOff() {
    const s = this.scene;
    this.typing?.remove();
    s.tweens.killTweensOf(this.root);
    this.beam?.destroy();
    if (!this.root.visible) return;
    if (this.reducedMotion) {
      this.root.setVisible(false);
      return;
    }
    const midY = Y + this.height / 2;
    s.tweens.add({
      targets: this.root, scaleY: 0.01, duration: 140, ease: 'Cubic.in',
      onUpdate: () => { this.root.y = midY - (this.height * this.root.scaleY) / 2; },
      onComplete: () => {
        s.tweens.add({
          targets: this.root, scaleX: 0, alpha: 0, duration: 110, ease: 'Cubic.in',
          onUpdate: () => { this.root.x = X + (W * (1 - this.root.scaleX)) / 2; },
          onComplete: () => {
            this.root.setVisible(false).setScale(1).setAlpha(1);
            this.root.x = X;
            this.root.y = Y;
          },
        });
      },
    });
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
    else if (this.tab === 'room') this.refreshRoom();
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
    this.ordersText.setVisible(this.tab === 'gear' || this.tab === 'room');
  }

  setButton(row, text, canBuy) {
    if (this.scene.time.now < row.flashUntil) text = row.action === 'hire' ? 'Hired!' : row.action ? 'Upgraded!' : 'Ordered!';
    row.btn.setFillStyle(canBuy ? T.btnOn : T.btnOff);
    row.btn.setStrokeStyle(1, T.line, canBuy ? 0.8 : 0.25);
    row.label.setText(text).setFontSize(text.startsWith('$') ? 18 : 13);
    row.label.setColor(canBuy ? T.text : T.faint);
  }

  refreshGear() {
    const power = gameState.power;
    for (const row of this.rows) {
      if (row.tab !== 'gear') continue;
      const item = orderable(row.id);
      this.setButton(row, `$${item.price}`, gameState.cash >= item.price);
      // Warn if it would push you over your power supply's limit.
      const kind = { bounty: 'Bug bounties', agents: 'AI agent jobs', training: 'AI model training' }[item.earns?.jobs] ?? 'Hustles';
      const over = power.used + item.watts > power.capacity;
      row.info.setText(`${kind} · ${item.watts} W${over ? ' (over limit)' : ''} · ${item.deliverySeconds}s`);
      row.info.setColor(over ? T.err : T.dim);
    }
    this.refreshOrders();
  }

  refreshRoom() {
    const { next, pending } = this.getPower();
    this.refreshPowerRow(next, pending);
    const foam = this.getFoam();
    this.refreshFoamRow(foam);
    for (const [row, waiting] of [[this.powerRow, pending], [this.foamRow, foam.pending]]) {
      const item = row.id ? orderable(row.id) : null;
      const text = waiting ? 'On the way' : item ? `$${item.price}` : 'Maxed';
      this.setButton(row, text, Boolean(item) && !waiting && gameState.cash >= item.price);
    }
    this.refreshFanRow(this.getFans());
    this.refreshOrders();
  }

  // One fan per machine: offered while some machine still has none (counting fans on the way).
  refreshFanRow({ machines, withFan, pending }) {
    const row = this.fanRow;
    const needed = machines - withFan - pending;
    row.name.setText(machines ? `${FAN.name} (${withFan}/${machines} machines)` : FAN.name);
    const pct = (n) => Math.round(Math.abs(1 - n) * 100);
    let info = `Heats ${pct(FAN.heatSlower)}% slower, cools ${pct(FAN.coolFaster)}% faster · +${FAN.noise} noise · ${FAN.watts} W · clips onto a machine`;
    const without = machines - withFan;
    if (!machines) info = 'Clips onto a machine: buy a machine first';
    else if (!without) info = pending ? 'Every machine has a fan (a spare one is at the door)' : 'Every machine has a fan';
    else if (needed <= 0) info = 'On the way: carry the box to a machine without a fan';
    row.info.setText(info).setColor(T.dim);
    let text = `$${FAN.price}`;
    if (needed <= 0) text = pending && without ? 'On the way' : 'All set';
    this.setButton(row, text, needed > 0 && gameState.cash >= FAN.price);
  }

  refreshOrders() {
    const orders = this.getOrders();
    // Two lines at most, so the list fits under the rows.
    const lines = orders.slice(0, 2).map((o) => `${orderable(o.itemId).name}: arriving in ${Math.ceil(o.remaining)}s`);
    if (orders.length > 2) lines[1] += `  (+${orders.length - 2} more)`;
    this.ordersText.setText(lines.length ? lines.join('\n') : 'No deliveries on the way.');
    this.ordersText.setColor(lines.length ? T.warn : T.faint);
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
    row.info.setText(info).setColor(T.dim);
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
    row.info.setText(info).setColor(T.dim);
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
      else if (full) line = `You have ${info.max} agents, the most the dorm can run.`;
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
