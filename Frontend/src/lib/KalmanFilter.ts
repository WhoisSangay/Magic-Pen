/**
 * Kalman Filter implementation for 2D point tracking
 * Smooths noisy measurements and predicts future positions to reduce lag
 */

export interface Point2D {
  x: number;
  y: number;
}

export class KalmanFilter2D {
  private x: number; // State: position x
  private y: number; // State: position y
  private vx: number; // State: velocity x
  private vy: number; // State: velocity y

  private Px: number; // Covariance: position x
  private Py: number; // Covariance: position y
  private Pvx: number; // Covariance: velocity x
  private Pvy: number; // Covariance: velocity y

  private q: number; // Process noise (motion uncertainty)
  private r: number; // Measurement noise (sensor uncertainty)

  constructor(
    initialX: number = 0,
    initialY: number = 0,
    q: number = 0.01, // Lower = trust motion model more, smoother
    r: number = 4.0 // Higher = trust measurements more, less smoothing
  ) {
    this.x = initialX;
    this.y = initialY;
    this.vx = 0;
    this.vy = 0;

    // Initialize covariance (uncertainty)
    this.Px = 1;
    this.Py = 1;
    this.Pvx = 1;
    this.Pvy = 1;

    this.q = q;
    this.r = r;
  }

  /**
   * Update filter with new measurement and return smoothed position
   */
  update(measuredX: number, measuredY: number, dt: number = 0.016): Point2D {
    // Predict step: project current state forward
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.Px += this.Pvx * dt + this.q;
    this.Py += this.Pvy * dt + this.q;
    this.Pvx += this.q;
    this.Pvy += this.q;

    // Update step: correct with measurement
    const Sx = this.Px + this.r;
    const Sy = this.Py + this.r;

    const Kx = this.Px / Sx;
    const Ky = this.Py / Sy;

    const innovationX = measuredX - this.x;
    const innovationY = measuredY - this.y;

    this.x += Kx * innovationX;
    this.y += Ky * innovationY;

    // Update velocity estimate from innovation
    this.vx += (Kx * innovationX) / Math.max(dt, 0.001);
    this.vy += (Ky * innovationY) / Math.max(dt, 0.001);

    // Update covariance
    this.Px *= 1 - Kx;
    this.Py *= 1 - Ky;

    return { x: this.x, y: this.y };
  }

  /**
   * Get predicted position at time dt in the future
   */
  predict(dt: number): Point2D {
    return {
      x: this.x + this.vx * dt,
      y: this.y + this.vy * dt
    };
  }

  /**
   * Get current smoothed position
   */
  getPosition(): Point2D {
    return { x: this.x, y: this.y };
  }

  /**
   * Reset filter to a new position
   */
  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.Px = 1;
    this.Py = 1;
  }
}

/**
 * Manage Kalman filters for all landmarks in a hand
 */
export class HandLandmarkTracker {
  private filters: KalmanFilter2D[];
  private lastUpdateTime: number = 0;
  private confidenceThreshold: number;

  constructor(numLandmarks: number = 21, confidenceThreshold: number = 0.5) {
    this.filters = Array.from({ length: numLandmarks }, () => new KalmanFilter2D());
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Update all landmarks with new detections
   */
  updateLandmarks(
    landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }>,
    currentTime: number
  ): Array<{ x: number; y: number }> {
    const dt = this.lastUpdateTime > 0 ? (currentTime - this.lastUpdateTime) / 1000 : 0.016;
    this.lastUpdateTime = currentTime;

    return landmarks.map((landmark, idx) => {
      if (idx >= this.filters.length) return landmark;

      // Only update if confidence is high enough (visibility > threshold)
      if (landmark.visibility !== undefined && landmark.visibility < this.confidenceThreshold) {
        // Return predicted position if detection is unreliable
        return this.filters[idx].predict(dt * 1.5);
      }

      // Update filter with new measurement
      return this.filters[idx].update(landmark.x, landmark.y, dt);
    });
  }

  /**
   * Get smoothed landmarks with optional prediction for next frame
   */
  getSmoothLandmarks(predictAhead: number = 0): Array<{ x: number; y: number }> {
    if (predictAhead > 0) {
      return this.filters.map(filter => filter.predict(predictAhead));
    }
    return this.filters.map(filter => filter.getPosition());
  }

  /**
   * Reset tracker (e.g., when hand is lost and redetected)
   */
  reset(): void {
    this.filters.forEach(filter => filter.reset(0, 0));
    this.lastUpdateTime = 0;
  }
}
