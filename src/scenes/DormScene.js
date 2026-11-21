import * as Phaser from 'phaser';
import { DORM } from '../data/dorm.js';
import { makeWalkableCheck, translatePolygon, centerY } from '../systems/geometry.js';
import { Joystick } from '../systems/Joystick.js';
import { Player, createPlayerAnimations } from '../systems/Player.js';
import { DEBUG } from '../systems/debug.js';
import { buildGrid, findPath } from '../systems/pathfinding.js';

export class DormScene extends Phaser.Scene {
  constructor() {
    super('DormScene');
  }

  preload() {
    this.load.image(DORM.background, 'assets/rooms/dorm.jpg');
    this.load.spritesheet('player', 'assets/player/zander.png', { frameWidth: 32, frameHeight: 52 });
    for (const station of DORM.stations) {
      this.load.image(station.texture, `assets/stations/${station.id}.png`);
    }
  }

  create() {
    this.add.image(0, 0, DORM.background).setOrigin(0).setDepth(-10000);

    // Pixel art stays crisp when scaled up; the painted room stays smooth.
    this.textures.get('player').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Stations: drawn in depth order so the player can walk in front of or behind them.
    const stationFootprints = DORM.stations.map((station) => {
      const footprint = translatePolygon(station.footprint, station.x, station.y);
      this.add.image(station.x, station.y, station.texture)
        .setOrigin(0.5, 1)
        .setDepth(centerY(footprint));
      return footprint;
    });

    const blocked = [...Object.values(DORM.obstacles), ...stationFootprints];
    const isWalkable = makeWalkableCheck(DORM.floor, blocked);

    createPlayerAnimations(this);
    const start = DORM.playerStart;
    this.player = new Player(this, start.x, start.y, isWalkable, start.facing);
    this.navGrid = buildGrid((x, y) => this.player.canStandAt(x, y), this.scale.width, this.scale.height);

    this.keys = this.input.keyboard.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', left: 'LEFT', down: 'DOWN', right: 'RIGHT',
    });
    this.joystick = new Joystick(this, { onTap: (x, y) => this.setMoveTarget(x, y) });
    this.moveTarget = null;
    // Floor ring that marks where a tap sent you.
    this.targetMarker = this.add.ellipse(0, 0, 40, 20)
      .setStrokeStyle(3, 0x5ff0ff, 0.9)
      .setDepth(-5000)
      .setVisible(false);

    this.addHint();
    this.addFullscreenButton();
    if (DEBUG) this.drawDebug(blocked);
  }

  update(_time, delta) {
    const dt = Math.min(delta, 50) / 1000; // cap so a lag spike can't teleport you through walls
    let input = this.readInput();
    if (input.x !== 0 || input.y !== 0) this.clearMoveTarget(); // manual control wins
    else if (this.moveTarget) input = this.steerToTarget(dt);
    this.player.update(dt, input);

    if (this.hint && (input.x !== 0 || input.y !== 0)) {
      const hint = this.hint;
      this.hint = null;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }
    if (this.debugFeet) this.debugFeet.setPosition(this.player.x, this.player.y);
  }

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
    this.hint = this.add.text(this.scale.width / 2, 40, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5, 0).setDepth(20000);
  }

  addFullscreenButton() {
    if (!this.scale.fullscreen.available) return;
    const button = this.add.text(this.scale.width - 24, 24, '⛶', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '40px',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 12, y: 4 },
    }).setOrigin(1, 0).setDepth(20000).setInteractive({ useHandCursor: true });
    button.on('pointerup', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });
  }

  // Open the game with ?debug to see walkable floor (green), blocked shapes (red) and your feet.
  drawDebug(blocked) {
    const g = this.add.graphics().setDepth(15000);
    g.lineStyle(3, 0x00ff66, 0.9);
    g.strokePoints(DORM.floor.map(([x, y]) => ({ x, y })), true);
    g.lineStyle(2, 0xff3355, 0.9);
    for (const shape of blocked) g.strokePoints(shape.map(([x, y]) => ({ x, y })), true);
    this.debugFeet = this.add.circle(this.player.x, this.player.y, 5, 0xffff00).setDepth(15001);
  }
}
