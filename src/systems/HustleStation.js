// A machine that does jobs and pays into a cash pile next to it.
// - 'work' machines: stand still at it and you work automatically.
// - 'idle' machines: do jobs on their own while there's room in the pile.
// - Working heats the machine. At 100% it overheats and must fully cool down,
//   so you can't stay at one machine forever.
// - When the pile is full, work pauses until you carry the cash away.
// - With no power (breaker tripped) nothing runs; the machine just cools.
// - When you (not a helper) finish a job, a security question can pop up first:
//   right = double pay, wrong or too slow = the job fails (see DormScene.askQuestion).
// - A power surge can fry it. A fried machine smokes and earns nothing until
//   you stand at it (with the power on) to repair it.

const BAR_W = 170;
const FONT = 'system-ui, sans-serif';
const STATUS_COLORS = { job: '#0b0e14cc', hot: '#7f1d1dee', full: '#78350fee', quiz: '#0e7490ee' };
const REPAIR_SECONDS = 3;

export class HustleStation {
  constructor(scene, { panelX, panelY, screen, pile, hustles, heat, pileMax, idle = false, payMultiplier = 1, sprite = null, group = null }) {
    this.scene = scene;
    this.hustles = hustles;
    this.heatCfg = heat; // null = this machine doesn't heat up
    this.pileMax = pileMax;
    this.idle = idle;
    this.payMultiplier = payMultiplier;
    this.enabled = true; // the corner desk switches off when it becomes the shop
    this.powered = true; // false while the breaker is tripped
    this.sprite = sprite; // the machine's picture (darkened while fried)
    this.broken = false; // fried by a power surge
    this.group = group; // which security questions it asks ('helpdesk' | 'web' | 'ai')
    this.awaiting = null; // a finished job waiting on your answer: { bonus }
    this.repairProgress = 0;
    this.screen = screen; // where the laptop screen is (for glow and steam)
    this.pilePos = pile; // where cash stacks up on the desk

    this.heat = 0;
    this.overheated = false;
    this.progress = 0;
    this.pile = 0;
    this.working = false;
    this.job = this.pickJob();

    // Panel above the desk: job name, progress bar, heat bar.
    this.panel = scene.add.container(panelX, panelY).setDepth(12500).setVisible(false);
    this.title = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#e6f4ff',
      backgroundColor: STATUS_COLORS.job, padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1);
    const barBg = (y, h) => scene.add.rectangle(-BAR_W / 2, y, BAR_W, h, 0x0b0e14, 0.8).setOrigin(0, 0.5);
    this.progressFill = scene.add.rectangle(-BAR_W / 2, 14, 0, 10, 0x5ff0ff).setOrigin(0, 0.5);
    this.heatFill = scene.add.rectangle(-BAR_W / 2, 30, 0, 8, 0xf59e0b).setOrigin(0, 0.5);
    const heatLabel = scene.add.text(-BAR_W / 2 - 8, 30, 'HEAT', {
      fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#fbbf24',
    }).setOrigin(1, 0.5);
    this.panel.add([this.title, barBg(14, 10), this.progressFill]);
    if (heat) this.panel.add([barBg(30, 8), this.heatFill, heatLabel]);
    else { this.heatFill.destroy(); heatLabel.destroy(); }

    // Red glow on the screen while it's overheated.
    this.glow = screen && heat
      ? scene.add.rectangle(screen.x, screen.y, screen.w, screen.h, 0xff3b30, 0).setDepth(screen.depth ?? -9000)
      : null;
    this.steamTimer = 0;

    // Cash stacks on the desk.
    this.pileSprites = [];
  }

  pickJob() {
    let next;
    do {
      next = this.hustles[Math.floor(Math.random() * this.hustles.length)];
    } while (this.hustles.length > 1 && next === this.job);
    return next;
  }

  /** Average cash per second while worked (helpers use it to pick machines). */
  get payRate() {
    const pay = this.hustles.reduce((sum, j) => sum + j.pay, 0);
    const seconds = this.hustles.reduce((sum, j) => sum + j.seconds, 0);
    return (pay * this.payMultiplier) / seconds;
  }

  get pileFull() {
    return this.pile >= this.pileMax;
  }

  /**
   * Advances work and heat. canWork: someone is working it (the player
   * standing at it with free hands, or a helper like Augustus).
   * rate: job speed (1 = the player); bonus: pay multiplier for finished jobs;
   * helper: true when a helper is the one working (helpers don't repair).
   * Returns true while someone is working it.
   */
  update(dt, { canWork, near, handsFull, rate = 1, bonus = 1, helper = false }) {
    const h = this.heatCfg;
    if (!this.enabled) {
      this.working = false;
      this.panel.setVisible(false);
      return false;
    }
    if (this.broken) return this.updateBroken(dt, { canWork: canWork && !helper, near, handsFull });
    if (this.awaiting) {
      // Paused on a security question; it just cools while you answer.
      this.working = false;
      if (h) this.heat = Math.max(0, this.heat - h.idleCooling * dt);
      this.render(dt, { near, handsFull: false });
      return false;
    }
    if (!this.powered) {
      // No power: no work, no progress. It only cools down.
      this.working = false;
      if (h) {
        this.heat = Math.max(0, this.heat - (this.overheated ? h.perSecondCooling : h.idleCooling) * dt);
        if (this.heat === 0) this.overheated = false;
      }
      this.render(dt, { near, handsFull: false });
      return false;
    }
    if (this.idle) {
      // Runs on its own; the player isn't needed (or shown working).
      if (!this.pileFull) {
        this.progress += dt / this.job.seconds;
        if (this.progress >= 1) this.finishJob(bonus, true); // nobody to quiz
      }
      this.render(dt, { near, handsFull: false });
      return false;
    }
    if (this.overheated) {
      this.heat = Math.max(0, this.heat - h.perSecondCooling * dt);
      if (this.heat === 0) this.overheated = false;
      this.working = false;
    } else if (canWork && !this.pileFull) {
      this.working = true;
      this.progress += (dt * rate) / this.job.seconds;
      if (h) this.heat = Math.min(100, this.heat + h.perSecondWorking * dt);
      if (this.progress >= 1) this.finishJob(bonus, helper);
      if (h && this.heat >= 100) {
        this.overheated = true;
        this.working = false;
      }
    } else {
      this.working = false;
      if (h) this.heat = Math.max(0, this.heat - h.idleCooling * dt);
    }

    this.render(dt, { near, handsFull });
    return this.working;
  }

  // Fried: smokes and cools. Standing at it with the power on repairs it.
  updateBroken(dt, { canWork, near, handsFull }) {
    const h = this.heatCfg;
    if (h) {
      this.heat = Math.max(0, this.heat - (this.overheated ? h.perSecondCooling : h.idleCooling) * dt);
      if (this.heat === 0) this.overheated = false;
    }
    this.working = this.powered && canWork;
    if (this.working) {
      this.repairProgress += dt / REPAIR_SECONDS;
      if (this.repairProgress >= 1) this.setBroken(false);
    }
    this.render(dt, { near, handsFull });
    return this.working;
  }

  /** Fries or repairs the machine. quiet: no effects (used when loading a save). */
  setBroken(on, { quiet = false } = {}) {
    this.broken = on;
    this.repairProgress = 0;
    this.working = false;
    if (on) {
      this.progress = 0; // the job it was doing is lost
      this.sprite?.setTint(0x6b6b6b);
      if (!quiet) this.floatText('FRIED!', this.panel.x, this.panel.y - 40, '#f87171');
    } else {
      this.sprite?.clearTint();
      if (!quiet) {
        this.floatText('Fixed!', this.panel.x, this.panel.y - 40, '#4ade80');
        this.scene.events.emit('machine-repaired');
      }
    }
  }

  finishJob(bonus = 1, helper = false) {
    if (!helper && this.group && this.scene.askQuestion?.(this)) {
      this.awaiting = { bonus };
      this.working = false;
      return;
    }
    this.payJob(bonus);
  }

  /** Your answer to this job's security question. Returns what it paid (0 if it failed). */
  resolveQuestion(correct) {
    if (!this.awaiting) return 0;
    const { bonus } = this.awaiting;
    this.awaiting = null;
    if (correct) return this.payJob(bonus * 2);
    this.progress = 0;
    this.job = this.pickJob();
    this.floatText('Job failed', this.pilePos.x, this.pilePos.y - 40, '#fca5a5');
    return 0;
  }

  payJob(bonus = 1) {
    const pay = Math.round(this.job.pay * this.payMultiplier * bonus);
    this.pile = Math.min(this.pileMax, this.pile + pay);
    this.progress = 0;
    this.job = this.pickJob();
    this.scene.events.emit('hustle-done', pay);
    this.floatText(`+$${pay}`, this.pilePos.x, this.pilePos.y - 40, '#b8ffcf');
    this.renderPile();
    return pay;
  }

  /** Hands the whole desk pile over. Returns the amount taken. */
  takePile() {
    return this.takeFromPile(Infinity);
  }

  /** Takes up to `max` from the pile (what fits in your hands). Returns the amount taken. */
  takeFromPile(max) {
    const amount = Math.min(this.pile, max);
    this.pile -= amount;
    this.renderPile();
    return amount;
  }

  render(dt, { near, handsFull }) {
    this.panel.setVisible(near || this.broken || (this.overheated && this.powered));
    this.progressFill.width = Math.min(1, this.broken ? this.repairProgress : this.progress) * BAR_W;
    this.progressFill.fillColor = this.broken ? 0xf97316 : 0x5ff0ff;
    if (this.heatCfg) {
      this.heatFill.width = (this.heat / 100) * BAR_W;
      this.heatFill.fillColor = this.overheated || this.heat > 80 ? 0xef4444 : this.heat > 50 ? 0xf97316 : 0xf59e0b;
    }

    let text = this.job.name;
    let bg = STATUS_COLORS.job;
    if (this.awaiting) {
      text = 'Security check! Answer the question';
      bg = STATUS_COLORS.quiz;
    } else if (this.broken) {
      if (!near) text = 'FRIED'; // short from afar, so several fried machines don't clutter the room
      else if (!this.powered) text = 'Fried! Reset the breaker first';
      else if (this.repairProgress > 0) text = `Repairing… ${Math.floor(this.repairProgress * 100)}%`;
      else if (handsFull) text = 'Fried! Free your hands to repair';
      else text = 'Fried! Stand here to repair';
      bg = STATUS_COLORS.hot;
    } else if (!this.powered) {
      text = 'No power: reset the breaker';
      bg = STATUS_COLORS.hot;
    } else if (this.overheated) {
      text = `Overheated! Cooling down… ${Math.ceil(this.heat / this.heatCfg.perSecondCooling)}s`;
      bg = STATUS_COLORS.hot;
    } else if (handsFull) {
      text = 'Hands full: stash your cash first';
      bg = STATUS_COLORS.full;
    } else if (this.pileFull) {
      text = 'Cash pile full: collect it';
      bg = STATUS_COLORS.full;
    }
    if (this.title.text !== text) this.title.setText(text);
    this.title.setBackgroundColor(bg);

    // Overheat effects: pulsing red screen and steam puffs.
    if (this.overheated && this.powered && this.glow) {
      this.glow.setAlpha(0.25 + 0.2 * Math.sin(this.scene.time.now / 150));
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.22;
        this.puff();
      }
    } else if (this.glow) {
      this.glow.setAlpha(0);
    }
    // Fried: dark smoke.
    if (this.broken) {
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.25;
        this.puff(0x71717a, 8, true);
      }
    }
  }

  puff(color = 0xdbe4ee, size = 5, fromBody = false) {
    if (!this.screen) return;
    // Steam comes off the screen; smoke billows from the middle of the machine
    // (so it doesn't hide behind the info panel above it).
    const body = fromBody && this.sprite;
    const x = body ? this.sprite.x : this.screen.x;
    const y = body ? this.sprite.y - this.sprite.height * 0.5 : this.screen.y;
    const p = this.scene.add.circle(x + (Math.random() - 0.5) * 50, y - 10, size + Math.random() * size * 0.8, color, 0.8)
      .setDepth(12400);
    this.scene.tweens.add({
      targets: p, y: p.y - 45, alpha: 0, scale: 1.8, duration: 1100, ease: 'Sine.out',
      onComplete: () => p.destroy(),
    });
  }

  // One cash stack image per $8 on the desk, stacked upward.
  renderPile() {
    const wanted = this.pile > 0 ? Math.ceil(this.pile / 8) : 0;
    while (this.pileSprites.length < wanted) {
      const i = this.pileSprites.length;
      const s = this.scene.add.image(this.pilePos.x + (i % 2) * 14, this.pilePos.y - Math.floor(i / 2) * 9, 'item-cash')
        .setScale(0.8)
        .setOrigin(0.5, 1)
        .setDepth((this.pilePos.depth ?? -8999) + i);
      this.pileSprites.push(s);
    }
    while (this.pileSprites.length > wanted) this.pileSprites.pop().destroy();
  }

  /** Removes everything this station drew (for when its item is removed). */
  destroy() {
    this.panel.destroy();
    this.glow?.destroy();
    for (const s of this.pileSprites) s.destroy();
    this.pileSprites = [];
  }

  floatText(text, x, y, color) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color, stroke: '#0b0e14', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(13000);
    this.scene.tweens.add({
      targets: t, y: y - 40, alpha: 0, duration: 1000, ease: 'Sine.out', onComplete: () => t.destroy(),
    });
  }
}
