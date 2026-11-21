import * as Phaser from 'phaser';
import { DORM } from '../data/dorm.js';
import { ITEMS, POWER_TIERS, SMALL_IMAGES } from '../data/catalog.js';
import { makeWalkableCheck, translatePolygon, centerY, pointInPolygon } from '../systems/geometry.js';
import { Joystick } from '../systems/Joystick.js';
import { Player, createPlayerAnimations } from '../systems/Player.js';
import { DEBUG } from '../systems/debug.js';
import { buildGrid, findPath } from '../systems/pathfinding.js';
import { gameState } from '../state/GameState.js';
import { asset } from '../systems/assets.js';

const ACCENT = 0x5ff0ff;

export class DormScene extends Phaser.Scene {
  constructor() {
    super('DormScene');
  }

  preload() {
    this.load.image(DORM.background, asset('rooms/dorm.jpg'));
    this.load.spritesheet('player', asset('player/zander.png'), { frameWidth: 32, frameHeight: 52 });
    for (const [id, item] of Object.entries(ITEMS)) this.load.image(`station-${id}`, asset(item.file));
    for (const [key, file] of Object.entries(SMALL_IMAGES)) this.load.image(key, asset(file));
  }

  create() {
    this.add.image(0, 0, DORM.background).setOrigin(0).setDepth(-10000);

    // Pixel art stays crisp when scaled up; the painted room stays smooth.
    this.textures.get('player').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Everything feet can't enter. Installing an item adds its footprint here,
    // and the walk check below always reads the current list.
    this.blocked = [...Object.values(DORM.obstacles)];
    const isWalkable = makeWalkableCheck(DORM.floor, this.blocked);

    createPlayerAnimations(this);
    const start = DORM.playerStart;
    this.player = new Player(this, start.x, start.y, isWalkable, start.facing);

    // Plots start empty; bought items get installed into them.
    this.plots = DORM.plots.map((def) => ({ ...def, itemId: null, sprite: null, footprint: null }));
    for (const plot of this.plots) plot.outline = this.drawPlotOutline(plot);
    this.rebuildNavigation();

    // Places you can walk up to and use.
    this.spots = [
      this.addSpot('stash', DORM.stash, 'Stash', 'item-cash'),
      this.addSpot('starterDesk', DORM.starterDesk, 'Shop'),
    ];

    this.keys = this.input.keyboard.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', left: 'LEFT', down: 'DOWN', right: 'RIGHT',
    });
    this.joystick = new Joystick(this, {
      onTap: (x, y) => this.setMoveTarget(x, y),
      isBlocked: (pointer) => this.scene.get('UIScene')?.isOverButton(pointer) ?? false,
    });
    this.moveTarget = null;
    // Floor ring that marks where a tap sent you.
    this.targetMarker = this.add.ellipse(0, 0, 40, 20)
      .setStrokeStyle(3, ACCENT, 0.9)
      .setDepth(-5000)
      .setVisible(false);

    this.addHint();
    this.scene.launch('UIScene');
    this.updatePowerUsage();
    if (DEBUG) this.setupDebug();
  }

  update(_time, delta) {
    const dt = Math.min(delta, 50) / 1000; // cap so a lag spike can't teleport you through walls
    let input = this.readInput();
    if (input.x !== 0 || input.y !== 0) this.clearMoveTarget(); // manual control wins
    else if (this.moveTarget) input = this.steerToTarget(dt);
    this.player.update(dt, input);
    this.updateSpots();

    if (this.hint && (input.x !== 0 || input.y !== 0)) {
      const hint = this.hint;
      this.hint = null;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }
    if (this.debugFeet) this.debugFeet.setPosition(this.player.x, this.player.y);
  }

  // ---------- Plots and items ----------

  // A glowing diamond on the floor with a "+" in the middle.
  drawPlotOutline(plot) {
    const { width: w, height: h } = DORM.plotSize;
    const pts = [
      { x: -w / 2, y: 0 }, { x: 0, y: -h / 2 }, { x: w / 2, y: 0 }, { x: 0, y: h / 2 },
    ];
    const g = this.add.graphics({ x: plot.x, y: plot.y }).setDepth(-6000);
    g.fillStyle(ACCENT, 0.08);
    g.fillPoints(pts, true);
    g.lineStyle(2, ACCENT, 0.7);
    g.strokePoints(pts, true);
    g.lineStyle(3, ACCENT, 0.6);
    g.lineBetween(-12, 0, 12, 0);
    g.lineBetween(0, -7, 0, 7);
    this.tweens.add({ targets: g, alpha: { from: 0.45, to: 1 }, duration: 1100, yoyo: true, repeat: -1 });
    return g;
  }

  /**
   * Installs an item into an empty plot: its sprite, plus its footprint as a
   * blocked area. Returns false if the plot is taken or you're standing in the way.
   * Call rebuildNavigation() afterwards.
   */
  placeItem(itemId, plotId) {
    const item = ITEMS[itemId];
    const plot = this.plots.find((p) => p.id === plotId);
    if (!item || !plot || plot.itemId) return false;

    // Line up the middle of the item's footprint with the middle of the plot.
    const fx = item.footprint.reduce((s, [x]) => s + x, 0) / item.footprint.length;
    const fy = centerY(item.footprint);
    const anchorX = Math.round(plot.x - fx);
    const anchorY = Math.round(plot.y - fy);
    const footprint = translatePolygon(item.footprint, anchorX, anchorY);
    if (pointInPolygon(this.player.x, this.player.y, footprint)) return false;

    // Drawn in depth order so the player can walk in front of or behind it.
    plot.sprite = this.add.image(anchorX, anchorY, `station-${itemId}`)
      .setOrigin(0.5, 1)
      .setDepth(centerY(footprint));
    plot.itemId = itemId;
    plot.footprint = footprint;
    plot.outline.setVisible(false);
    this.blocked.push(footprint);
    this.updatePowerUsage();
    return true;
  }

  /** Clears a plot (the shovel will use this). Returns the removed item's id. */
  removeItem(plotId) {
    const plot = this.plots.find((p) => p.id === plotId);
    if (!plot || !plot.itemId) return null;
    const itemId = plot.itemId;
    plot.sprite.destroy();
    this.blocked.splice(this.blocked.indexOf(plot.footprint), 1);
    Object.assign(plot, { itemId: null, sprite: null, footprint: null });
    plot.outline.setVisible(true);
    this.updatePowerUsage();
    return itemId;
  }

  updatePowerUsage() {
    const watts = this.plots.reduce((sum, p) => sum + (p.itemId ? ITEMS[p.itemId].watts : 0), 0);
    gameState.setPowerUsed(watts);
  }

  // Tap-to-move pathfinding needs to know when items appear or disappear.
  rebuildNavigation() {
    this.navGrid = buildGrid((x, y) => this.player.canStandAt(x, y), this.scale.width, this.scale.height);
    if (DEBUG) this.drawDebug();
  }

  // ---------- Places you can use (stash, shop) ----------

  addSpot(id, def, label, iconKey) {
    const container = this.add.container(def.labelX ?? def.x, def.labelY).setDepth(12000);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5);
    container.add(text);
    if (iconKey) {
      const icon = this.add.image(-text.width / 2 - 6, 0, iconKey).setOrigin(1, 0.5);
      container.add(icon);
    }
    container.setAlpha(0.55);
    this.tweens.add({ targets: container, y: def.labelY - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    return { id, def, container, near: false };
  }

  updateSpots() {
    for (const spot of this.spots) {
      const near = Math.hypot(this.player.x - spot.def.x, this.player.y - spot.def.y) < spot.def.reach;
      if (near === spot.near) continue;
      spot.near = near;
      spot.container.setAlpha(near ? 1 : 0.55).setScale(near ? 1.12 : 1);
      this.events.emit(near ? 'spot-enter' : 'spot-leave', spot.id);
    }
  }

  // ---------- Movement ----------

  setMoveTarget(x, y) {
    const path = findPath(this.navGrid, this.player.x, this.player.y, x, y);
    if (!path || path.length === 0) return;
    const end = path[path.length - 1];
    this.moveTarget = { path, x: path[0].x, y: path[0].y, best: Infinity, stuckFor: 0 };
    this.targetMarker.setPosition(end.x, end.y).setVisible(true).setAlpha(1);
  }

  clearMoveTarget() {
    if (!this.moveTarget) return;
    this.moveTarget = null;
    this.targetMarker.setVisible(false);
  }

  // Follow the path's waypoints to the tapped spot. Stop on arrival, or if
  // something keeps us from getting any closer for a moment.
  steerToTarget(dt) {
    const t = this.moveTarget;
    const dx = t.x - this.player.x;
    const dy = t.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      t.path.shift();
      if (t.path.length === 0) {
        this.clearMoveTarget();
        return { x: 0, y: 0 };
      }
      Object.assign(t, { x: t.path[0].x, y: t.path[0].y, best: Infinity, stuckFor: 0 });
      return this.steerToTarget(dt);
    }
    if (dist < t.best - 1) {
      t.best = dist;
      t.stuckFor = 0;
    } else {
      t.stuckFor += dt;
      if (t.stuckFor > 0.35) {
        this.clearMoveTarget();
        return { x: 0, y: 0 };
      }
    }
    return { x: dx / dist, y: dy / dist };
  }

  readInput() {
    if (this.joystick.active) return this.joystick.vector;
    const k = this.keys;
    const x = (k.d.isDown || k.right.isDown ? 1 : 0) - (k.a.isDown || k.left.isDown ? 1 : 0);
    const y = (k.s.isDown || k.down.isDown ? 1 : 0) - (k.w.isDown || k.up.isDown ? 1 : 0);
    return { x, y };
  }

  addHint() {
    const touch = this.sys.game.device.input.touch;
    const text = touch
      ? 'Tap where to go, or drag to steer'
      : 'Move: WASD / arrow keys, click where to go, or click and drag';
    this.hint = this.add.text(this.scale.width / 2, 110, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5, 0).setDepth(20000);
  }

  // ---------- Debug (?debug or #debug) ----------
  // green = walkable floor, red = blocked, cyan = plots, yellow dot = your feet.
  // Keys: B fill empty plots, R remove everything, M +$100, P next power supply.
  setupDebug() {
    this.debugGfx = this.add.graphics().setDepth(15000);
    this.debugFeet = this.add.circle(this.player.x, this.player.y, 5, 0xffff00).setDepth(15001);
    const order = ['folding-laptop', 'dual-monitor-desk', 'laptop-desk', 'server-rack', 'folding-laptop'];
    this.input.keyboard.on('keydown-B', () => {
      let placed = false;
      this.plots.forEach((plot, i) => { placed = this.placeItem(order[i % order.length], plot.id) || placed; });
      if (placed) this.rebuildNavigation();
    });
    this.input.keyboard.on('keydown-R', () => {
      for (const plot of this.plots) this.removeItem(plot.id);
      this.rebuildNavigation();
    });
    this.input.keyboard.on('keydown-M', () => gameState.addCash(100));
    this.input.keyboard.on('keydown-P', () => gameState.setPowerTier((gameState.powerTier + 1) % POWER_TIERS.length));
    this.drawDebug();
  }

  drawDebug() {
    const g = this.debugGfx;
    if (!g) return;
    const pts = (shape) => shape.map(([x, y]) => ({ x, y }));
    g.clear();
    g.lineStyle(3, 0x00ff66, 0.9);
    g.strokePoints(pts(DORM.floor), true);
    g.lineStyle(2, 0xff3355, 0.9);
    for (const shape of this.blocked) g.strokePoints(pts(shape), true);
    g.lineStyle(2, 0xffd000, 0.8);
    for (const spot of [DORM.stash, DORM.starterDesk, DORM.deliverySpot]) {
      g.strokeCircle(spot.x, spot.y, spot.reach ?? 20);
    }
  }
}
