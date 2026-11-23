// The neighbor next door (numbers in src/data/neighbor.js).
//   calm     -> loses patience while you're too loud; bangs on the wall halfway
//   coming   -> a countdown: switch every machine off before they reach the door
//   visiting -> stands in the doorway; anything still running = a noise fine
//   leaving  -> fades out; then a grace period before they can get annoyed again
// Until Zander's art arrives, the neighbor is drawn as a simple stand-in figure.

import { NEIGHBOR, fineFor } from '../data/neighbor.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const DOOR = { x: 812, y: 342 }; // the doorway on the back wall, where they stand
const WALL = { x: 170, y: 210 }; // where the banging comes from (their side of the wall)

export class Neighbor {
  constructor(scene) {
    this.scene = scene;
    this.state = 'calm';
    this.annoyance = 0; // 0..100
    this.complaints = 0;
    this.grace = 0;
    this.timer = 0;
    this.warned = false;
    this.knockTimer = 0;

    this.figure = this.drawStandIn().setPosition(DOOR.x, DOOR.y).setDepth(DOOR.y).setVisible(false);
    this.bubble = scene.add.text(DOOR.x, DOOR.y - 100, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#0b0e14', backgroundColor: '#f8fafc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(12600).setVisible(false);
    this.countdown = scene.add.text(DOOR.x, 70, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fde68a', backgroundColor: '#0b0e14dd', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(12600).setVisible(false);
  }

  // A plain grumpy figure in a hoodie and pajama pants (placeholder art).
  drawStandIn() {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillStyle(0x7f1d1d, 1).fillRect(-14, -30, 12, 30).fillRect(2, -30, 12, 30); // plaid pants
    g.fillStyle(0x6b7280, 1).fillRoundedRect(-19, -66, 38, 40, 8); // hoodie
    g.fillStyle(0xe0b48c, 1).fillCircle(0, -78, 13); // head
    g.fillStyle(0x3f2a1d, 1).fillRect(-13, -93, 26, 8); // messy hair
    g.lineStyle(3, 0x1f2937, 1).lineBetween(-9, -83, -2, -80).lineBetween(9, -83, 2, -80); // angry eyebrows
    g.fillStyle(0xf8fafc, 1).fillRect(16, -52, 10, 12); // coffee mug
    return s.add.container(0, 0, [g]);
  }

  /** True while you're supposed to be quiet (they're coming or at the door). */
  get quiet() {
    return this.state === 'coming' || this.state === 'visiting';
  }

  /** noise: what your machines are making right now. */
  update(dt, noise) {
    if (this.state === 'calm') {
      if (this.grace > 0) {
        this.grace = Math.max(0, this.grace - dt);
        this.annoyance = Math.max(0, this.annoyance - NEIGHBOR.calmPerSecond * dt);
        return;
      }
      const over = noise - NEIGHBOR.quietLimit;
      const change = over > 0 ? over * NEIGHBOR.annoyPerPoint : -NEIGHBOR.calmPerSecond;
      this.annoyance = Math.min(100, Math.max(0, this.annoyance + change * dt));
      if (this.annoyance >= NEIGHBOR.warnAt && !this.warned) this.bangOnWall();
      if (this.annoyance < NEIGHBOR.warnAt - 20) this.warned = false;
      if (this.annoyance >= 100) this.startComing();
    } else if (this.state === 'coming') {
      this.timer -= dt;
      this.countdown.setText(`Neighbor at the door in ${Math.ceil(Math.max(0, this.timer))}s`);
      this.knockTimer -= dt;
      if (this.knockTimer <= 0) {
        this.knockTimer = 2;
        this.scene.floatText('KNOCK KNOCK', DOOR.x, DOOR.y - 150, '#fde68a');
      }
      if (this.timer <= 0) this.arrive();
    } else if (this.state === 'visiting') {
      this.timer -= dt;
      this.figure.y = DOOR.y + Math.sin(this.scene.time.now / 300) * 1.5;
      if (this.timer <= 0) this.leave();
    }
  }

  bangOnWall() {
    this.warned = true;
    this.scene.cameras.main.shake(220, 0.006);
    this.scene.floatText('BANG! BANG!', WALL.x, WALL.y, '#fca5a5');
    this.scene.time.delayedCall(500, () => this.scene.floatText('Keep it down!', WALL.x + 20, WALL.y + 40, '#fca5a5'));
    this.scene.events.emit('neighbor-warning');
  }

  startComing() {
    this.state = 'coming';
    this.timer = NEIGHBOR.comingSeconds;
    this.knockTimer = 0;
    this.countdown.setVisible(true);
    this.scene.events.emit('neighbor-coming');
  }

  arrive() {
    this.state = 'visiting';
    this.countdown.setVisible(false);
    this.figure.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.figure, alpha: 1, duration: 300 });
    const running = this.scene.runningMachines();
    if (running.length) {
      const fine = fineFor(this.complaints);
      this.complaints += 1;
      const paid = gameState.charge(fine);
      this.say('Keep it DOWN!');
      this.timer = NEIGHBOR.caughtSeconds;
      this.scene.events.emit('neighbor-complaint', { fine, paid, next: fineFor(this.complaints), running: running.length });
    } else {
      this.say('...Fine. Thanks.');
      this.timer = NEIGHBOR.checkSeconds;
      this.scene.events.emit('neighbor-satisfied');
    }
  }

  say(text) {
    this.bubble.setText(text).setVisible(true);
  }

  leave() {
    this.state = 'leaving';
    this.bubble.setVisible(false);
    this.scene.tweens.add({
      targets: this.figure, alpha: 0, duration: 500,
      onComplete: () => {
        this.figure.setVisible(false);
        this.state = 'calm';
        this.annoyance = 0;
        this.warned = false;
        this.grace = NEIGHBOR.graceSeconds;
        this.scene.events.emit('neighbor-left');
      },
    });
  }

  /** Called when loading a save. A visit that was in progress starts over with a fresh countdown. */
  restore({ annoyance, complaints, grace, visit }) {
    this.annoyance = annoyance;
    this.complaints = complaints;
    this.grace = grace;
    this.warned = annoyance >= NEIGHBOR.warnAt;
    if (visit) this.startComing();
  }

  get saveState() {
    return {
      annoyance: Math.round(this.annoyance),
      complaints: this.complaints,
      grace: Math.ceil(this.grace),
      visit: this.state === 'coming' || this.state === 'visiting',
    };
  }
}
