import * as Phaser from 'phaser';
import { DORM } from '../data/dorm.js';
import { makeWalkableCheck, translatePolygon, centerY } from '../systems/geometry.js';
import { Joystick } from '../systems/Joystick.js';
import { Player, createPlayerAnimations } from '../systems/Player.js';
import { DEBUG } from '../systems/debug.js';

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

    this.keys = this.input.keyboard.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', left: 'LEFT', down: 'DOWN', right: 'RIGHT',
    });
    this.joystick = new Joystick(this);

    this.addHint();
    this.addFullscreenButton();
    if (DEBUG) this.drawDebug(blocked);
  }

  update(_time, delta) {
    const dt = Math.min(delta, 50) / 1000; // cap so a lag spike can't teleport you through walls
    const input = this.readInput();
    this.player.update(dt, input);

    if (this.hint && (input.x !== 0 || input.y !== 0)) {
      const hint = this.hint;
      this.hint = null;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }
    if (this.debugFeet) this.debugFeet.setPosition(this.player.x, this.player.y);
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
    const text = touch ? 'Drag anywhere to move' : 'Move: WASD / arrow keys, or click and drag';
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
