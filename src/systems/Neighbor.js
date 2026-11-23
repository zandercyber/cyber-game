// The neighbor next door (numbers in src/data/neighbor.js). He shows up at your window.
//   calm     -> loses patience while you make noise (faster when louder); bangs on the wall halfway
//   coming   -> the blinds go up and he knocks on the glass: switch every machine off before the countdown ends
//   visiting -> looks in; anything still running = a noise fine (pointing), all quiet = arms crossed
//   leaving  -> turns and walks off, the blinds come back down; patience starts over
// Art: src/assets/neighbor/neighbor.png, 38x52 frames drawn at 2x (the player's size):
//   0 knocking (faces left, into the room), 1 arms crossed, 2 pointing, 3 walking away.
// window-open.png is the room's window with the blinds rolled up and the glass cut out;
// window-sky.png sits behind it, and he stands between the two, so the sill hides his legs.

import { NEIGHBOR, fineFor, noiseLevel } from '../data/neighbor.js';
import { FOAM_QUIET_PER_LEVEL } from '../data/catalog.js';
import { gameState } from '../state/GameState.js';

const FONT = 'system-ui, sans-serif';
const WINDOW = { x: 1185, y: 150 }; // top-left of the window overlay (room pixels)
const SPOT = { x: 1257, y: 396 }; // where he stands outside, feet below the sill
const KNOCK_X = 1265; // a bit to the right while knocking, so his fist is on the glass
const WALL = { x: 170, y: 210 }; // where the banging comes from (their side of the wall)
const FRAME = { knock: 0, crossed: 1, pointing: 2, away: 3 };
const DEPTH = -9000; // just in front of the room picture, behind everything else

export class Neighbor {
  constructor(scene) {
    this.scene = scene;
    this.state = 'calm';
    this.annoyance = 0; // 0..100
    this.complaints = 0;
    this.timer = 0;
    this.warned = false;
    this.knockTimer = 0;

    // Sky, then him, then the window frame on top (only shown while he's there).
    this.sky = scene.add.image(WINDOW.x, WINDOW.y, 'window-sky').setOrigin(0).setDepth(DEPTH).setVisible(false);
    this.figure = scene.add.sprite(SPOT.x, SPOT.y, 'neighbor', FRAME.knock)
      .setOrigin(0.5, 1).setScale(2).setDepth(DEPTH + 1).setVisible(false);
    this.window = scene.add.image(WINDOW.x, WINDOW.y, 'window-open').setOrigin(0).setDepth(DEPTH + 2).setVisible(false);

    // What he says, just left of the window.
    this.bubble = scene.add.text(WINDOW.x - 4, 262, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#0b0e14', backgroundColor: '#f8fafc', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0.5).setDepth(12600).setVisible(false);
    this.countdown = scene.add.text(812, 70, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fde68a', backgroundColor: '#0b0e14dd', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(12600).setVisible(false);
  }

  /** How fast noise wears out his patience compared to usual: x2 at night (quiet hours), -10% per foam level. */
  get sensitivity() {
    const night = this.scene.clock?.night ? NEIGHBOR.nightMultiplier : 1;
    const foam = 1 - FOAM_QUIET_PER_LEVEL * (this.scene.foamLevel ?? 0);
    return night * foam;
  }

  /** True while you're supposed to be quiet (he's knocking or at the window). */
  get quiet() {
    return this.state === 'coming' || this.state === 'visiting';
  }

  /** noise: what your machines are making right now. */
  update(dt, noise) {
    if (this.state === 'calm') {
      // Louder = patience runs out sooner (NOISE_LEVELS), twice as fast during quiet hours,
      // a bit slower with foam panels up; silence slowly earns it back.
      const level = noiseLevel(noise);
      const change = level ? (100 / level.visitEvery) * this.sensitivity : -NEIGHBOR.calmPerSecond;
      this.annoyance = Math.min(100, Math.max(0, this.annoyance + change * dt));
      if (this.annoyance >= NEIGHBOR.warnAt && !this.warned) this.bangOnWall();
      if (this.annoyance < NEIGHBOR.warnAt - 20) this.warned = false;
      if (this.annoyance >= 100) this.startComing();
    } else if (this.state === 'coming') {
      this.timer -= dt;
      this.countdown.setText(`He's knocking! Quiet down in ${Math.ceil(Math.max(0, this.timer))}s`);
      this.knockTimer -= dt;
      if (this.knockTimer <= 0) {
        this.knockTimer = 2;
        this.knock();
      }
      if (this.timer <= 0) this.arrive();
    } else if (this.state === 'visiting') {
      this.timer -= dt;
      this.figure.y = SPOT.y + Math.round(Math.sin(this.scene.time.now / 300) * 1.5);
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
    this.knockTimer = 0.6; // first knock once he's up at the glass
    this.countdown.setVisible(true);
    this.showWindow(true);
    this.sky.setTexture((this.scene.clock?.darkness ?? 0) >= 0.5 ? 'window-sky-night' : 'window-sky');
    // He steps up into view from below the sill.
    const s = this.scene;
    s.tweens.killTweensOf(this.figure);
    this.figure.setFrame(FRAME.knock).setPosition(KNOCK_X, SPOT.y + 70).setAlpha(1).setVisible(true);
    s.tweens.add({ targets: this.figure, y: SPOT.y, duration: 450, ease: 'Back.out' });
    s.events.emit('neighbor-coming');
  }

  // Tap tap tap on the glass.
  knock() {
    const s = this.scene;
    if (!s.tweens.isTweening(this.figure)) {
      s.tweens.add({ targets: this.figure, x: KNOCK_X - 3, duration: 70, yoyo: true, repeat: 2, onComplete: () => { this.figure.x = KNOCK_X; } });
    }
    s.floatText('KNOCK KNOCK', WINDOW.x - 60, 215, '#fde68a');
  }

  showWindow(open) {
    this.sky.setVisible(open);
    this.window.setVisible(open);
  }

  arrive() {
    this.state = 'visiting';
    this.countdown.setVisible(false);
    this.scene.tweens.killTweensOf(this.figure);
    this.figure.setPosition(SPOT.x, SPOT.y).setAlpha(1).setVisible(true);
    const running = this.scene.runningMachines();
    if (running.length) {
      const fine = fineFor(this.complaints);
      this.complaints += 1;
      const paid = gameState.charge(fine);
      this.figure.setFrame(FRAME.pointing);
      this.say('Keep it DOWN!');
      this.timer = NEIGHBOR.caughtSeconds;
      this.scene.events.emit('neighbor-complaint', { fine, paid, next: fineFor(this.complaints), running: running.length });
    } else {
      this.figure.setFrame(FRAME.crossed);
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
    this.annoyance = 0; // patience starts over (now, so a save during the exit can't bring him straight back)
    this.warned = false;
    this.bubble.setVisible(false);
    // He turns around and walks off; the blinds come back down after.
    this.figure.setFrame(FRAME.away);
    this.scene.tweens.killTweensOf(this.figure);
    this.scene.tweens.add({
      targets: this.figure, y: SPOT.y + 60, alpha: 0, duration: 700, ease: 'Sine.in',
      onComplete: () => {
        this.figure.setVisible(false);
        this.showWindow(false);
        this.state = 'calm';
        this.scene.events.emit('neighbor-left');
      },
    });
  }

  /** Called when loading a save. A visit that was in progress starts over with a fresh countdown. */
  restore({ annoyance, complaints, visit }) {
    this.annoyance = annoyance;
    this.complaints = complaints;
    this.warned = annoyance >= NEIGHBOR.warnAt;
    if (visit) this.startComing();
  }

  get saveState() {
    return {
      annoyance: Math.round(this.annoyance),
      complaints: this.complaints,
      visit: this.state === 'coming' || this.state === 'visiting',
    };
  }
}
