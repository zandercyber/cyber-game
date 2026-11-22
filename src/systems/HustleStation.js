// A workstation you stand at to do quick jobs ("hustles").
// - Stand still at it and you work automatically; each job pays into a cash
//   pile on the desk.
// - Working heats the machine. At 100% it overheats and must fully cool down,
//   so you can't stay at one machine forever.
// - When the pile is full, work pauses until you carry the cash away.

const BAR_W = 170;
const FONT = 'system-ui, sans-serif';
const STATUS_COLORS = { job: '#0b0e14cc', hot: '#7f1d1dee', full: '#78350fee' };

export class HustleStation {
  constructor(scene, { panelX, panelY, screen, pile, hustles, heat, pileMax }) {
    this.scene = scene;
    this.hustles = hustles;
    this.heatCfg = heat;
    this.pileMax = pileMax;
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
    this.panel.add([this.title, barBg(14, 10), this.progressFill, barBg(30, 8), this.heatFill, heatLabel]);

    // Red glow on the laptop screen while it's overheated.
    this.glow = scene.add.rectangle(screen.x, screen.y, screen.w, screen.h, 0xff3b30, 0)
      .setDepth(-9000);
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

  get pileFull() {
    return this.pile >= this.pileMax;
  }

  /**
   * Advances work and heat. canWork: the player is standing at the desk with
   * free hands. Returns true while the player should be shown typing.
   */
  update(dt, { canWork, near, handsFull }) {
    const h = this.heatCfg;
    if (this.overheated) {
      this.heat = Math.max(0, this.heat - h.perSecondCooling * dt);
      if (this.heat === 0) this.overheated = false;
      this.working = false;
    } else if (canWork && !this.pileFull) {
      this.working = true;
      this.progress += dt / this.job.seconds;
      this.heat = Math.min(100, this.heat + h.perSecondWorking * dt);
      if (this.progress >= 1) this.finishJob();
      if (this.heat >= 100) {
        this.overheated = true;
        this.working = false;
      }
    } else {
      this.working = false;
      this.heat = Math.max(0, this.heat - h.idleCooling * dt);
    }

    this.render(dt, { near, handsFull });
    return this.working;
  }

  finishJob() {
    const pay = this.job.pay;
    this.pile = Math.min(this.pileMax, this.pile + pay);
    this.progress = 0;
    this.job = this.pickJob();
    this.scene.events.emit('hustle-done', pay);
    this.floatText(`+$${pay}`, this.pilePos.x, this.pilePos.y - 40, '#b8ffcf');
    this.renderPile();
  }

  /** Hands the whole desk pile to the player. Returns the amount taken. */
  takePile() {
    const amount = this.pile;
    this.pile = 0;
    this.renderPile();
    return amount;
  }

  render(dt, { near, handsFull }) {
    this.panel.setVisible(near || this.overheated);
    this.progressFill.width = Math.min(1, this.progress) * BAR_W;
    this.heatFill.width = (this.heat / 100) * BAR_W;
    this.heatFill.fillColor = this.overheated || this.heat > 80 ? 0xef4444 : this.heat > 50 ? 0xf97316 : 0xf59e0b;

    let text = this.job.name;
    let bg = STATUS_COLORS.job;
    if (this.overheated) {
      text = `Overheated! Cooling down… ${Math.ceil(this.heat / this.heatCfg.perSecondCooling)}s`;
      bg = STATUS_COLORS.hot;
    } else if (handsFull) {
      text = 'Hands full: stash your cash first';
      bg = STATUS_COLORS.full;
    } else if (this.pileFull) {
      text = 'Cash pile full: take it to your stash';
      bg = STATUS_COLORS.full;
    }
    if (this.title.text !== text) this.title.setText(text);
    this.title.setBackgroundColor(bg);

    // Overheat effects: pulsing red screen and steam puffs.
    if (this.overheated) {
      this.glow.setAlpha(0.25 + 0.2 * Math.sin(this.scene.time.now / 150));
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.22;
        this.puff();
      }
    } else {
      this.glow.setAlpha(0);
    }
  }

  puff() {
    const { x, y } = this.screen;
    const p = this.scene.add.circle(x + (Math.random() - 0.5) * 40, y - 10, 5 + Math.random() * 4, 0xdbe4ee, 0.75)
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
        .setDepth(-8999 + i);
      this.pileSprites.push(s);
    }
    while (this.pileSprites.length > wanted) this.pileSprites.pop().destroy();
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
