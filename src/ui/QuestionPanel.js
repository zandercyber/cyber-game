// The security question card. Shows a question with a 15 s timer and tappable
// answers; after you pick (or time runs out) it marks the right answer, shows
// the one-line explanation, and closes itself a few seconds later.
// Phishing emails use the same card (wider, with the email shown above the
// choices): their card brings its own title, rule line, timer and onAnswer.

import { QUESTION_SECONDS } from '../data/questions.js';

const FONT = 'system-ui, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace'; // addresses and links, so lookalike letters stand out
const CARD_W = 680;
const PAD = 20;
const LETTERS = ['A', 'B', 'C', 'D'];
const COLORS = { idle: 0x1e293b, right: 0x15803d, wrong: 0xb91c1c, dim: 0x1e293b };

export class QuestionPanel {
  constructor(scene, { onAnswer }) {
    this.scene = scene;
    this.onAnswer = onAnswer; // (pick | null) => { correct, pay }
    this.root = null;
    this.state = 'hidden'; // 'asking' | 'revealed' | 'hidden'
  }

  get visible() {
    return this.state !== 'hidden';
  }

  /**
   * question: { groupName, q, choices, correct, why } from DormScene.askQuestion.
   * Optional (email cards): title, rule, seconds, width, email { from, replyTo, subject, body, link, attach },
   * onAnswer (instead of the panel's), which returns { correct, text }.
   */
  show(question) {
    this.hide();
    const s = this.scene;
    this.question = question;
    this.state = 'asking';
    this.seconds = question.seconds ?? QUESTION_SECONDS;
    this.endsAt = s.time.now + this.seconds * 1000;
    const W = question.width ?? CARD_W;
    const BTN_W = W - PAD * 2;
    this.w = W;
    this.barW = BTN_W;

    const root = s.add.container(0, 0).setDepth(35000);
    this.root = root;
    let y = PAD;
    const title = s.add.text(PAD, y, question.title ?? `Security check · ${question.groupName}`, {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#5ff0ff',
    });
    this.timerText = s.add.text(W - PAD, y + 2, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fde68a' }).setOrigin(1, 0);
    y += 34;
    this.barBg = s.add.rectangle(PAD, y, BTN_W, 8, 0xffffff, 0.12).setOrigin(0, 0);
    this.bar = s.add.rectangle(PAD, y, BTN_W, 8, 0xfde68a).setOrigin(0, 0);
    y += 16;
    const rule = s.add.text(PAD, y, question.rule ?? 'Right answer: double pay. Wrong or too slow: the job fails.', {
      fontFamily: FONT, fontSize: '15px', color: '#94a3b8',
    });
    y += 28;
    root.add([title, this.timerText, this.barBg, this.bar, rule]);
    if (question.email) y = this.addEmail(root, question.email, y, BTN_W) + 14;
    const q = s.add.text(PAD, y, question.q, {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#e6f4ff', wordWrap: { width: BTN_W }, lineSpacing: 3,
    });
    y += q.height + 16;
    root.add(q);

    // Answer buttons, sized to their text.
    this.buttons = question.choices.map((choice, i) => {
      const label = s.add.text(PAD + 16, 0, `${LETTERS[i]}   ${choice}`, {
        fontFamily: FONT, fontSize: '17px', color: '#e6f4ff', wordWrap: { width: BTN_W - 32 },
      });
      const h = Math.max(48, label.height + 22);
      const bg = s.add.rectangle(PAD, y, BTN_W, h, COLORS.idle).setOrigin(0, 0)
        .setStrokeStyle(2, 0x5ff0ff, 0.35)
        .setInteractive({ useHandCursor: true });
      label.setY(y + (h - label.height) / 2);
      bg.on('pointerup', () => this.pick(i));
      root.add([bg, label]);
      y += h + 10;
      return { bg, label };
    });

    // Filled in after you answer.
    this.result = s.add.text(PAD, y + 2, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#4ade80' });
    this.why = s.add.text(PAD, y + 34, question.why, {
      fontFamily: FONT, fontSize: '16px', color: '#cbd5e1', wordWrap: { width: BTN_W }, lineSpacing: 3,
    });
    this.closeHint = s.add.text(W - PAD, y + 6, 'Tap to close', { fontFamily: FONT, fontSize: '14px', color: '#64748b' }).setOrigin(1, 0);
    this.result.setVisible(false);
    this.why.setVisible(false);
    this.closeHint.setVisible(false);
    root.add([this.result, this.why, this.closeHint]);
    const fullHeight = y + 34 + this.why.height + PAD;

    // Background sized to fit, centered on screen.
    this.height = fullHeight;
    const bg = s.add.graphics();
    bg.fillStyle(0x0b0e14, 0.96);
    bg.fillRoundedRect(0, 0, W, this.height, 14);
    bg.lineStyle(3, 0x5ff0ff, 0.8);
    bg.strokeRoundedRect(0, 0, W, this.height, 14);
    root.addAt(bg, 0);
    this.x = (s.scale.width - W) / 2;
    this.y = Math.max(10, (s.scale.height - this.height) / 2);
    root.setPosition(this.x, this.y);
    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 180 });
  }

  /** The email itself, in an inbox-style box. Returns the y below it. */
  addEmail(root, email, top, width) {
    const s = this.scene;
    const items = [];
    let y = top + 12;
    const field = (label, value, color = '#e6f4ff') => {
      const l = s.add.text(PAD + 14, y, label, { fontFamily: FONT, fontSize: '16px', color: '#94a3b8' });
      const v = s.add.text(PAD + 104, y, value, {
        fontFamily: MONO, fontSize: '16px', color, wordWrap: { width: width - 120, useAdvancedWrap: true },
      });
      items.push(l, v);
      y += Math.max(l.height, v.height) + 6;
    };
    field('From', email.from);
    if (email.replyTo) field('Reply-to', email.replyTo, '#fde68a');
    const subject = s.add.text(PAD + 14, y + 2, email.subject, {
      fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#f8fafc', wordWrap: { width: width - 28 },
    });
    y += subject.height + 10;
    const body = s.add.text(PAD + 14, y, email.body, {
      fontFamily: FONT, fontSize: '17px', color: '#cbd5e1', wordWrap: { width: width - 28 }, lineSpacing: 3,
    });
    y += body.height + 8;
    items.push(subject, body);
    if (email.link) field('Link to', email.link, '#7dd3fc');
    if (email.attach) field('Attached', email.attach, '#fdba74');
    y += 6;
    const box = s.add.rectangle(PAD, top, width, y - top, 0x111827, 1).setOrigin(0, 0).setStrokeStyle(1, 0x475569, 1);
    root.add([box, ...items]);
    return y;
  }

  pick(index) {
    if (this.state !== 'asking') return;
    this.state = 'revealed';
    const handler = this.question.onAnswer ?? this.onAnswer;
    const { correct, pay, text: told } = handler(index) ?? { correct: false, pay: 0 };
    const right = this.question.correct;
    this.buttons.forEach(({ bg, label }, i) => {
      bg.disableInteractive();
      if (i === right) bg.setFillStyle(COLORS.right).setStrokeStyle(2, 0x4ade80, 1);
      else if (i === index) bg.setFillStyle(COLORS.wrong).setStrokeStyle(2, 0xf87171, 1);
      else label.setAlpha(0.45);
    });
    let text = told ?? `Correct! Double pay: +$${pay}`;
    if (!told && !correct) text = index === null ? 'Too slow: the job failed' : 'Not quite: the job failed';
    this.result.setText(text).setColor(correct ? '#4ade80' : '#fca5a5').setVisible(true);
    this.why.setVisible(true);
    this.closeHint.setVisible(true);
    this.timerText.setText('');
    this.bar.setVisible(false);
    this.barBg.setVisible(false);
    // Tap the card to close it, or it closes on its own.
    this.closeAt = this.scene.time.now + 6000;
  }

  update() {
    if (this.state === 'asking') {
      const left = Math.max(0, this.endsAt - this.scene.time.now) / 1000;
      this.bar.width = (left / this.seconds) * this.barW;
      this.bar.fillColor = left < 5 ? 0xf87171 : 0xfde68a;
      this.timerText.setText(`${Math.ceil(left)}s`);
      if (left <= 0) this.pick(null);
    } else if (this.state === 'revealed' && this.scene.time.now >= this.closeAt) {
      this.hide();
    }
  }

  /** Keyboard: 1-4 or A-D pick an answer; any key closes the explanation. */
  key(event) {
    if (this.state === 'revealed') {
      this.hide();
      return;
    }
    if (this.state !== 'asking') return;
    const k = event.key.toLowerCase();
    const i = '1234'.includes(k) ? Number(k) - 1 : 'abcd'.indexOf(k);
    if (i >= 0 && i < this.question.choices.length) this.pick(i);
  }

  /** A tap on the card after answering closes it. */
  tap(pointer) {
    if (this.state !== 'revealed' || !this.contains(pointer)) return;
    this.hide();
    this.swallowUntil = this.scene.time.now + 500; // that tap shouldn't also walk you somewhere
  }

  hide() {
    this.root?.destroy();
    this.root = null;
    this.state = 'hidden';
  }

  /** True if the pointer is over the card, so taps there don't move the player. */
  contains(pointer) {
    if (this.scene.time.now < (this.swallowUntil ?? 0)) return true;
    return this.visible && pointer.x >= this.x && pointer.x <= this.x + this.w && pointer.y >= this.y && pointer.y <= this.y + this.height;
  }
}
