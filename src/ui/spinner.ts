import { c } from './colors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private message: string;
  private timer: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private isTTY: boolean;

  constructor(initialMessage = 'Scanning...') {
    this.message = initialMessage;
    this.isTTY = Boolean(process.stdout && process.stdout.isTTY);
  }

  start(message?: string): this {
    if (message) this.message = message;
    if (!this.isTTY) return this;

    this.frameIndex = 0;
    process.stdout.write('\x1b[?25l'); // hide cursor
    this.render();

    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length;
      this.render();
    }, 80);

    return this;
  }

  update(message: string): this {
    this.message = message;
    if (this.isTTY && this.timer) {
      this.render();
    }
    return this;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      process.stdout.write('\r\x1b[K\x1b[?25h'); // clear line & restore cursor
    }
  }

  succeed(message?: string): void {
    this.stop();
    const finalMsg = message || this.message;
    if (this.isTTY) {
      process.stdout.write(`${c.brightGreen('✔')} ${finalMsg}\n`);
    }
  }

  fail(message?: string): void {
    this.stop();
    const finalMsg = message || this.message;
    if (this.isTTY) {
      process.stdout.write(`${c.red('✖')} ${finalMsg}\n`);
    }
  }

  private render(): void {
    const frame = c.cyan(FRAMES[this.frameIndex]);
    process.stdout.write(`\r\x1b[K${frame} ${this.message}`);
  }
}

export function createSpinner(message?: string): Spinner {
  return new Spinner(message);
}
