/** Spend fewer pixels on the globe if frames are consistently late. Text and
 * map sprites stay at native resolution, as do the offscreen poster exports. */
export class PixelBudget {
  private seconds = 0;
  private frames = 0;
  private headroom = 0;

  sample(dt: number, ratio: number, ceiling: number): number {
    if (!(dt > 0) || dt > 0.25) {
      this.seconds = this.frames = this.headroom = 0;
      return ratio;
    }
    this.seconds += dt;
    this.frames++;
    if (this.seconds < 1.25) return ratio;
    const average = this.seconds / this.frames;
    this.headroom = average < 0.0175 ? this.headroom + this.seconds : 0;
    this.frames = this.seconds = 0;
    if (average > 0.025) return Math.max(Math.min(0.8, ceiling), ratio - 0.2);
    if (this.headroom >= 10) {
      this.headroom = 0;
      return Math.min(ceiling, ratio + 0.1);
    }
    return ratio;
  }
}
